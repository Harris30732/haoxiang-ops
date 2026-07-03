# 2026-07-03 制度檔對抗審查紀錄

制度建立 session 的收尾審查。兩個 fresh-context agent 並行：
sonnet（目標讀者視角，測誤讀與可執行性）＋ opus（事實與內部矛盾審計）。
結論：無「照做會造成損害」的指引；共 16 個發現，全部已修正或列為已知限制。

## 高嚴重度（sonnet 發現）→ 全部已修

1. **`verifier` agent type 實測派不出**（自訂 agent 定義只在 session 啟動時載入，
   本 session 中途才建立定義檔）。→ dispatch.md §6 加 fallback：改派
   `general-purpose` + sonnet 並內嵌 verifier.md 內文。judgment.md QG 9-10 同步改。
   **未確認事項：verifier 在下一個新 session 是否正常載入——第一個讀到這行的
   session 請實測派一次，把結果寫進 lessons.md。**
2. **letter.md 指向 legacy 時薪表**，與「不准讀 legacy」矛盾，且 v2 schema 根本沒有
   時薪欄位。→ 改寫為背景說明，明講舊數字不可當現行值。
3. **新容器沒 node_modules，驗證閘必噴假錯**。→ CLAUDE.md 硬規則 1 加
   「先 npm install，TS2307 不是你改壞的」。
4. **重試上限自相矛盾**（「重試 2 次」vs「嚴禁第 3 次」）。→ 重寫為
   「同一方法總共最多 2 次嘗試（haiku 1 次），第 2 次失敗必須換路」。

## 中嚴重度 → 全部已修

5. letter 承諾的審查紀錄不存在 → 就是本檔，letter 已改指向這裡。
6. 「動到頁面流程」無定義 → CLAUDE.md 改為機械判定：`app/` 下任何檔案或
   next/tailwind/tsconfig/package 設定檔。
7. 重構模板要求先知道不變式但沒說怎麼取得 → 模板加「先派搜尋模板查 call site」。
8. subagent 落檔位置模糊（不知道主對話的 scratchpad）→ dispatch.md §4 改為
   明確判定＋要求派工 prompt 給絕對路徑。
9. 無 .env 憑證時「實跑」無標準 → judgment.md §5 加一列：build＋臨時腳本驗邏輯，
   明講「外部整合未實跑」，不要求生產憑證。

## 低嚴重度（opus 發現為主）→ 已修

10. v1 遺留檔「12 個」實為 13 個（off-by-one）→ 已改。
11. 「git 歷史都寫 [QG:skip]」誇大（實為僅有的兩筆標籤是 skip，其餘沒打）→ 已改為精確陳述。
12. v1 是 LINE bot 還是 Discord bot 跨檔不一致 → CLAUDE.md 統一為「LINE 打卡 bot + Discord 營運 bot」。
13. judgment「完成=已 commit」對被禁止 commit 的 subagent 矛盾 → 加註「此條只適用主對話」。
14. QG rubric 沒涵蓋瑣碎 commit（.gitignore 類）→ 加 `[QG:skip]` 條款。
15. letter 用未定義的「交付 A–G」代號 → 改為點名七項交付。
16. verifier「read-only 但含 Bash」縫隙 → 內文明列禁止指令與建置產物例外。

## 已知限制（不修，留給未來）

- verifier 的 read-only 是 prompt 層約束，工具層沒有 Bash allowlist 強制。
  若日後要工具層強制，研究 `.claude/agents` frontmatter 的權限欄位（本次未驗證，勿憑印象寫）。
- 兩位審查員驗證過：所有引用路徑存在、npm scripts 存在、model 名稱與 Agent 工具
  enum 一致、內建 agent types 存在、maintenance.md 的行數上限目前全數滿足。
