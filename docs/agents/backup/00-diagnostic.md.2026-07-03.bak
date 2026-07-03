# 診斷報告：本環境 harness 的三大失效點

> 撰寫：2026-07-03（Fable 5 制度建立 session）。
> 這份是後面所有制度檔的依據。讀者是未來的 Claude session（Sonnet/Opus/Haiku 等級）。
> 其他制度檔案索引見本目錄的 `README.md`。

## 第一名：v1 遺留 agent 檔案與現實矛盾（最容易出錯）

**問題**：repo root 曾有 12 個 OpenClaw v1 時代的檔案（SOUL.md、MEMORY.md、AGENTS.md、
PAIN-POINTS.md、PROJECT-STATUS.md、IDENTITY.md、USER.md、TOOLS.md、HEARTBEAT.md、
TOKEN-USAGE.md、WAKE-SUMMARY.md、memory-store.json、learned-config.json）。
內容描述的是 2026-04-19 已全部砍掉的 v1 架構（Google Sheets、Discord Bot、n8n v18 workflow），
並包含會直接誤導模型的指令：

- SOUL.md 要求「執行任務前先 curl http://localhost:18800/typing」→ 該 middleware 在本環境不存在，照做必失敗。
- AGENTS.md 要求「開場先讀 SOUL.md、USER.md、memory/YYYY-MM-DD.md」→ `memory/` 目錄不存在，且讀了 SOUL.md 就會被 v1 世界觀污染。
- MEMORY.md / PROJECT-STATUS.md 說目前技術棧是 n8n(Zeabur)+Google Sheets、進度是「v18 待部署」→ 全部過時，v2 是 Next.js+Supabase。

**修法（本 session 已執行）**：全部移到 `legacy/v1-agent/`，附 README 說明「僅供考古，內容不可信」。
**未來守則**：發現任何檔案內容與 CLAUDE.md 矛盾時，以 CLAUDE.md 為準，並把矛盾記進
`docs/agents/lessons.md`；不要默默採信其中一邊。

## 第二名：主對話自己下場讀大量原始資料（最漏 token）

**問題**：本環境沒有任何派工規則，模型的預設行為是把整份檔案讀進主對話——
ARCHITECTURE.md 417 行、`supabase/migrations/*.sql`、260KB 的 package-lock.json、
n8n webhook 規格。主對話 context 被原始資料塞爆後，後半段任務品質明顯下降
（忘記早先的決定、重複讀同一檔案、答非所問）。
另外本環境掛了大量 MCP server（Notion、Figma、Google Drive 多半與本 repo 無關），
弱模型容易在錯誤的工具裡打轉。

**修法**：
- 遵守 `docs/agents/dispatch.md` 的「指揮官不下場」規則：凡是「要讀超過 2 個檔案才能回答」
  或「要掃 repo / 查網頁」的事，一律派 subagent，主對話只收結論與 `檔案:行號`。
- 讀單一大檔時用 Read 的 offset/limit 讀你需要的段落，不要整份讀。
- 不確定某 MCP 工具是否相關時：本 repo 日常只需要 GitHub 與 Supabase 的 MCP；
  Notion/Figma/Google Drive 除非使用者明講，否則不要碰。

## 第三名：沒有完成判準，模型自我宣告成功（最容易假完成）

**問題**：專案沒有測試目錄、沒有 CI。commit 規範要求 `[QG:分數]` 但沒有任何 rubric
定義分數怎麼打（git 歷史裡實際都寫 `[QG:skip]`）。結果就是：弱模型改完code、
沒跑任何驗證、直接說「完成了」——而 TypeScript 專案光是 import 打錯就會 build 失敗。

**修法**：
- 最低驗證閘（改任何 `.ts/.tsx` 後必跑）：`npm run typecheck && npm run lint`。
  改到頁面流程或 build 設定再加 `npm run build`。三者任一失敗＝任務未完成，不准回報完成。
- QG 分數 rubric 與「何時算真的完成」的完整判準在 `docs/agents/judgment.md`。
- 驗收不自驗：重要改動由 fresh-context subagent 用 read-back / 實跑來驗，規則在
  `docs/agents/dispatch.md` 的「驗證不自驗」一節。

## 次要觀察（不到前三名，但要知道）

- **無測試設施**：唯一可自動化的驗證是 typecheck/lint/build。任何「跑測試驗證」的指示
  在本 repo 目前等於空話；要驗行為只能實跑 `npm run dev` 或寫臨時腳本。
- **Supabase MCP 直通生產**：`mcp__Supabase__apply_migration` / `execute_sql` 會直接動到
  遠端專案。schema 變動一律走「新增 migration 檔 + 使用者確認」，不要用 MCP 直接改。
- **本環境是 ephemeral container**：沒 push 的東西 session 結束就消失。每完成一個單位
  就 commit + push。
