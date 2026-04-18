import { redirect } from "next/navigation";
import { LiffAuthProvider } from "./providers";
import { AuthGate } from "@/components/auth-gate";
import { StatusRouter } from "./status-router";

export default function Home() {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) {
    redirect("/setup-required");
  }
  return (
    <LiffAuthProvider liffId={liffId}>
      <AuthGate>
        <StatusRouter />
      </AuthGate>
    </LiffAuthProvider>
  );
}
