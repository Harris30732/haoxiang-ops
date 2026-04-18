"use server";

import { cookies } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fireN8nWebhook } from "@/lib/n8n";
import { haversineMeters } from "@/lib/geo";

export type ClockInInput = {
  storeId: string;
  lat: number;
  lng: number;
  photoPath: string;        // Supabase Storage 相對路徑（前端上傳完拿到）
  salesAmount?: number | null;
  notes?: string | null;
};

export type ClockOutInput = Omit<ClockInInput, "storeId">;

async function getStoreLoc(storeId: string) {
  const supa = getSupabaseServerClient();
  const { data, error } = await supa
    .from("stores")
    .select("id, name, lat, lng, geofence_radius_m")
    .eq("id", storeId)
    .single();
  if (error) throw error;
  return data;
}

export async function clockInAction(input: ClockInInput) {
  const supa = getSupabaseServerClient();
  const store = await getStoreLoc(input.storeId);

  let distance = 0;
  let withinFence = true;
  if (store.lat != null && store.lng != null) {
    distance = haversineMeters(
      { lat: input.lat, lng: input.lng },
      { lat: store.lat, lng: store.lng }
    );
    withinFence =
      store.geofence_radius_m === 0 || distance <= store.geofence_radius_m;
  }

  const { data, error } = await supa.rpc("clock_in", {
    p_store_id: input.storeId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_distance_m: distance,
    p_within_fence: withinFence,
    p_photo_path: input.photoPath,
    p_sales_amount: input.salesAmount ?? null,
    p_notes: input.notes ?? null
  });
  if (error) throw new Error(error.message);

  // n8n 通知（fire-and-forget）
  fireN8nWebhook("clock-in-done", {
    storeId: input.storeId,
    storeName: store.name,
    result: data,
    withinFence,
    distanceM: distance,
    at: new Date().toISOString()
  });

  return data as { shift_id: string; clock_event_id: string; sales_report_id: string | null };
}

export async function clockOutAction(input: ClockOutInput) {
  const supa = getSupabaseServerClient();

  // 找當前 open shift 的店
  const { data: shift, error: sErr } = await supa
    .from("shifts")
    .select("store_id, stores(name, lat, lng, geofence_radius_m)")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!shift) throw new Error("no_open_shift");

  const store = shift.stores as unknown as {
    name: string;
    lat: number | null;
    lng: number | null;
    geofence_radius_m: number;
  };

  let distance = 0;
  let withinFence = true;
  if (store.lat != null && store.lng != null) {
    distance = haversineMeters(
      { lat: input.lat, lng: input.lng },
      { lat: store.lat, lng: store.lng }
    );
    withinFence =
      store.geofence_radius_m === 0 || distance <= store.geofence_radius_m;
  }

  const { data, error } = await supa.rpc("clock_out", {
    p_lat: input.lat,
    p_lng: input.lng,
    p_distance_m: distance,
    p_within_fence: withinFence,
    p_photo_path: input.photoPath,
    p_sales_amount: input.salesAmount ?? null,
    p_notes: input.notes ?? null
  });
  if (error) throw new Error(error.message);

  fireN8nWebhook("clock-out-done", {
    storeId: shift.store_id,
    storeName: store.name,
    result: data,
    withinFence,
    distanceM: distance,
    at: new Date().toISOString()
  });

  return data as { shift_id: string; clock_event_id: string; sales_report_id: string | null };
}

/** 傳進打卡時間點，問是否要回報業績（前端渲染時呼叫） */
export async function needsSalesReport(storeId: string): Promise<boolean> {
  const supa = getSupabaseServerClient();
  const { data, error } = await supa.rpc("store_needs_sales_report", {
    p_store_id: storeId
  });
  if (error) throw error;
  return Boolean(data);
}
