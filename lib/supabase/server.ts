import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * Server Component / Server Action 用。
 * Session 儲存在 httpOnly cookie（sb-access-token / sb-refresh-token）。
 */
export function getSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* Server Component 不允許 set，交給 middleware */
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            /* same */
          }
        }
      }
    }
  );
}

/**
 * Admin client（service role）— 只用在需要繞過 RLS 的場景，
 * 例如「建立/更新 LINE 使用者對應的 employee 欄位」「Storage 產生 signed URL」等。
 * 絕不能從 client component 呼叫。
 */
export function getSupabaseAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false }
    }
  );
}
