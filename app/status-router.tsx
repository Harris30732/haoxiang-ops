"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./providers";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { OffDuty } from "./off-duty";
import { OnDuty, type OpenShift } from "./on-duty";

export function StatusRouter() {
  const { status, employee } = useAuth();
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (status !== "ready" || !employee) return;
    const supa = getSupabaseBrowserClient();
    supa
      .from("shifts")
      .select("id, store_id, started_at, stores(name)")
      .eq("employee_id", employee.id)
      .eq("status", "open")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setOpenShift({
            id: data.id as string,
            storeId: data.store_id as string,
            startedAt: data.started_at as string,
            storeName:
              (data.stores as unknown as { name: string } | null)?.name ?? "—"
          });
        }
        setLoaded(true);
      });
  }, [status, employee]);

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        載入中…
      </div>
    );
  }
  return openShift ? (
    <OnDuty shift={openShift} employeeName={employee!.name} />
  ) : (
    <OffDuty employeeId={employee!.id} employeeName={employee!.name} />
  );
}
