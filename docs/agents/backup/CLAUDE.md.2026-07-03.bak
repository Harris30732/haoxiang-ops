# 晧香專案 (haoxiang-ops) v2

## 專案概述
晧香營運系統 v2 — LINE LIFF 手機網頁打卡 + Supabase + 自架 n8n 整合。
v1 的 LINE bot / Google Sheets / n8n workflow 已在 2026-04-19 全部砍掉重練。

## 架構速覽
- **前端**: Next.js 14 (App Router) + TypeScript + Tailwind + LIFF SDK
- **後端**: Supabase (Postgres + Auth + Storage + RLS)
- **部署**: 自架 (Docker Compose + Caddy)，與 n8n 同一台
- **整合**: n8n 負責 LINE 通知、排程檢查、外部同步、照片後處理

詳細規格見 `ARCHITECTURE.md`。

## 使用者流程
1. 員工在 LINE 點選單開 LIFF → 免登入（LIFF 會帶 userId + idToken）
2. 首頁依狀態分流：
   - 未上班 → 顯示可上班店家 → 選店 → 拍照 + 定位 + (可能) 業績 → 上班打卡
   - 上班中 → 顯示當前店家與上班時間 → 拍照 + 定位 + (可能) 業績 → 下班打卡
3. 業績回報判斷：店家開攤 1 小時內免報；其他時間點都要報

## 關鍵檔案
- `ARCHITECTURE.md` — 完整架構規格（資料模型、頁面流程、部署拓撲）
- `supabase/migrations/20260419000000_init.sql` — 初始 schema + RLS + RPC
- `app/` — Next.js App Router 頁面
  - `app/page.tsx` + `app/status-router.tsx` — 狀態分流
  - `app/off-duty.tsx` / `app/on-duty.tsx` — 主畫面
  - `app/clock-in-form.tsx` / `app/clock-out-form.tsx` — 打卡流程
  - `app/api/auth/exchange/route.ts` — LIFF ID token → Supabase session
- `lib/` — Supabase client、LIFF hook、n8n helper、Server Actions
- `components/` — 相機、定位、AuthGate
- `docker/` — Dockerfile + Caddyfile + 部署 README
- `n8n/README.md` — webhook 規格

## 開發規範
- 任何 schema 變動 → 新增 `supabase/migrations/YYYYMMDDHHMMSS_xxx.sql`，不要改舊的
- 打卡行為改動 → 只改 `lib/actions/clock.ts` 與對應 Postgres function
- 手機優先設計；所有頁面都要在 iPhone SE 寬度能用
- commit 格式：`<type>: <description> [QG:分數]`

## 注意事項
- v1 的 n8n workflow / Google Sheets 全部已移除（git 歷史還有，checkpoint commit 有註記）
- Service role key 只能在 Server Component / Route Handler 使用
- 相機授權：`<input capture="environment">`，不用額外 permission API

## 本機跑起來
```bash
cp .env.example .env   # 填 Supabase + LIFF + n8n 的值
npm install
npm run dev            # 預設 http://localhost:3000
```

用 ngrok / Cloudflare Tunnel 暴露 localhost:3000 給 LINE LIFF 當開發 endpoint。
