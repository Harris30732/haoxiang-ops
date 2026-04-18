import { NextRequest, NextResponse } from "next/server";
import { verifyLineIdToken } from "@/lib/line";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/exchange
 * body: { idToken: string }
 *
 * 流程：
 * 1. 驗 LIFF ID token → 拿 LINE userId
 * 2. 確認 employees 裡有對應的 active 員工；沒有 → 401
 * 3. 簽一個 Supabase JWT（sub = line_user_id）寫進 cookie
 * 4. 前端之後的 Supabase 請求都帶這個 cookie，RLS 的 auth.jwt() -> sub 就能用
 *
 * 此路由用 service role，僅 server 端。
 */
export async function POST(req: NextRequest) {
  const { idToken } = (await req.json()) as { idToken?: string };
  if (!idToken) {
    return NextResponse.json({ error: "missing id_token" }, { status: 400 });
  }

  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // 1. 驗 LINE
  let payload;
  try {
    payload = await verifyLineIdToken(idToken, channelId);
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_id_token", detail: String(e) },
      { status: 401 }
    );
  }
  const lineUserId = payload.sub;

  // 2. 查員工
  const admin = getSupabaseAdminClient();
  const { data: emp, error: qerr } = await admin
    .from("employees")
    .select("id, display_name, role, active")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (qerr) {
    return NextResponse.json({ error: "db_error", detail: qerr.message }, { status: 500 });
  }
  if (!emp || !emp.active) {
    return NextResponse.json({ error: "not_registered" }, { status: 403 });
  }

  // 3. 建一個 Supabase 使用者（若還沒建）並簽發 session
  //    這裡用 email = `${lineUserId}@line.local` 的虛擬 email 當 Supabase 主鍵
  const email = `${lineUserId}@line.local`;

  // upsert user
  const { data: existing } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1
    // (supabase-js v2 沒有直接 filter by email 的 admin API，接受這裡有 overhead；
    //  生產環境可改用 createUser + try/catch duplicate)
  });
  let userId = existing?.users.find((u) => u.email === email)?.id;

  if (!userId) {
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        line_user_id: lineUserId,
        display_name: payload.name ?? emp.display_name
      },
      app_metadata: { sub: lineUserId } // 讓 JWT 的 sub = line_user_id
    });
    if (cErr || !created.user) {
      return NextResponse.json(
        { error: "user_create_failed", detail: cErr?.message },
        { status: 500 }
      );
    }
    userId = created.user.id;
  }

  // Supabase admin API 目前沒有「直接為 user 簽發 session」的 public API；
  // 用 magic link token + verifyOtp 走「無密碼」路線最穩。
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email
    });
  if (linkErr || !linkData) {
    return NextResponse.json(
      { error: "link_failed", detail: linkErr?.message },
      { status: 500 }
    );
  }

  // verify otp 取得 session
  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) {
    return NextResponse.json({ error: "no_token_hash" }, { status: 500 });
  }

  const supa = getSupabaseServerClient();
  const { data: verified, error: vErr } = await supa.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash
  });
  if (vErr || !verified.session) {
    return NextResponse.json(
      { error: "otp_verify_failed", detail: vErr?.message },
      { status: 500 }
    );
  }

  // getSupabaseServerClient 的 cookies adapter 會自動把 session 寫進 cookie
  return NextResponse.json({
    employee: { id: emp.id, name: emp.display_name, role: emp.role }
  });
}
