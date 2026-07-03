# 給未來 session 的信（letter.md）

> 2026-07-03，由建立這套制度的 session 所寫。讀者是你——某個未來在這個 repo 醒來、
> 對環境陌生的 Claude。先讀 CLAUDE.md，再讀這封信。

## 三件沒人問、但你最需要知道的事

### 1. 這個 repo 的資料是員工的薪水，正確性排第一
打卡時間、工時、業績回報最終會變成真人的薪資與對帳依據——v1 的歷史紀錄顯示
打卡數據直接換算時薪；v2 schema 目前沒有時薪欄位，薪資計算在 repo 之外進行。
（legacy 裡有一份 v1 時薪表，但那是舊資料，不可當現行值，也不要為此去翻 legacy。）所以：
- 任何時間邏輯都要想時區：伺服器/DB 是 UTC，門市營運在 Asia/Taipei，
  「開攤 1 小時內免報業績」這種窗口算錯 = 錢的糾紛。
- 寧可打卡流程報錯擋住員工（他會找老闆），也不要默默寫入錯誤紀錄（一個月後才發現）。
- 這也是為什麼 judgment.md 對「會動到打卡/業績的邏輯」要求第二意見。

### 2. repo ≠ 生產環境，漂移是這個專案的宿命
生產是自架的 Docker + Supabase 遠端專案 + n8n，都不在 repo 的控制範圍內。
v1 就是這樣爛掉的：repo 裡 v18 寫好了，生產還在跑 v17，文件說的和線上跑的是兩回事。
所以：不要假設 `ARCHITECTURE.md` 或 migration 檔等於線上現況；要動生產相關的東西，
先用 Supabase MCP 的**唯讀**工具（list_tables、list_migrations）核對現況，再動手。
發現漂移就記進 lessons.md 並告訴使用者。

### 3. 使用者是單人老闆，不是工程團隊（此條為推斷，非本人自述）
從歷史看（v1 的 SOUL.md、Discord 提案卡、QG 制度），使用者偏好：結論先行的繁體中文短回報、
「建議＋一個明確問題」而不是開放式選項轟炸、系統自己會維護自己。
對你的意義：他不會幫你 code review——verifier 與驗證閘就是你的 reviewer，別跳過；
問問題前先給你的建議選項（AskUserQuestion 的第一個選項放推薦解）。

## 這套制度最可能的四種死法（與預防）

1. **當場放寬**：某次驗證閘不過，模型「先跳過，之後再補」→ 下個 session 有樣學樣 → 制度名存實亡。
   預防：maintenance.md §1 有「永遠不准」條款；規則擋路只有兩條路——照做或問使用者。
2. **儀式化**：照抄 templates.md 但填空敷衍（驗收條件寫「功能正常」這種無法判定的話）。
   模板的價值在可機械判定的驗收條件，不在格式本身。發現自己在敷衍填空，等於沒派工三件套。
3. **膨脹**：每個 session 都往 CLAUDE.md 和 lessons.md 加東西，兩年後 CLAUDE.md 500 行，
   每個 session 開場先燒一萬 token。預防：maintenance.md §4 的行數上限是硬的，超了就精簡。
4. **失傳**：某個 session 覺得「這些 docs 過時了」整批刪掉。預防：刪制度檔要先問使用者
   （maintenance.md §1）；備份在 `docs/agents/backup/` 與 git 歷史，真被刪了可以考古回來。

## 本 session 的交接狀態

- 全部交付已完成並 push 到 `claude/fable5-system-design-7lo2my`，共七項：
  診斷（00-diagnostic.md）、CLAUDE.md 重寫、調度守則（dispatch.md）、判斷力外化
  （judgment.md）、派工模板（templates.md）、維護協議（maintenance.md + lessons.md）、本信。
- 對抗審查（sonnet 讀者視角 + opus 事實審計，兩個 fresh-context agent）的發現與修正紀錄：
  `docs/agents/reports/2026-07-03-adversarial-review.md`。
- 未做（留給有需要的 session）：專案測試設施（tests/ + CI）仍不存在，
  若使用者要求提升可靠性，這是第一優先建設。

## 制度的極限（誠實條款）

這套制度能把「執行品質」補到接近建立它的模型：拆解、獨立驗收、失敗軌跡升級、多答案評審。
它補不了兩件事——**模糊題**（要求本身無對錯）與**品味判斷**（取捨的輕重）。
遇到這兩種，照 judgment.md §6：多方案讓使用者選、升最強可用模型加第二意見、
或直說「這題我做不到可靠判斷」。誠實的「做不到」比自信的錯誤便宜得多。
