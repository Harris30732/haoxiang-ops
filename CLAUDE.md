# 晧香專案 (haoxiang-ops)

## 專案概述
皓香營運系統 — 打卡機器人 + 營運管理

## 功能模組

### 打卡機器人（StoreOps Bot）
- LINE Bot → 員工打卡（上班/下班/開店/關店）
- 智慧判斷打卡意圖（ON_DUTY/OFF_DUTY/OPEN_STORE 等）
- n8n workflow 處理打卡邏輯
- Google Sheets 記錄工時

### 營運管理
- 計算店鋪狀態（開店/關店/人數）
- 員工工時計算與統計
- Google Sheets + Apps Script 自動化

## 技術棧
- n8n workflow（v16-v18 迭代）
- LINE Messaging API
- Google Sheets API + Apps Script
- Node.js build scripts

## 關鍵檔案
- `build_v18.js` — 最新版 workflow 建構器
- `calc_hours.js` — 工時計算工具
- `write_to_sheets.js` — Google Sheets 寫入
- `sheets_script.gs` — Apps Script
- `line-clock-in-bot-v18-dual-state.json` — 最新 n8n workflow
- `_archive/` — 舊版本存檔

## 開發規範
- 讀 MEMORY.md 了解上次進度
- 完成後必須更新 MEMORY.md
- commit 格式：`<type>: <description> [QG:分數]`
- n8n workflow 改動要先 build → test → deploy
