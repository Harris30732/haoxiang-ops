# 晧香營運系統 Pain Points

## 格式
每個痛點包含：
- 分類標籤（architecture/performance/bug/efficiency/security）
- 描述
- 發現次數
- 影響評估
- 建議解法

## Pain Points Log

---

### [bug] calc_hours.js 硬編碼 Windows 路徑
- **發現日期**: 2026-04-08
- **發現階段**: Phase 1 巡檢
- **嚴重度**: 中
- **影響**: 無法在 Mac/Linux 環境直接執行工時計算，只能在碰碰的 Windows 電腦跑
- **細節**: `const DIR = String.raw\`C:\Users\R碰碰\OneDrive\桌面\工時計算\``
- **建議**: 改用環境變數或 CLI 參數傳入路徑

---

### [bug] calc_hours.js 硬編碼 2026/03 月份
- **發現日期**: 2026-04-08
- **發現階段**: Phase 1 巡檢
- **嚴重度**: 中
- **影響**: 每個月都要手動改程式碼才能跑工時計算，容易忘記、容易出錯
- **細節**: `if (wy !== 2026 || wm !== 3) continue;` 和 `for (let day = 1; day <= 31; day++) { const dateKey = \`2026/03/...\``
- **建議**: 改為動態計算當月或接受命令行參數 `node calc_hours.js 2026 04`

---

### [architecture] v18 Workflow 尚未部署，生產環境可能仍在跑舊版
- **發現日期**: 2026-04-08
- **發現階段**: Phase 1 巡檢
- **嚴重度**: 高
- **影響**: 雙狀態機設計（v18）已完成但未上線，Phase 2A 目標無法達成；多人在班場景可能出錯
- **細節**: `line-clock-in-bot-v18-dual-state.json` 存在但 PROJECT-STATUS.md 顯示未部署
- **建議**: 確認 n8n 上目前跑的是哪個版本，規劃 v18 部署計畫並測試

---

### [efficiency] Workflow JSON 靠 build script 生成但缺乏測試
- **發現日期**: 2026-04-08
- **發現階段**: Phase 1 巡檢
- **嚴重度**: 中
- **影響**: v18 共 2110 行 JSON，全靠 build_v18.js 手動生成，無自動化測試驗證邏輯正確性；修改風險大
- **細節**: 無 tests/ 目錄，無 CI/CD pipeline
- **建議**: 加入 n8n workflow 的基礎 smoke test（打卡模擬腳本），或在部署後加測試帳號驗證流程

---
