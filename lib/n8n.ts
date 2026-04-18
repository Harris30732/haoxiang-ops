import crypto from "node:crypto";

/**
 * 發送 webhook 到 n8n，附 HMAC 簽章。
 * 失敗不 throw（webhook 掉一筆不能擋主流程），錯誤記到 console。
 */
export async function fireN8nWebhook(
  path: string,
  payload: Record<string, unknown>
): Promise<void> {
  const base = process.env.N8N_WEBHOOK_BASE;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!base || !secret) {
    console.warn("[n8n] missing env, skipping webhook", path);
    return;
  }

  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": `sha256=${signature}`
      },
      body,
      // n8n 可能慢，設一個合理 timeout
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
      console.warn(`[n8n] ${path} -> ${res.status}`);
    }
  } catch (err) {
    console.warn(`[n8n] ${path} fetch failed`, err);
  }
}
