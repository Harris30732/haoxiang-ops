# 踩坑紀錄（lessons.md）

> 追加式紀錄。格式與精簡規則見 `maintenance.md` §3-§4。新條目加在最上面。

### 2026-07-03 [env] Supabase MCP 直通生產專案
- 現象：本環境掛載的 Supabase MCP（apply_migration/execute_sql）直接操作遠端專案。
- 原因：MCP 設定即如此，無 staging 分流。
- 以後怎麼做：schema 變動只寫 migration 檔進 repo；要動遠端先問使用者。

### 2026-07-03 [env] repo root 曾有 v1 遺留 agent 檔誤導模型
- 現象：SOUL.md/MEMORY.md/AGENTS.md 等描述已砍掉的 v1 架構，還帶著會失敗的指令
  （curl localhost:18800）。
- 原因：v2 重寫時只砍了程式碼，沒清 agent 設定檔。
- 以後怎麼做：已移入 `legacy/v1-agent/`。遇到與 CLAUDE.md 矛盾的檔案，以 CLAUDE.md 為準並記錄。

### 2026-07-03 [project] 本專案沒有測試設施
- 現象：無 tests/、無 CI；唯一自動驗證是 `npm run typecheck` / `lint` / `build`。
- 原因：v2 scaffold 階段尚未建測試。
- 以後怎麼做：驗行為要實跑 dev server 或寫臨時腳本；別在回報裡寫「測試通過」——目前不存在測試。
