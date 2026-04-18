# 晧香營運系統 v2 — 架構文件

> 版本：v2.0（LIFF web app + Supabase + 自架 n8n）
> 更新：2026-04-19
> 取代：v1 的 n8n LINE bot + Google Sheets 架構

---

## 1. 系統總覽

### 1.1 組件

```
┌─────────────────┐        ┌───────────────────────┐
│   員工 LINE     │──開啟─▶│ LIFF 網頁 (Next.js)   │
│   (手機)        │        │ self-hosted at        │
└─────────────────┘        │ https://ops.<domain>  │
                           └───────┬───────────────┘
                                   │ 讀寫
                                   ▼
                           ┌───────────────────────┐
                           │ Supabase (Cloud)      │
                           │  - Postgres           │
                           │  - Auth (LINE OIDC)   │
                           │  - Storage (照片)     │
                           └───────┬───────────────┘
                                   │ Webhook / Trigger
                                   ▼
                           ┌───────────────────────┐
                           │ n8n (自架同一台)      │
                           │  - LINE push 通知     │
                           │  - 排程檢查           │
                           │  - 外部系統同步       │
                           │  - 照片後處理         │
                           └───────────────────────┘
```

### 1.2 技術棧

| 層 | 選擇 | 理由 |
|---|---|---|
| 前端框架 | Next.js 14（App Router）+ TypeScript | React 主流、SSR 對 LIFF 友善、Server Actions 減少 API 層 |
| 樣式 | Tailwind CSS | 手機優先排版快、無 runtime |
| LINE 整合 | LIFF v2 SDK (`@line/liff`) | 官方方案、內建免登入 + userId |
| 資料庫 | Supabase（PostgreSQL 託管） | 自帶 Auth + Storage + RLS，免後端骨架 |
| 照片儲存 | Supabase Storage | 跟資料庫同一家，URL 好管、可設私有 bucket |
| 地圖/定位 | 瀏覽器 `navigator.geolocation` | LIFF 內已有定位授權 |
| 相機 | `<input type="file" accept="image/*" capture="environment">` + Canvas 壓縮 | 原生開相機、不需額外權限 |
| 部署（前端） | Docker compose（與 n8n 同一台）+ Caddy reverse proxy | 自架、自動 Let's Encrypt |
| 自動化 | n8n（保留現有） | 負責外部通知與排程 |

### 1.3 範圍外（先不做）

- 管理後台（員工／店家 CRUD）v2.0 用 Supabase Studio 直接管理；v2.1 再做。
- 離線打卡（網路中斷還要能打）。
- 薪資計算（先由原本的 n8n workflow 另外處理或 v2.1 再補）。

---

## 2. 核心領域模型

### 2.1 實體

- **Employee**：員工。以 LINE `userId` 為唯一識別。
- **Store**：店家。有座標、營業時段。
- **EmployeeStore**：員工可在哪些店上班（多對多 + 角色）。
- **Shift**：一段班次。開始於員工「上班打卡」，結束於「下班打卡」。每位員工同時只會有一個 `open` 的 shift。
- **ClockEvent**：打卡事件（上班或下班）。每次打卡都記錄照片、GPS、時間、對應 shift。
- **SalesReport**：業績回報紀錄。掛在 shift 上，可能 0 ~ N 次（看接班次數）。
- **StoreSession**：店家的一個開攤週期（第一個上班打卡開攤 → 最後一個下班打卡關攤）。用來判斷「開攤後 1 小時內」。

### 2.2 狀態機：員工視角

```
   [OFF]  ──(選店 + 上班打卡)──▶  [ON @ store X]
                                         │
                                         │ (下班打卡)
                                         ▼
                                       [OFF]
```

員工首頁根據 `current_shift` 分流：
- `current_shift == null` → 顯示「選店家上班」畫面
- `current_shift.status == 'open'` → 顯示「@ X 店 / 上班時間 HH:MM / 下班打卡」畫面

### 2.3 業績回報判斷邏輯

觸發時機是「打卡」（上班 or 下班），邏輯相同：

