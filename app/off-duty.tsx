"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ClockInForm } from "./clock-in-form";

type Store = { id: string; name: string };

export function OffDuty({
  employeeId,
  employeeName
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [chosen, setChosen] = useState<Store | null>(null);

  useEffect(() => {
    const supa = getSupabaseBrowserClient();
    supa
      .from("employee_stores")
      .select("store_id, stores(id, name, active)")
      .eq("employee_id", employeeId)
      .then(({ data }) => {
        const list = (data ?? [])
          .map((row) => row.stores as unknown as { id: string; name: string; active: boolean } | null)
          .filter((s): s is { id: string; name: string; active: boolean } => !!s && s.active)
          .map(({ id, name }) => ({ id, name }));
        setStores(list);
      });
  }, [employeeId]);

  if (chosen) {
    return (
      <ClockInForm
        store={chosen}
        employeeId={employeeId}
        onCancel={() => setChosen(null)}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header className="pt-2">
        <div className="text-sm text-neutral-500">目前狀態</div>
        <h1 className="text-2xl font-bold">未上班</h1>
        <p className="text-neutral-600">{employeeName},選擇要上班的店家</p>
      </header>

      <section className="flex flex-col gap-3">
        {stores === null && (
          <div className="card text-center text-neutral-400">載入中…</div>
        )}
        {stores && stores.length === 0 && (
          <div className="card text-center text-neutral-600">
            你還沒被指派到任何店家,請聯絡管理員。
          </div>
        )}
        {stores?.map((s) => (
          <button
            key={s.id}
            className="card flex items-center justify-between text-left active:bg-neutral-50"
            onClick={() => setChosen(s)}
          >
            <span className="text-lg font-semibold">{s.name}</span>
            <span className="text-brand">上班 →</span>
          </button>
        ))}
      </section>
    </main>
  );
}
