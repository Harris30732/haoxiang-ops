# 晧香專案 (haoxiang-ops) v2

## 專案是什麼
晧香營運系統 v2 — LINE LIFF 手機網頁打卡 + Supabase + 自架 n8n 整合。
v1（LINE 打卡 bot + Discord 營運 bot / Google Sheets / 舊 n8n workflow）已於 2026-04-19 全部砍掉重練；
v1 殘留檔案在 `legacy/v1-agent/`，**內容不可信，不要讀它來了解現況**。

## 架構速覽
- **前端**: Next.js 14 (App Router) + TypeScript + Tailwind + LIFF SDK
- **後端**: Supabase (Postgres + Auth + Storage + RLS)
- **部署**: 自架 (Docker Compose + Caddy)，與 n8n 同一台
- **整合**: n8n 負責 LINE 通知、排程檢查、外部同步、照片後處理

完整規格（資料模型、頁面流程、部署拓撲）見 `ARCHITECTURE.md`（417 行，
只讀需要的段落，或派 subagent 摘要）。

## 使用者流程（一句話版）
員工從 LINE 開 LIFF 免登入 → 依上班狀態分流（未上班→選店上班打卡；上班中→下班打卡）
→ 拍照 + 定位 + 業績回報（店家開攤 1 小時內免報，其他時間都要報）。

## 關鍵檔案
- `supabase/migrations/20260419000000_init.sql` — 初始 schema + RLS + RPC
- `app/page.tsx` + `app/status-router.tsx` — 狀態分流；`app/off-duty.tsx` / `app/on-duty.tsx` — 主畫面
- `app/clock-in-form.tsx` / `app/clock-out-form.tsx` — 打卡流程
- `app/api/auth/exchange/route.ts` — LIFF ID token → Supabase session
- `lib/actions/clock.ts` — 打卡 Server Actions（打卡行為改動只改這裡＋對應 Postgres function）
- `lib/` — Supabase client、LIFF hook、n8n helper；`components/` — 相機、定位、AuthGate
- `docker/` — Dockerfile + Caddyfile + 部署 README；`n8n/README.md` — webhook 規格

## 硬規則（違反任一條＝任務未完成）
1. **驗證閘**：改了任何 `.ts/.tsx` 之後、回報完成之前，必跑
   `npm run typecheck && npm run lint`；若動到 `app/` 下任何檔案、或
   next.config.mjs / tailwind.config.ts / tsconfig.json / package.json，再加 `npm run build`。
   新容器要先 `npm install`——node_modules 不存在時 typecheck 必然噴一堆
   TS2307（Cannot find module），那不是你改壞的。
   驗證失敗就修到過；修不動就照實回報失敗，不准說「完成」。
2. **schema 變動**：只新增 `supabase/migrations/YYYYMMDDHHMMSS_xxx.sql`，不改舊檔。
   **不要用 Supabase MCP 的 apply_migration / execute_sql 直接改遠端**（那是生產環境）。
3. **委派**：要讀 3 個以上檔案、掃 repo、或查網頁才能回答的事，派 subagent，
   主對話只收結論。詳細規則見 `docs/agents/dispatch.md`。
4. **commit**：格式 `<type>: <description> [QG:分數]`（QG 打分規則見
   `docs/agents/judgment.md`）。每完成一個獨立單位就 commit + push——
   本環境是暫時容器，沒 push 的工作 session 結束就消失。
5. Service role key 只能在 Server Component / Route Handler 使用。
6. 手機優先；所有頁面在 iPhone SE 寬度（375px）要能用。
7. 相機授權用 `<input capture="environment">`，不用額外 permission API。

## 制度檔案路由（需要時才讀，不要全部預載）
| 情境 | 讀這份 |
|------|--------|
| 要派 subagent／選 model 與 effort／驗收別人的產出 | `docs/agents/dispatch.md` |
| 不確定「算不算完成」「該不該升級模型」「該不該問使用者」 | `docs/agents/judgment.md` |
| 要寫派工 prompt（搜尋/實作/重構/研究/審查） | `docs/agents/templates.md` |
| 想修改任何制度檔或本檔 | 先讀 `docs/agents/maintenance.md` |
| 新 session 對環境陌生／想知道環境的坑 | `docs/agents/letter.md` |
| 踩到新坑、或想查別人踩過的坑 | `docs/agents/lessons.md` |

## 本機跑起來
```bash
cp .env.example .env   # 填 Supabase + LIFF + n8n 的值
npm install
npm run dev            # 預設 http://localhost:3000
```
用 ngrok / Cloudflare Tunnel 暴露 localhost:3000 給 LINE LIFF 當開發 endpoint。