```
needSalesReport(store, nowTs):
  session = currentStoreSession(store)   # 該店今日最近一次開攤週期
  if session is None:
      # 這次打卡就是開攤 → 不需要回報
      return False
  openedAt = session.opened_at
  if (nowTs - openedAt) < 60 minutes:
      return False   # 開攤 1 小時內免報
  return True
```

於是：
- **上班打卡**（接班）：通常需要回報（除非剛好在開攤 1 小時內，例如開攤半小時內第二個人才來）。
- **下班打卡**：幾乎都需要回報（除非剛開攤半小時就下班，罕見）。
- **開攤第一個上班打卡**：一定不需要回報（因為 session 還沒開始）。

實作放在 Postgres function `store_needs_sales_report(store_id, at)` 以便 RLS 與前端都可用。

### 2.4 StoreSession 的判定

一個 store 的「當前開攤週期」定義為：今天（以該店時區）第一個進入的員工的上班打卡時間 → 最後一個員工的下班打卡時間。期間可能有多人交班。

實作上不用專門存一張表，用 view：`v_store_current_session` 取該店最早一個今天還沒對應下班的上班打卡為 `opened_at`；若今天所有上班都已下班且無人在班，視為「已關攤」，下次有人上班即開新 session。

---

## 3. 資料庫 Schema（Supabase / PostgreSQL）

所有 table 都有 `id uuid default gen_random_uuid() primary key`、`created_at timestamptz default now()`。

### 3.1 `employees`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `line_user_id` | text unique not null | LIFF 拿到的 `profile.userId` |
| `display_name` | text | 預設 LINE 名稱，可改 |
| `role` | text check in ('owner','manager','staff') | 權限角色 |
| `phone` | text | 選填 |
| `active` | boolean default true | 離職後改 false 不刪 |

### 3.2 `stores`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `name` | text not null | 店名 |
| `address` | text | |
| `lat` | double precision | 店家座標（用來近距離校驗） |
| `lng` | double precision | |
| `geofence_radius_m` | int default 200 | 打卡允許半徑（公尺），0 = 不校驗 |
| `timezone` | text default 'Asia/Taipei' | |
| `active` | boolean default true | |

### 3.3 `employee_stores`

| 欄位 | 型別 |
|---|---|
| `employee_id` | uuid references employees |
| `store_id` | uuid references stores |
| primary key | (employee_id, store_id) |

### 3.4 `shifts`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `employee_id` | uuid references employees not null | |
| `store_id` | uuid references stores not null | |
| `clock_in_event_id` | uuid references clock_events | 對應上班打卡事件 |
| `clock_out_event_id` | uuid references clock_events nullable | 下班時填 |
| `started_at` | timestamptz not null | |
| `ended_at` | timestamptz nullable | null = 進行中 |
| `status` | text check in ('open','closed') default 'open' | |

限制：每位員工同時最多一筆 `status='open'` 的 shift（用 partial unique index）。

### 3.5 `clock_events`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `employee_id` | uuid references employees not null | |
| `store_id` | uuid references stores not null | |
| `shift_id` | uuid references shifts | in 事件寫入後回填；out 事件先關聯 open shift |
| `type` | text check in ('in','out') not null | |
| `event_at` | timestamptz not null default now() | |
| `lat` | double precision | |
| `lng` | double precision | |
| `distance_m` | double precision | 離店家距離，server 算 |
| `photo_path` | text | Supabase Storage 內的相對路徑 |
| `within_geofence` | boolean | |
| `notes` | text | |

### 3.6 `sales_reports`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `store_id` | uuid references stores not null | |
| `shift_id` | uuid references shifts | 那一班所屬 |
| `clock_event_id` | uuid references clock_events | 打卡時送的話填 |
| `reported_by` | uuid references employees not null | |
| `reported_at` | timestamptz default now() | |
| `amount` | numeric(10,2) not null | 回報當下的累計營業額 |
| `notes` | text | |

### 3.7 RLS 原則

- `employees`：本人可讀自己；manager/owner 可讀全部；只有 owner 能寫。
- `stores`：已登入員工全可讀；只有 owner 能寫。
- `employee_stores`：本人可讀自己的；owner 可寫。
- `shifts` / `clock_events`：本人可讀自己的；owner/manager 可讀全部；只能由本人插入。
- `sales_reports`：本人可插入自己店、自己班的；owner/manager 可讀全部。

