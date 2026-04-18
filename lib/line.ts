/**
 * Server-side 驗證 LIFF ID token。
 * 文件：https://developers.line.biz/en/reference/line-login/#verify-id-token
 */
export type LineVerifiedPayload = {
  iss: string;
  sub: string;      // LINE userId
  aud: string;      // channel id
  exp: number;
  iat: number;
  name?: string;
  picture?: string;
  email?: string;
};

export async function verifyLineIdToken(
  idToken: string,
  channelId: string
): Promise<LineVerifiedPayload> {
  const body = new URLSearchParams({
    id_token: idToken,
    client_id: channelId
  });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`line verify failed: ${res.status} ${text}`);
  }
  return (await res.json()) as LineVerifiedPayload;
}
