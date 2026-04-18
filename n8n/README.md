# n8n 整合規格

LIFF 網頁不跟 n8n 直接耦合 — 所有互動都透過 webhook。
下面列出每個 webhook 的路徑、payload、建議 workflow。

## 共通

- Base URL: `N8N_WEBHOOK_BASE`，例如 `https://n8n.example.com/webhook`
- 認證：header `X-Signature: sha256=<hmac-sha256(body, N8N_WEBHOOK_SECRET)>`
- n8n 端在 webhook 之後加一個 **Function node** 驗簽：

```js
const crypto = require('crypto');
const secret = $env.N8N_WEBHOOK_SECRET;
const body = JSON.stringify($json);
const hmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
const sig  = $request.headers['x-signature'] || '';
if (sig !== `sha256=${hmac}`) {
  throw new Error('bad signature');
}
return items;
```

## Webhook 列表

### 1. `POST /webhook/clock-in-done`

**觸發**：員工上班打卡成功  
**Payload**：

```json
{
  "storeId": "uuid",
  "storeName": "晧香 A 店",
  "result": {
    "shift_id": "uuid",
    "clock_event_id": "uuid",
    "sales_report_id": "uuid | null"
  },
  "withinFence": true,
  "distanceM": 45.2,
  "at": "2026-04-19T10:23:15.000Z"
}
```

**建議 workflow**：

1. 驗簽
2. `Supabase → get employee` by shift_id → 拿 display_name
3. `LINE → push` 到老闆群組：`{name} 在 {storeName} 上班打卡（{距離}m）`
4. 若 `withinFence=false`，加警告 emoji

### 2. `POST /webhook/clock-out-done`

**觸發**：員工下班打卡成功  
**Payload**：同 clock-in-done，多一個 `durationMin`（可由 n8n 從 shift 算）

**建議 workflow**：

1. 驗簽
2. 查 shift 拿到 `started_at` / `ended_at`
3. push 老闆：`{name} 在 {storeName} 下班 / 工時 X 小時 Y 分`
4. 若當前店家已無 open shift → 視為關攤，另外 push「{storeName} 關攤」

### 3. `POST /webhook/sales-reported`

**觸發**：業績被回報（跟 clock-in/out 一起觸發，但獨立 webhook 方便串 POS/Sheets）  
**Payload**：

```json
{
  "storeId": "uuid",
  "storeName": "...",
  "shiftId": "uuid",
  "employee": { "id": "uuid", "name": "..." },
  "amount": 12345.00,
  "reportedAt": "2026-04-19T13:00:00.000Z"
}
```

> 目前的 clock-in/out webhook 已包含 sales_report_id；如果需要更細的業績事件流，
> 再由 web app 另發這支。初期可先不用。

### 4. Cron workflow: `daily-check`（由 n8n 發動，不是 web 推）

每天 22:00 跑：

1. 查 Supabase `shifts` where `status='open'` → 有人忘記下班
2. 查今日沒有 sales_report 的店 → 老闆提醒
3. push 到老闆 LINE

## 範例 workflow 檔

`n8n/workflows/` 先留空，等部署後在 n8n UI 建完再 export 回來放這個資料夾做版本控管。