### 3.8 必要的 Postgres function（Server Actions 會呼叫）

```
-- 判斷打卡當下是否需要回報業績
create function store_needs_sales_report(p_store_id uuid, p_at timestamptz)
  returns boolean ...

-- 原子地建立上班 shift（檢查沒有 open shift + 建 clock_event + 建 shift）
create function clock_in(...) returns jsonb ...

-- 原子地關班（檢查有 open shift + 建 clock_event + update shift）
create function clock_out(...) returns jsonb ...
```

---

## 4. 前端頁面

所有頁面都在 LIFF 內，手機豎版。

| 路徑 | 功能 |
|---|---|
| `/` | 登入 gate → 依狀態導去 `/on` 或 `/off` |
| `/off` | 未上班首頁：顯示員工可用店家清單 + 「上班打卡」按鈕 |
| `/clock-in?storeId=...` | 拍照 + 定位 + （若需要）業績表單 → 送出 |
| `/on` | 上班中首頁：顯示 @ X 店 / 上班時間 / 「下班打卡」按鈕 |
| `/clock-out` | 拍照 + 定位 + 業績表單（判斷需不需要） → 送出 |
| `/history` | 本人最近打卡紀錄（選做） |
| `/admin` | v2.0 留空，先走 Supabase Studio |

### 4.1 流程圖：上班打卡

```
/off
  │ 選店 X
  ▼
/clock-in?storeId=X
  ├─ 要求定位（navigator.geolocation）
  ├─ 開相機拍現場照
  ├─ 呼 store_needs_sales_report → 是否顯示業績欄位
  ├─ 若需要 → 顯示「當下營業額」number input
  ▼
  [送出]
  ├─ 上傳照片到 Supabase Storage
  ├─ 呼 clock_in() RPC（含 photo_path、lat/lng、業績金額）
  ├─ 觸發 n8n webhook: clock-in-done
  ▼
/on
```

### 4.2 流程圖：下班打卡

```
/on
  │ [下班打卡]
  ▼
/clock-out
  ├─ 同樣拍照 + 定位
  ├─ 幾乎一定要填業績（判斷邏輯仍跑）
  ▼
  [送出]
  ├─ 上傳照片
  ├─ 呼 clock_out() RPC
  ├─ 觸發 n8n webhook: clock-out-done
  ▼
/off
```

### 4.3 登入策略（記住不用重登）

LIFF 本身會在 LINE 內自動帶 `accessToken`。流程：

1. `liff.init({ liffId })` → 若 `liff.isLoggedIn()` 為 false 就 `liff.login()`。
2. 取 `profile.userId`，打 Supabase：查 `employees.line_user_id`，沒對上 → 顯示「請聯絡管理員加入」。
3. 用 LIFF ID Token 建立 Supabase session：
   - 首選：Supabase Auth 走 LINE OIDC provider（設 Dashboard → Authentication → Providers → LINE）。
   - 備選（LINE OIDC 設定麻煩）：Server Action 驗 ID token → 用 Supabase `admin.signInWithEmail` 用 LINE userId 當 email 建 service session。
4. Session token 存在 httpOnly cookie，下次進來自動帶，不用重登。

---

## 5. Supabase Storage

- Bucket `clock-photos`（private）
- 路徑：`{employee_id}/{yyyy}/{mm}/{dd}/{shift_id}_{in|out}_{epoch}.jpg`
- 前端：壓縮到 max 1280px 寬、JPEG q=0.8，通常 < 300 KB
- 讀取：只能透過 signed URL，過期 1 小時

---

## 6. n8n 整合

n8n 繼續跑在同一台機器。LIFF 網頁透過 webhook 跟它溝通。

### 6.1 Webhook 清單

| 名稱 | 觸發時機 | Payload | n8n 該做 |
|---|---|---|---|
| `clock-in-done` | 員工上班打卡成功 | `{ employee, store, shift_id, event_at, photo_url }` | 推播老闆 LINE 群組；可選：開攤第一人時特別通知 |
| `clock-out-done` | 員工下班打卡成功 | `{ employee, store, shift_id, started_at, ended_at, duration_min, photo_url }` | 推播老闆；若為當日最後離店 → 標記關攤 |
| `sales-reported` | 業績回報送出 | `{ employee, store, amount, reported_at, shift_id }` | 可選：推播、同步到 POS/Sheets |
| `daily-check` *(由 n8n cron 驅動)* | 每天 22:00 | `-` | 查 Supabase 未關的 shift、未回報的業績 → 提醒員工 |

