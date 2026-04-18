-- 測試用種子資料 — 上線前自行改或清空
-- 執行時機：apply 完 init migration 後
-- 用法：在 Supabase SQL Editor 貼上執行

-- 示範店家
insert into public.stores (name, address, lat, lng, geofence_radius_m)
values
  ('晧香 A 店', '台北市某路 1 號', 25.0330, 121.5654, 200),
  ('晧香 B 店', '台北市某路 2 號', 25.0400, 121.5700, 200)
on conflict do nothing;

-- 示範員工（line_user_id 請換成真實的 LINE userId）
-- 取得方法：先把自己加為 LINE LIFF 測試者，開啟 LIFF 後 console.log(liff.getProfile().userId)
-- insert into public.employees (line_user_id, display_name, role)
-- values
--   ('Uxxxxxxxxxxxxxxxx', 'Harris', 'owner'),
--   ('Uyyyyyyyyyyyyyyyy', '員工A', 'staff');

-- 關聯所有員工到所有店（示範）
-- insert into public.employee_stores (employee_id, store_id)
-- select e.id, s.id from public.employees e cross join public.stores s
-- on conflict do nothing;
