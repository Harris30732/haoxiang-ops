# 晧香營運系統 v2

LINE LIFF 手機網頁打卡 + Supabase + 自架 n8n 整合。

> v1（n8n LINE bot + Google Sheets）已於 2026-04-19 砍掉重練。
> 舊版程式碼仍在 git 歷史中，見 commit `bd24646` 及其之前。

## 功能

- LINE LIFF 免登入，記住身份不用重輸入
- 手機優先網頁（iPhone SE 寬度可用）
- 依員工狀態顯示可操作內容
  - 未上班：選可上班店家 → 上班打卡
  - 上班中：顯示店家與上班時間 → 下班打卡
- 每次打卡都要：現場拍照 + 自動定位 + （視店況）回報當下營業額
- 業績回報判斷：店家開攤後 1 小時內免報；其他時段接班、收攤都要報
- 老闆透過 n8n 自動 push LINE 通知

## 架構

| 層 | 技術 |
|---|---|
| 前端 | Next.js 14 App Router + TypeScript + Tailwind CSS + LIFF SDK |
| 後端 | Supabase (Postgres + Auth + Storage + RLS) |
| 部署 | Docker Compose + Caddy（自架，與 n8n 同機） |
| 整合 | n8n（LINE 通知、排程、外部同步） |

完整架構見 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 目錄

```
app/                  Next.js App Router 頁面
components/           可重複用的 UI 元件（相機、定位、Auth gate）
lib/                  Supabase client、LIFF、n8n、Server Actions
supabase/migrations/  資料庫 schema + RLS + RPC
docker/               Dockerfile + Caddyfile + 部署 README
n8n/                  webhook 規格與 n8n workflow（上線後匯入）
ARCHITECTURE.md       架構規格
CLAUDE.md             給 AI 助手的專案說明
```

## 快速開始（本機）

```bash
cp .env.example .env     # 填 Supabase / LIFF / n8n 設定
npm install
npm run dev
```

LINE LIFF 需要公開 HTTPS endpoint；開發時用 ngrok 或 Cloudflare Tunnel：

```bash
ngrok http 3000
# 把 https 網址貼到 LINE Developers Console → LIFF → Endpoint URL
```

## 部署到伺服器

見 [`docker/README.md`](docker/README.md)。簡述：

1. Supabase 建專案，apply `supabase/migrations/20260419000000_init.sql`
2. LINE Developers 建 LIFF，endpoint 填 `https://ops.<你的 domain>`
3. DNS 設 A record 指向 VM
4. 填 `.env` → `docker compose up -d --build`
5. Supabase Studio 新增第一位員工（role = owner），關聯到店家
6. 回 LINE 開 LIFF → 用起來

## 技術決策紀錄

- 為什麼是 Supabase 不是 Firebase？PostgreSQL + SQL + RLS 比較符合店家/員工/班次這種關聯式模型；Storage + Auth 都內建省一層整合
- 為什麼自架不用 Vercel？既有 n8n 已在自架 server，減少運維面、省成本，且兩邊可走內網 webhook
- 為什麼還是保留 n8n？LINE Messaging API 的 rate-limit 管理、排程 cron、外部系統同步用 n8n 做 UI 拖拉比較快
- 為什麼相機用 `<input capture>` 不用 `getUserMedia`？LIFF 內嵌 webview 權限限制多，原生 file input 最穩

## 授權
見 [LICENSE](LICENSE)
