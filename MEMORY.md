# 晧香營運系統 Memory

## 專案概述
晧香餐飲營運管理 — LINE 打卡機器人 + 工時計算 + Google Sheets 整合

## 技術棧
- **n8n workflow** (Zeabur 部署) — 核心打卡邏輯
- **LINE Messaging API** — 員工打卡介面
- **Google Sheets** — 資料儲存（員工管理/店鋪狀態/工時紀錄）
- **Google Drive** — 打卡照片存放 (Folder: 1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a)
- **Node.js build scripts** — 生成 n8n workflow JSON

## Workflow 版本演進
- v15 (line-clock-in-bot-v15-final.json) — 基礎打卡
- v16 (line-clock-in-bot-v16-refactored.json) — 重構版
- v17 (line-clock-in-bot-v17-statemachine.json, 1971行) — 狀態機版
- **v18 (line-clock-in-bot-v18-dual-state.json, 2110行) — 雙狀態機，最新，尚未部署**

## 核心架構（v18）
雙狀態機設計：
- **店鋪狀態機**：CLOSED → OPEN → SETTLING → CLOSED
- **人員狀態機**：work_status (OFF_DUTY/ON_DUTY) + current_step (IDLE/WAIT_*)
- 「打卡」智慧判斷：根據雙狀態自動決定是開攤/上班/下班/關攤

Google Sheets 工作表：
1. 員工管理（含 work_status, current_store, clock_in_time）
2. 店鋪狀態（即時狀態）
3. 每日店鋪紀錄（每店每天1筆）
4. 每人工時紀錄（每人每天1筆）
5. 分店清單（蘆洲 $2150 / 新莊 $2350 標準零錢）

## 員工配置
| 員工 | 時薪 |
|------|------|
| 阿海(OK) | $210 |
| 阿善(Minh Thiện) | $210 |
| 阿豪(Hào) | $210 |
| 阿和(Hoà 37) | $200 |
| 德勇(鄭德勇) | $200 |
| 阿七(阮文七) | $200 |

## 目前進度
- [x] v17 狀態機 workflow
- [x] v18 雙狀態機 build_v18.js 完成
- [ ] **Phase 2A 尚未部署** — v18 未上線，仍跑 v17（或更早版本）
- [ ] 真實用戶測試
- [ ] 監控告警設定

## Phase 路線圖
- Phase 2A (當前)：店鋪狀態基礎（多人在班基礎邏輯）
- Phase 2B：多人在班 + 下班/關攤
- Phase 3：工時與業績報表
- Phase 4：AI 零錢結算（Gemini Vision）
- Phase 5：外送平台整合
- Phase 6：排班系統
- Phase 7：管理員後台

## Session Log

### 2026-04-08 — Phase 1 巡檢（專案認識）
- 完成初次巡檢，建立完整專案全貌
- 發現 4 個痛點記入 PAIN-POINTS.md
- v18 雙狀態機已生成但未部署是最大風險
- calc_hours.js 有 Windows 路徑和月份硬編碼問題
