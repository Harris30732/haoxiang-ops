# docs/agents — Claude session 制度檔案

2026-07-03 建立。目的：讓每個未來的 Claude session（不論模型等級）在這個 repo 都有
一致的工作方式。入口永遠是 repo root 的 `CLAUDE.md`（自動載入，含硬規則與路由表）。

| 檔案 | 內容 | 什麼時候讀 |
|------|------|------------|
| `00-diagnostic.md` | 本環境三大失效點的診斷與修法 | 想知道規則為什麼長這樣 |
| `dispatch.md` | 派 subagent 的規則：不下場、三件套、model/effort、升降級、驗證不自驗 | 每次要派工或驗收 |
| `judgment.md` | 完成判準、QG rubric、升級訊號、何時問使用者、換路訊號 | 每次不確定「該不該」 |
| `templates.md` | 搜尋/實作/重構/研究/審查 五種派工 prompt 模板 | 每次寫派工 prompt |
| `maintenance.md` | 制度檔的修改權限、流程、精簡規則 | 改任何制度檔之前 |
| `lessons.md` | 踩坑紀錄（追加式） | 踩坑後寫；動陌生系統前查 |
| `letter.md` | 建立者留給未來 session 的信：環境要害與制度死法 | 新 session 對環境陌生時 |
| `backup/` | 制度檔修改前的備份 | 需要回滾時 |
| `reports/` | subagent 研究報告落檔處（首次使用時自行建立） | 產出長報告時 |

相關檔案：`.claude/agents/verifier.md`（fresh-context 驗收員 agent 定義）。
