# haoxiang-ops — 專案進度

> 最後更新：2026-03-26 by Claude Code
> 專案：StoreOps Bot v17（LINE 打卡機器人）

## 技術棧
n8n (Zeabur) + LINE Messaging API + Google Sheets + Google Drive

## 目前狀態：v17 完成，Git clean，待部署驗證

### Workflow 檔案
- line-clock-in-bot-v17-statemachine.json — 64KB, 1,971 行
- line-clock-in-bot-v16-refactored.json — 備份
- build_v17.js — 41KB 工作流生成器

### Git 狀態
- Branch: main, up to date with origin
- 4 commits, latest: `65c1ed2 chore: sync to OpenClaw workspace`
- 未追蹤: PROJECT-STATUS.md
- Clean working directory

### 已完成
- [x] v17 狀態機 workflow
- [x] 雙語支援（繁中 + 越南語）
- [x] 打卡/退勤/營收/照片上傳
- [x] FALLBACK 錯誤處理
- [x] build_v17.js 生成器

### 下一步
1. 部署 v17 到生產 n8n (haoxiang.zeabur.app)
2. 真實 LINE 用戶測試
3. 驗證照片系統（LINE URL 30 分鐘過期）
4. 測試狀態機: IDLE → WAIT_STORE → WAIT_PHOTO/WAIT_REVENUE → IDLE
5. 設定監控告警
