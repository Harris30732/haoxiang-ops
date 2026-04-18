"use client";

import { useEffect, useState } from "react";
import { CameraCapture } from "@/components/camera-capture";
import { useGeolocation } from "@/components/use-geolocation";
import { uploadClockPhoto } from "@/lib/upload";
import { clockOutAction, needsSalesReport } from "@/lib/actions/clock";
import { useAuth } from "./providers";
import type { OpenShift } from "./on-duty";

export function ClockOutForm({
  shift,
  onCancel
}: {
  shift: OpenShift;
  onCancel: () => void;
}) {
  const { employee } = useAuth();
  const geo = useGeolocation();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [needSales, setNeedSales] = useState<boolean | null>(null);
  const [sales, setSales] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    needsSalesReport(shift.storeId)
      .then(setNeedSales)
      .catch(() => setNeedSales(true));
  }, [shift.storeId]);

  const canSubmit =
    !submitting &&
    blob != null &&
    geo.coord != null &&
    (needSales !== true || (sales !== "" && Number(sales) >= 0));

  async function handleSubmit() {
    if (!canSubmit || !blob || !geo.coord || !employee) return;
    setSubmitting(true);
    setError(null);
    try {
      const photoPath = await uploadClockPhoto({
        employeeId: employee.id,
        type: "out",
        blob
      });
      await clockOutAction({
        lat: geo.coord.lat,
        lng: geo.coord.lng,
        photoPath,
        salesAmount: needSales ? Number(sales) : null
      });
      window.location.reload();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-4">
      <header>
        <div className="text-sm text-neutral-500">下班打卡</div>
        <h1 className="text-2xl font-bold">{shift.storeName}</h1>
      </header>

      <section className="card">
        <div className="text-sm text-neutral-500">定位</div>
        {geo.busy && <div className="text-neutral-400">取得中…</div>}
        {geo.error && (
          <div className="text-red-600">失敗：{geo.error}（請開啟定位權限）</div>
        )}
        {geo.coord && (
          <div className="text-sm">
            {geo.coord.lat.toFixed(5)}, {geo.coord.lng.toFixed(5)}
            <span className="ml-2 text-neutral-400">
              ±{Math.round(geo.coord.accuracy)}m
            </span>
          </div>
        )}
      </section>

      <section className="card">
        <CameraCapture onCapture={(b) => setBlob(b)} />
      </section>

      {needSales && (
        <section className="card">
          <label className="mb-1 block text-sm text-neutral-500">
            當下累計營業額（元）
          </label>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            className="w-full rounded-lg border border-neutral-300 p-3 text-lg"
            value={sales}
            onChange={(e) => setSales(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
          />
        </section>
      )}

      {needSales === false && (
        <div className="text-center text-sm text-neutral-500">
          剛開攤不到 1 小時,本次免回報業績。
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 pb-4">
        <button
          className="btn-primary"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting ? "送出中…" : "送出打卡"}
        </button>
        <button
          className="btn-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          返回
        </button>
      </div>
    </main>
  );
}
