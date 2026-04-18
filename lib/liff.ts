"use client";

import { useEffect, useState } from "react";

export type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  idToken: string | null;
  accessToken: string | null;
};

/**
 * LIFF 初始化 hook。會在 LINE 內自動取得 profile；
 * 外部瀏覽器則會 redirect 到 LINE 登入頁。
 * 登入成功後把 idToken 交換成 Supabase session。
 */
export function useLiff(liffId: string) {
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const p = await liff.getProfile();
        const idToken = liff.getIDToken();
        const accessToken = liff.getAccessToken();
        if (cancelled) return;
        setProfile({
          userId: p.userId,
          displayName: p.displayName,
          pictureUrl: p.pictureUrl,
          idToken,
          accessToken
        });
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return { profile, error, ready };
}
