"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * 上傳打卡照片到 Supabase Storage。
 * 路徑：{employeeId}/YYYY/MM/DD/{epoch}_{in|out}.jpg
 */
export async function uploadClockPhoto(args: {
  employeeId: string;
  type: "in" | "out";
  blob: Blob;
}): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const path = `${args.employeeId}/${yyyy}/${mm}/${dd}/${Date.now()}_${args.type}.jpg`;

  const supa = getSupabaseBrowserClient();
  const { error } = await supa.storage
    .from("clock-photos")
    .upload(path, args.blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}
