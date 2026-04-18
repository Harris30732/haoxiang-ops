"use client";

import { useState } from "react";
import { ClockOutForm } from "./clock-out-form";

export type OpenShift = {
  id: string;
  storeId: string;
  storeName: string;
  startedAt: string;
};

export function OnDuty({
  shift,
  employeeName
}: {
  shift: OpenShift;
  employeeName: string;
}) {
  const [clockingOut, setClockingOut] = useState(false);
  const startedAt = new Date(shift.startedAt);
  const hh = startedAt.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  if (clockingOut) {
    return (
      <ClockOutForm
        shift={shift}
        onCancel={() => setClockingOut(false)}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="pt-2">
        <div className="text-sm text-neutral-500">目前狀態</div>
        <h1 className="text-2xl font-bold text-brand">上班中</h1>
        <p className="text-neutral-600">{employeeName}</p>
      </header>

      <section className="card">
        <div className="text-sm text-neutral-500">店家</div>
        <div className="text-xl font-semibold">{shift.storeName}</div>
        <div className="mt-3 text-sm text-neutral-500">上班時間</div>
        <div className="text-xl font-semibold">{hh}</div>
      </section>

      <button className="btn-primary" onClick={() => setClockingOut(true)}>
        下班打卡
      </button>
    </main>
  );
}