### 6.2 驗證

LIFF 網頁與 n8n 之間用 HMAC：
- 環境變數 `N8N_WEBHOOK_SECRET` 共享
- Request header `X-Signature: sha256=<hmac(payload, secret)>`
- n8n webhook 第一個節點做驗簽

---

## 7. 部署拓撲（自架）

同一台 Linux VM（已跑 n8n）：

```
┌────────────────────────────────┐
│  Caddy (ports 80/443)          │
│  ops.<domain>   → Next.js:3000 │
│  n8n.<domain>   → n8n:5678     │
└──────────┬─────────────────────┘
           │
  ┌────────▼──────────┐  ┌──────────────┐
  │ Next.js container │  │ n8n (既有)   │
  │ node:20-alpine    │  │              │
  └───────────────────┘  └──────────────┘
```

- Caddy 自動申請 Let's Encrypt 憑證。
- Supabase 用雲端（不自架，省維運）。
- `docker-compose.yml` 會加一個 service（`web`）跑 Next.js production build。
- Supabase env（URL / ANON KEY / SERVICE ROLE KEY）從 `.env` 注入；**service role 只在 server side 使用**。

### 7.1 .env 範本

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_LIFF_ID=
N8N_WEBHOOK_BASE=https://n8n.example.com/webhook
N8N_WEBHOOK_SECRET=
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
```

---

## 8. 開發／部署流程

1. 本機 `pnpm dev` → 用 ngrok 或 Cloudflare Tunnel 暴露給 LINE LIFF 做 dev LIFF endpoint。
2. `pnpm build` → `pnpm start` 驗生產版。
3. Git push → SSH 到 server → `docker compose pull && docker compose up -d web`（或配 GitHub Action 自動 deploy）。
4. LINE Developers Console → LIFF → 設定 Endpoint URL = `https://ops.<domain>`。

---

## 9. Open questions / 未決事項

- [ ] domain 要用哪個？
- [ ] Supabase 要新開專案還是有現成的？
- [ ] LINE Channel 要沿用舊的還是新建？若沿用，要把 v1 bot 停掉。
- [ ] 照片保存期限？（Storage 成本考量，建議 1 年後批次刪）
- [ ] 業績回報是否要給 manager 即時看到？若是，考慮 Supabase Realtime subscribe。

---

## 10. 目錄結構（實作完會長這樣）

```
haoxiang-ops/
├── app/                         # Next.js App Router
│   ├── (public)/login/
│   ├── (liff)/
│   │   ├── layout.tsx           # LIFF init + auth gate
│   │   ├── page.tsx             # 狀態分流
│   │   ├── off/page.tsx
│   │   ├── on/page.tsx
│   │   ├── clock-in/page.tsx
│   │   └── clock-out/page.tsx
│   ├── api/
│   │   └── webhook/             # (若有 server-to-server API)
│   └── layout.tsx
├── components/
│   ├── camera-capture.tsx
│   ├── geolocation.tsx
│   └── sales-form.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts            # 瀏覽器端
│   │   └── server.ts            # Server Component / Action
│   ├── liff.ts
│   ├── actions/
│   │   ├── clock-in.ts
│   │   ├── clock-out.ts
│   │   └── sales-report.ts
│   └── n8n.ts                   # HMAC + fetch helper
├── supabase/
│   ├── migrations/
│   │   └── 20260419_init.sql
│   └── seed.sql                 # 示範店家 / 員工
├── docker/
│   ├── Dockerfile
│   └── Caddyfile.example
├── docker-compose.yml
├── n8n/
│   └── README.md                # webhook 規格 + 範例 workflow
├── .env.example
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── CLAUDE.md                    # 更新為 v2 架構
├── README.md                    # 更新為 v2 架構
└── ARCHITECTURE.md              # 本檔
```
