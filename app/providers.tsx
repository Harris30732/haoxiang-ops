"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLiff, type LiffProfile } from "@/lib/liff";

type AuthState = {
  profile: LiffProfile | null;
  employee: { id: string; name: string; role: string } | null;
  status: "loading" | "unregistered" | "ready" | "error";
  error?: string;
};

const AuthCtx = createContext<AuthState>({
  profile: null,
  employee: null,
  status: "loading"
});

export function useAuth() {
  return useContext(AuthCtx);
}

export function LiffAuthProvider({
  liffId,
  children
}: {
  liffId: string;
  children: React.ReactNode;
}) {
  const { profile, error: liffErr, ready } = useLiff(liffId);
  const [employee, setEmployee] = useState<AuthState["employee"]>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [errMsg, setErrMsg] = useState<string | undefined>();

  useEffect(() => {
    if (!ready) return;
    if (liffErr) {
      setStatus("error");
      setErrMsg(String(liffErr));
      return;
    }
    if (!profile?.idToken) return;

    // 交換 Supabase session
    fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: profile.idToken })
    })
      .then(async (r) => {
        if (r.status === 403) {
          setStatus("unregistered");
          return;
        }
        if (!r.ok) {
          const t = await r.json().catch(() => ({}));
          setStatus("error");
          setErrMsg(t.error || r.statusText);
          return;
        }
        const { employee } = await r.json();
        setEmployee(employee);
        setStatus("ready");
      })
      .catch((e) => {
        setStatus("error");
        setErrMsg(String(e));
      });
  }, [ready, profile, liffErr]);

  const value = useMemo<AuthState>(
    () => ({ profile, employee, status, error: errMsg }),
    [profile, employee, status, errMsg]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
