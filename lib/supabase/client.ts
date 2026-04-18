"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * 瀏覽器端 Supabase client。
 * 搭配 setSession() 注入 LIFF 驗證後拿到的 access token。
 */
export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
