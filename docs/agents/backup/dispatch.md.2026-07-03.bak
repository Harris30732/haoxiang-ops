# 模型調度守則（dispatch.md）

> 讀者：擔任主對話的 Claude（任何等級）。目的：主對話當指揮官，context 只放結論，
> 執行與大量讀取交給 subagent。判斷類問題（該不該升級、算不算完成）見 `judgment.md`。

## 1. 指揮官不下場

主對話**自己動手**的條件：單檔小改動、跑指令、看單一檔案的特定段落、跟使用者對話。
以下情境**一律派 subagent**，主對話只收結論：

| 情境 | 派誰 | 附註 |
|------|------|------|
| 掃 repo 找東西（3 個檔案以上、或不確定在哪） | `Explore`（read-only） | 指定搜尋廣度：medium 或 very thorough |
| 查網頁 / 查文件 | `general-purpose` | 要求回傳結論＋來源 URL |
| 批次改多個檔案 | `general-purpose` | 給明確的檔案清單與改法 |
| 規劃複雜實作 | `Plan` | 回傳步驟清單與關鍵檔案 |
| 問 Claude Code 本身怎麼用 | `claude-code-guide` | 不要自己憑記憶答 |
| 驗收別人（或自己）的產出 | `verifier`（見 §6） | fresh context，不給它過程，只給驗收條件 |

反例（不要這樣）：為了回答「業績回報邏輯在哪」，主對話自己連讀
`ARCHITECTURE.md` 全文 + 4 個 tsx 檔 → context 塞爆。
正例：派 Explore：「找出業績回報（revenue report）的判斷邏輯在哪些檔案哪些行，
回傳 檔案:行號 清單與一句話說明」。

## 2. 派工三件套（每個派工 prompt 都要有，模板見 templates.md）

1. **目標與動機**：要做什麼＋為什麼（subagent 看不到主對話，動機能讓它在邊界情況做對選擇）。
2. **驗收條件**：可機械判定的成功標準（「typecheck 過」「回傳至少 3 個 檔案:行號」），
   不要寫「做好做滿」這種無法判定的話。
3. **回報格式**：明確規定回什麼。預設格式見 §4 回報合約。

## 3. 顯式指定 model 與 effort

**每次派工都要顯式指定 model**（Agent 工具的 `model` 參數），不要用預設繼承。
本環境實際可用值：`haiku`、`sonnet`、`opus`（`fable` 只在特殊 session 存在，預設當作不可用）。

| 任務類型 | model | 理由 |
|----------|-------|------|
| 機械式搜尋、grep 彙整、read-back 驗證檔案內容 | `haiku` | 便宜快速，錯了損失小 |
| 一般實作、重構、研究、程式碼驗收 | `sonnet` | 預設主力 |
| 架構決策、難 bug、跨多檔的重構規劃、第二意見評審 | `opus` | 只在 sonnet 等級不夠時用 |

**effort**：主對話用 `/effort` 或 settings.json 的 `effortLevel` 調（值：low/medium/high/xhigh/max，
依模型而定）。subagent 的 effort 只能在 `.claude/agents/*.md` 的 frontmatter `effort:` 欄位預設
（Agent 工具本身沒有 effort 參數）；需要高 effort 的臨時任務就選 `opus` 或把任務拆小。

## 4. 回報合約（寫進每個派工 prompt）

- subagent 只回：**結論、檔案:行號、明確的失敗說明**。不要貼整段程式碼或整份檔案內容。
- 產出超過 30 行（報告、長 diff 說明、彙整表）→ 落檔到
  `/tmp` 下的 scratchpad 或 `docs/agents/reports/`，回傳路徑＋5 行內摘要。
- 失敗要照實回報「試了什麼、卡在哪、錯誤訊息原文」，不准回報模糊的「大致完成」。
- 主對話收到回報後：**不要**為了「確認一下」把 subagent 已讀過的檔案再全文讀一遍；
  抽查用 §6 的驗證規則。

## 5. 升降級路徑

- **haiku 錯 1 次** → 同一子任務直接升 `sonnet` 重派，不要再給 haiku 第二次機會。
- **sonnet 同一子任務連錯 2 次** → 升 `opus`，且 prompt 要附上完整失敗軌跡
  （兩次分別怎麼做、錯誤訊息原文、已排除的假設），不是叫 opus 從零重做。
- **opus 也解不了** → 停下來，把失敗軌跡整理好問使用者（見 judgment.md §3）。
- **降級**：opus/sonnet 解出「模式」後（例如確立了一種改法），把模式寫成明確步驟，
  降回 haiku/sonnet 批次套用到其餘位置。
- **重試上限**：同一件事最多重試 2 輪（原始 1 次＋重試 2 次）。超過就換路或升級，
  嚴禁第 3 次用同樣方法重試。

## 6. 驗證不自驗

寫程式的人不能當驗收的人——包括主對話自己。驗收一律派 **fresh-context** 的
`verifier` agent（定義在 `.claude/agents/verifier.md`，read-only + Bash，不會被實作過程的
假設污染）。給它的 prompt 只放：驗收條件＋要驗的檔案/指令，**不要**告訴它「應該會過」。

| 產出類型 | 驗法 |
|----------|------|
| 檔案/文件 | read-back：驗收者實際讀檔，確認每個承諾的章節/內容存在且無矛盾 |
| 程式碼 | 實跑 `npm run typecheck && npm run lint`（必要時 `npm run build`）＋讀 diff 對照驗收條件 |
| 高風險判斷（架構、資料模型、會動到錢或打卡紀錄的邏輯） | 第二意見：再派一個 `opus` 獨立評審；或產 2-3 個方案派評審選優 |

verifier 回報「不通過」時，回到 §5 的升降級路徑處理，不要跟 verifier 辯論。

## 7. 併發與落檔紀律

- 互相獨立的派工放在同一則訊息一起發（併發），有依賴的才排序。
- 每完成一個交付單位：先寫檔、再 commit + push、才開始下一個。
  本環境隨時可能中斷，沒 push 的等於沒做。
