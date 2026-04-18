"use client";

import { useAuth } from "@/app/providers";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, error, profile } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        <div className="animate-pulse">LINE 驗證中…</div>
      </div>
    );
  }

  if (status === "unregistered") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">尚未建檔</h1>
        <p className="text-neutral-600">
          這個 LINE 帳號還沒加入系統，請聯絡管理員。
        </p>
        {profile && (
          <p className="text-sm text-neutral-400">
            userId: {profile.userId.slice(0, 10)}…
          </p>
        )}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">發生錯誤</h1>
        <p className="text-neutral-600">{error ?? "請稍後再試。"}</p>
      </div>
    );
  }

  return <>{children}</>;
}
