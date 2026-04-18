# 部署步驟（自架）

> 假設你已有一台 Linux VM 跑著 n8n,要把這個 LIFF web 部署上去。

## 1. 準備環境

- Docker 20+ / docker compose v2
- 一個你能改 DNS 的 domain,例如 `example.com`
- 在 DNS 加一筆 A record:`ops.example.com` 指向 VM public IP

## 2. 建立 Supabase 專案

1. 到 https://supabase.com 新建專案（region 選 `ap-southeast-1` 或 `ap-northeast-1` 延遲低）
2. SQL Editor → 貼上 `supabase/migrations/20260419000000_init.sql` 執行
3. Storage → 確認 `clock-photos` bucket 已建（migration 會建,但 dashboard 可再確認）
4. Authentication → Providers → 啟用 **Email**（exchange 路線用 magic link 做 token）
5. 複製 `Project URL` / `anon key` / `service_role key`

## 3. 建立 LINE LIFF

1. https://developers.line.biz/console 建一個 Provider + Channel(LINE Login)
2. LIFF → Add
   - Size: Full
   - Endpoint URL: `https://ops.example.com`
   - Scope: `openid profile`
3. 複製 `LIFF ID`、`Channel ID`

## 4. 填 .env

```bash
cp .env.example .env
vi .env
```

把 Supabase / LIFF / n8n 的值都填進去。

## 5. 起服務

```bash
# 第一次
docker compose up -d --build

# 之後更新
git pull
docker compose up -d --build web
```

檢查:

```bash
docker compose logs -f web
curl -I https://ops.example.com
```

## 6. 新增第一個員工

Supabase Studio → Table editor → `employees` 新增自己這筆:

- `line_user_id` = （怎麼拿?先開一次 LIFF,從錯誤頁看到的前 10 碼,去 Supabase logs 可看到完整的 id;或用 console.log(liff.getProfile().userId)）
- `display_name` = 你的名字
- `role` = `owner`
- `active` = `true`

再開 `employee_stores` 把你自己關聯到每家店。

## 7. 重開 LIFF

回到 LINE 裡打開 LIFF URL,應該自動登入、進入狀態頁。
