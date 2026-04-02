/**
 * StoreOps Bot v18 - 雙狀態機架構（店鋪 + 人員）
 *
 * 基於 v17 擴充，不動 v17。核心改變：
 *   1. 店鋪狀態機：CLOSED / OPEN / SETTLING
 *   2. 人員勤務狀態：work_status (OFF_DUTY/ON_DUTY) + current_store
 *   3. 「打卡」智慧判斷：自動偵測開攤/上班/下班/關攤
 *   4. 多人同時在班支援（接班≠換班）
 *   5. 每店每天1筆、每人每天1筆紀錄
 *
 * Google Sheets 資料表:
 *   員工管理         - UserID, 暱稱, 角色, Language, current_step, temp_data, work_status, current_store, clock_in_time, 入職日, 時薪, 證件照片
 *   店鋪狀態         - 店鋪名稱, 狀態, 開攤時間, 開攤人, 在班人員, 在班人數, 今日日期, 更新時間
 *   每日店鋪紀錄     - 日期, 店名, 開攤時間, 關攤時間, 營業時數, 人員工時明細, 鈔票金額, 當日業績, 備註
 *   每人工時紀錄     - 日期, 員工姓名, 店名, 上班時間, 下班時間, 工時, 備註
 *   分店清單         - 分店清單, 標準零錢數
 *
 * Google Drive Folder: 1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a (機器人存圖區)
 */

const fs = require('fs');
const v16 = JSON.parse(fs.readFileSync('line-clock-in-bot-v16-refactored.json', 'utf8'));

// ============= 常數 =============
const SHEET_ID = '1ILgphAVTKI5KIpCJKrT5anlF4GQK8YoHf8JAtAnMN7o';
const DRIVE_FOLDER_ID = '1k4rfsjHYYXO8He7MUbTZoNJivDJkcn2a';

// ============= 工具函式（同 v17）=============
function findV16(name) { return v16.nodes.find(n => n.name === name); }

const nodes = [];
const connections = {};
let seq = 1;

function mkId(name) { return 'v18-' + name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20) + '-' + (seq++); }

function clone(srcName, newName, posX, posY) {
  const src = findV16(srcName);
  if (!src) throw new Error('Missing v16 node: ' + srcName);
  const n = JSON.parse(JSON.stringify(src));
  n.name = newName; n.id = mkId(newName); n.position = [posX, posY];
  return n;
}

function codeN(name, jsCode, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('前置處理')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY]; n.parameters.jsCode = jsCode;
  return n;
}

function switchN(name, field, vals, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('狀態路由')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.rules.values = vals.map(v => ({
    conditions: {
      options: { caseSensitive: true, typeValidation: 'strict' },
      conditions: [{ leftValue: '={{ $json.' + field + ' }}', rightValue: v.value, operator: { type: 'string', operation: 'equals' } }],
      combinator: 'and'
    }, renameOutput: true, outputKey: v.key
  }));
  return n;
}

function ifN(name, leftValue, operation, rightValue, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('員工是否存在')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.conditions.conditions = [{ id: mkId('cond'), leftValue, rightValue, operator: { type: 'string', operation } }];
  return n;
}

function sheetsLookup(name, sheetName, filters, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('查詢員工表')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  n.parameters.filtersUI = { values: filters };
  return n;
}

function sheetsAppend(name, sheetName, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('建立新員工')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  n.parameters.columns = { mappingMode: 'autoMapInputData', value: {} };
  return n;
}

function sheetsUpdate(name, sheetName, posX, posY) {
  const n = JSON.parse(JSON.stringify(findV16('重置(取消)')));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  n.parameters.operation = 'appendOrUpdate';
  n.parameters.columns = { mappingMode: 'autoMapInputData', value: {}, matchingColumns: ['UserID'] };
  return n;
}

function sheetsGetAll(name, sheetName, posX, posY) {
  const ref = findV16('讀取分店清單');
  const n = JSON.parse(JSON.stringify(ref));
  n.name = name; n.id = mkId(name); n.position = [posX, posY];
  n.parameters.sheetName = { __rl: true, value: sheetName, mode: 'name' };
  return n;
}

function add(n) { nodes.push(n); return n.name; }
function conn(from, to, fromIdx = 0) {
  if (!connections[from]) connections[from] = { main: [] };
  while (connections[from].main.length <= fromIdx) connections[from].main.push([]);
  connections[from].main[fromIdx].push({ node: to, type: 'main', index: 0 });
}

// ======================================================================
// 1. 前置處理管線（Webhook → 擷取 → 前置 → 查詢員工+店鋪）
// ======================================================================
add(clone('LINE Webhook', 'LINE Webhook', -2000, 300));
add(clone('擷取訊息資訊', '擷取訊息資訊', -1760, 300));
conn('LINE Webhook', '擷取訊息資訊');

// Fix: n8n expressions don't support optional chaining
{
  const n = nodes.find(x => x.name === '擷取訊息資訊');
  if (n && n.parameters && n.parameters.assignments) {
    const fix = {
      msgType:    "={{ $json.body.events[0].message ? $json.body.events[0].message.type : 'postback' }}",
      msgText:    "={{ $json.body.events[0].message ? $json.body.events[0].message.text : '' }}",
      postbackData: "={{ $json.body.events[0].postback ? $json.body.events[0].postback.data : '' }}",
      msgId:      "={{ $json.body.events[0].message ? $json.body.events[0].message.id : '' }}"
    };
    n.parameters.assignments.assignments = n.parameters.assignments.assignments.map(a =>
      fix[a.name] ? { ...a, value: fix[a.name] } : a
    );
  }
}

add(clone('前置處理', '前置處理', -1520, 300));
conn('擷取訊息資訊', '前置處理');

// 查詢員工表
add(sheetsLookup('查詢員工表', '員工管理', [{ lookupColumn: 'UserID', lookupValue: '={{ $json.userId }}' }], -1280, 200));
{ const n = nodes.find(x => x.name === '查詢員工表'); if (n) n.alwaysOutputData = true; }
conn('前置處理', '查詢員工表');

// ★ v18 新增：查詢所有店鋪狀態（與查詢員工表並行）
add(sheetsGetAll('查詢店鋪狀態', '店鋪狀態', -1280, 400));
conn('前置處理', '查詢店鋪狀態');

// 員工是否存在
add(clone('員工是否存在', '員工是否存在', -1040, 200));
conn('查詢員工表', '員工是否存在');

// ======================================================================
// 2. 新員工路徑（同 v17）
// ======================================================================
add(clone('取得LINE個資', '取得LINE個資', -800, 550));
conn('員工是否存在', '取得LINE個資', 1);

add(codeN('準備新員工資料', `
const userId = $('擷取訊息資訊').item.json.userId;
const displayName = $('取得LINE個資').item.json.displayName || '新朋友';
const today = $('前置處理').item.json.today || '';
return { json: { UserID: userId, '暱稱': displayName, '角色': 'employee', '入職日': today, '離職日': '', '時薪': '', '備註': '', '證件照片': '', current_step: 'WAIT_LANG', temp_data: '', Language: '', work_status: 'OFF_DUTY', current_store: '', clock_in_time: '' } };
`, -560, 550));
conn('取得LINE個資', '準備新員工資料');

add(sheetsAppend('建立新員工', '員工管理', -320, 550));
conn('準備新員工資料', '建立新員工');

add(codeN('回覆語言選單', `
const userId = $('擷取訊息資訊').item.json.userId;
const displayName = $('取得LINE個資').item.json.displayName || '新朋友';
return { json: {
  replyToken: $('擷取訊息資訊').item.json.replyToken, userId,
  updateEmp: null, updateStore: null,
  replyMessages: [{ type: 'text', text: '👋 歡迎 ' + displayName + '！\\n請選擇您的語言 / Vui lòng chọn ngôn ngữ:', quickReply: { items: [
    { type: 'action', action: { type: 'postback', label: '🇹🇼 中文', data: 'action=lang&value=zh-TW' } },
    { type: 'action', action: { type: 'postback', label: '🇻🇳 Tiếng Việt', data: 'action=lang&value=vi-VN' } }
  ] } }]
} };
`, -80, 550));
conn('建立新員工', '回覆語言選單');

// ======================================================================
// 3. 既有員工路徑 → 讀取狀態（含店鋪狀態）→ 意圖路由
// ======================================================================
add(codeN('讀取狀態與翻譯', `
const prev = $('前置處理').item.json;
const emp = $('查詢員工表').item.json;
// ★ v18: 讀取所有店鋪狀態
const allStores = $('查詢店鋪狀態').all().map(i => i.json);
let step = emp.current_step || 'IDLE';
let tempData = {};
try { tempData = JSON.parse(emp.temp_data || '{}'); } catch(e) { tempData = {}; }
const lang = emp.Language || 'zh-TW';
const workStatus = emp.work_status || 'OFF_DUTY';
const currentStore = emp.current_store || '';
// 解析 postbackData
let postbackAction = '';
let postbackValue = '';
if (prev.postbackData) {
  const pairs = prev.postbackData.split('&');
  pairs.forEach(p => { const [k,v] = p.split('='); if (k === 'action') postbackAction = decodeURIComponent(v||''); if (k === 'value') postbackValue = decodeURIComponent(v||''); });
}
// 找出 OPEN 的店鋪
const openStores = allStores.filter(s => s['狀態'] === 'OPEN');
// 找出此人所在店鋪的在班人數
let myStoreOnDutyCount = 0;
if (currentStore) {
  const myStore = allStores.find(s => s['店鋪名稱'] === currentStore);
  if (myStore && myStore['在班人員']) {
    myStoreOnDutyCount = myStore['在班人員'].split(',').filter(s => s.trim()).length;
  }
}
const T = {
  'zh-TW': {
    selectStore: '📍 請選擇要開攤的門市：',
    selectStoreClockIn: '📍 請選擇要上班的門市：',
    photoIn: '📸 請上傳【上班/開攤照片】：',
    photoOut: '📸 請上傳【下班/收攤照片】：',
    photoId: '📸 請上傳您的【證件照】以完成註冊：',
    cancel: '❌ 已取消操作，狀態已重置。',
    clockInDone: '✅ 上班打卡成功！',
    clockOutDone: '✅ 下班打卡成功！辛苦了 🎉',
    openStoreDone: '✅ 開攤成功！',
    closeStoreDone: '✅ 關攤結算完成！',
    askCloseOrOut: '您是店裡最後一人，請選擇：',
    enterRevenue: '💰 請輸入鈔票金額（純數字）：',
    invalidNum: '❌ 請輸入有效的數字（純數字）',
    regDone: '✅ 註冊完成！\\n📋 使用說明：\\n• 輸入「打卡」開始上班\\n• 上班中再輸入「打卡」即可下班\\n祝工作順利！💪',
    alreadyWorking: '⚠️ 您目前已在上班中，再次輸入「打卡」即可下班。',
    unknownCmd: '🤔 我不太理解您的訊息。\\n上班/下班請輸入「打卡」。',
    cantCloseOthers: '⚠️ 目前還有其他人在班，請先讓他們下班再關攤。',
    alreadyInStore: '⚠️ 您目前正在 {store} 上班中，請先下班再操作。'
  },
  'vi-VN': {
    selectStore: '📍 Vui lòng chọn cửa hàng để mở：',
    selectStoreClockIn: '📍 Vui lòng chọn cửa hàng：',
    photoIn: '📸 Tải ảnh chấm công vào：',
    photoOut: '📸 Tải ảnh chấm công ra：',
    photoId: '📸 Tải lên ảnh giấy tờ để hoàn tất đăng ký：',
    cancel: '❌ Đã hủy thao tác.',
    clockInDone: '✅ Chấm công vào thành công!',
    clockOutDone: '✅ Chấm công ra thành công! 🎉',
    openStoreDone: '✅ Mở cửa hàng thành công!',
    closeStoreDone: '✅ Đóng cửa hàng hoàn tất!',
    askCloseOrOut: 'Bạn là người cuối cùng, chọn：',
    enterRevenue: '💰 Nhập số tiền (chỉ số)：',
    invalidNum: '❌ Vui lòng nhập số hợp lệ',
    regDone: '✅ Đăng ký hoàn tất!\\n📋 Hướng dẫn：\\n• Nhập "打卡" để chấm công\\nChúc làm việc vui！',
    alreadyWorking: '⚠️ Bạn đang làm việc. Nhập "打卡" để chấm công ra.',
    unknownCmd: '🤔 Không hiểu tin nhắn. Nhập "打卡" để chấm công.',
    cantCloseOthers: '⚠️ Còn người khác đang làm, vui lòng đợi.',
    alreadyInStore: '⚠️ Bạn đang ở {store}, hãy chấm công ra trước.'
  }
};
if (postbackAction === 'cancel') { step = '__CANCEL__'; }
return { json: { ...prev, emp, step, tempData, lang, workStatus, currentStore, postbackAction, postbackValue, allStores, openStores, myStoreOnDutyCount, t: T[lang] || T['zh-TW'] } };
`, -800, 100));
conn('員工是否存在', '讀取狀態與翻譯', 0);

// ======================================================================
// 4. ★ v18 打卡智慧判斷 + 意圖路由
// ======================================================================
add(codeN('打卡智慧判斷', `
const d = $json;
// 如果不在 IDLE 狀態，走原有對話流程
if (d.step !== 'IDLE' && d.step !== '__CANCEL__') {
  return { json: { ...d, intent: d.step } };
}
if (d.step === '__CANCEL__') {
  return { json: { ...d, intent: 'CANCEL' } };
}
// IDLE 狀態：判斷使用者意圖
const txt = d.msgText.trim();
const isClock = (txt === '打卡' || txt.toLowerCase() === 'chấm công');
if (!isClock) {
  return { json: { ...d, intent: 'UNKNOWN' } };
}
// ★ v18 核心：打卡智慧判斷
if (d.workStatus === 'OFF_DUTY') {
  if (d.openStores.length === 0) {
    // 沒有店開著 → 開攤流程
    return { json: { ...d, intent: 'OPEN_STORE' } };
  } else {
    // 有店開著 → 上班流程
    return { json: { ...d, intent: 'CLOCK_IN' } };
  }
} else {
  // ON_DUTY
  if (d.myStoreOnDutyCount > 1) {
    // 店裡還有其他人 → 直接下班
    return { json: { ...d, intent: 'CLOCK_OUT' } };
  } else {
    // 只剩自己 → 問下班還是關攤
    return { json: { ...d, intent: 'ASK_CLOSE_OR_OUT' } };
  }
}
`, -560, 100));
conn('讀取狀態與翻譯', '打卡智慧判斷');

// 意圖路由
add(switchN('意圖路由', 'intent', [
  { key: 'CANCEL', value: 'CANCEL' },
  { key: 'UNKNOWN', value: 'UNKNOWN' },
  { key: 'OPEN_STORE', value: 'OPEN_STORE' },
  { key: 'CLOCK_IN', value: 'CLOCK_IN' },
  { key: 'CLOCK_OUT', value: 'CLOCK_OUT' },
  { key: 'ASK_CLOSE_OR_OUT', value: 'ASK_CLOSE_OR_OUT' },
  { key: 'WAIT_LANG', value: 'WAIT_LANG' },
  { key: 'WAIT_STORE', value: 'WAIT_STORE' },
  { key: 'WAIT_PHOTO', value: 'WAIT_PHOTO' },
  { key: 'WAIT_REVENUE', value: 'WAIT_REVENUE' },
  { key: 'WAIT_CLOSE_REVENUE', value: 'WAIT_CLOSE_REVENUE' }
], -320, 100));
conn('打卡智慧判斷', '意圖路由');

// === CANCEL ===
add(codeN('處理取消', `
return { json: { replyToken: $json.replyToken, userId: $json.userId, updateEmp: { current_step: 'IDLE', temp_data: '' }, updateStore: null, replyMessages: [{ type: 'text', text: $json.t.cancel }] } };
`, 200, -400));
conn('意圖路由', '處理取消', 0);

// === UNKNOWN ===
add(codeN('處理未知', `
return { json: { replyToken: $json.replyToken, userId: $json.userId, updateEmp: null, updateStore: null, replyMessages: [{ type: 'text', text: $json.t.unknownCmd }] } };
`, 200, -300));
conn('意圖路由', '處理未知', 1);

// === OPEN_STORE: 讀分店清單 → 組裝選單 ===
add(sheetsGetAll('讀取分店清單', '分店清單', 200, -200));
conn('意圖路由', '讀取分店清單', 2);

add(codeN('組裝開攤選單', `
const stores = $input.all().map(item => item.json['分店清單']).filter(s => s && s.trim());
const d = $('打卡智慧判斷').first().json;
const items = stores.map(s => ({ type: 'action', action: { type: 'postback', label: s, data: 'action=select_store&value=' + encodeURIComponent(s) + '&mode=open' } }));
items.push({ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } });
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: { current_step: 'WAIT_STORE', temp_data: JSON.stringify({ intent: 'OPEN_STORE' }) }, updateStore: null, replyMessages: [{ type: 'text', text: d.t.selectStore, quickReply: { items } }] } };
`, 420, -200));
conn('讀取分店清單', '組裝開攤選單');

// === CLOCK_IN: 只顯示已開的店 ===
add(codeN('組裝上班選單', `
const d = $json;
const items = d.openStores.map(s => {
  const count = (s['在班人員'] || '').split(',').filter(x => x.trim()).length;
  return { type: 'action', action: { type: 'postback', label: s['店鋪名稱'] + ' (營業中 - ' + count + '人)', data: 'action=select_store&value=' + encodeURIComponent(s['店鋪名稱']) + '&mode=clockin' } };
});
items.push({ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } });
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: { current_step: 'WAIT_STORE', temp_data: JSON.stringify({ intent: 'CLOCK_IN' }) }, updateStore: null, replyMessages: [{ type: 'text', text: d.t.selectStoreClockIn, quickReply: { items } }] } };
`, 200, -100));
conn('意圖路由', '組裝上班選單', 3);

// === CLOCK_OUT: 確認下班 ===
add(codeN('處理下班', `
const d = $json;
const cameraItems = [
  { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
  { type: 'action', action: { type: 'cameraRoll', label: '🖼️ 相簿' } },
  { type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }
];
return { json: { replyToken: d.replyToken, userId: d.userId,
  updateEmp: { current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'clockout', store: d.currentStore, clock_in_time: d.emp.clock_in_time || '' }) },
  updateStore: null,
  replyMessages: [{ type: 'text', text: d.t.photoOut, quickReply: { items: cameraItems } }]
} };
`, 200, 0));
conn('意圖路由', '處理下班', 4);

// === ASK_CLOSE_OR_OUT: 問下班還是關攤 ===
add(codeN('詢問關攤或下班', `
const d = $json;
return { json: { replyToken: d.replyToken, userId: d.userId,
  updateEmp: { current_step: 'WAIT_STORE', temp_data: JSON.stringify({ intent: 'ASK_CLOSE_OR_OUT', store: d.currentStore }) },
  updateStore: null,
  replyMessages: [{ type: 'text', text: d.t.askCloseOrOut + '\\n📍 ' + d.currentStore, quickReply: { items: [
    { type: 'action', action: { type: 'postback', label: '🚶 下班（暫不關攤）', data: 'action=select_action&value=clockout' } },
    { type: 'action', action: { type: 'postback', label: '🔒 關攤結算', data: 'action=select_action&value=close_store' } },
    { type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }
  ] } }]
} };
`, 200, 100));
conn('意圖路由', '詢問關攤或下班', 5);

// === WAIT_LANG（同 v17）===
add(codeN('處理WAIT_LANG', `
const d = $json;
if (d.postbackAction === 'lang') {
  const selectedLang = d.postbackValue;
  const msgs = { 'zh-TW': '✅ 語言設定為【中文】\\n📸 請上傳您的【證件照】完成註冊：', 'vi-VN': '✅ Đã chọn【Tiếng Việt】\\n📸 Tải lên ảnh giấy tờ để đăng ký：' };
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: { Language: selectedLang, current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'id_card' }) }, updateStore: null, replyMessages: [{ type: 'text', text: msgs[selectedLang] || msgs['zh-TW'] }] } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, updateStore: null, replyMessages: [{ type: 'text', text: '👋 請先選擇語言 / Vui lòng chọn ngôn ngữ' }] } };
`, 200, 200));
conn('意圖路由', '處理WAIT_LANG', 6);

// === WAIT_STORE: 處理選店回調 ===
add(codeN('處理WAIT_STORE', `
const d = $json;
const t = d.t;
const td = d.tempData || {};
const cameraItems = [
  { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
  { type: 'action', action: { type: 'cameraRoll', label: '🖼️ 相簿' } },
  { type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }
];
// 處理關攤/下班選擇
if (d.postbackAction === 'select_action') {
  const store = td.store || d.currentStore;
  if (d.postbackValue === 'close_store') {
    // 進入關攤：先拍照
    return { json: { replyToken: d.replyToken, userId: d.userId,
      updateEmp: { current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'close_store', store, clock_in_time: d.emp.clock_in_time || '' }) },
      updateStore: null,
      replyMessages: [{ type: 'text', text: t.photoOut, quickReply: { items: cameraItems } }] } };
  }
  if (d.postbackValue === 'clockout') {
    // 普通下班：拍照
    return { json: { replyToken: d.replyToken, userId: d.userId,
      updateEmp: { current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'clockout', store, clock_in_time: d.emp.clock_in_time || '' }) },
      updateStore: null,
      replyMessages: [{ type: 'text', text: t.photoOut, quickReply: { items: cameraItems } }] } };
  }
}
// 處理選店
if (d.postbackAction === 'select_store') {
  const store = d.postbackValue;
  // 解析 mode（從 postbackData 原始字串）
  let mode = 'open';
  if (d.postbackData && d.postbackData.includes('mode=clockin')) mode = 'clockin';
  if (td.intent === 'CLOCK_IN') mode = 'clockin';
  if (mode === 'open') {
    // 開攤：拍照
    return { json: { replyToken: d.replyToken, userId: d.userId,
      updateEmp: { current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'open_store', store }) },
      updateStore: null,
      replyMessages: [{ type: 'text', text: t.photoIn, quickReply: { items: cameraItems } }] } };
  } else {
    // 上班：拍照
    return { json: { replyToken: d.replyToken, userId: d.userId,
      updateEmp: { current_step: 'WAIT_PHOTO', temp_data: JSON.stringify({ action: 'clockin', store }) },
      updateStore: null,
      replyMessages: [{ type: 'text', text: t.photoIn, quickReply: { items: cameraItems } }] } };
  }
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, updateStore: null, replyMessages: [{ type: 'text', text: t.selectStore }] } };
`, 200, 300));
conn('意圖路由', '處理WAIT_STORE', 7);

// === WAIT_PHOTO: 處理照片上傳 ===
add(codeN('處理WAIT_PHOTO', `
const d = $json; const t = d.t; const action = d.tempData.action || '';
const cameraItems = [
  { type: 'action', action: { type: 'camera', label: '📷 拍照' } },
  { type: 'action', action: { type: 'cameraRoll', label: '🖼️ 相簿' } },
  { type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }
];
if (d.msgType !== 'image') {
  const hint = action === 'id_card' ? t.photoId : (action.includes('clock') || action === 'open_store' ? t.photoIn : t.photoOut);
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, updateStore: null, replyMessages: [{ type: 'text', text: '⚠️ ' + hint, quickReply: { items: cameraItems } }], hasPhoto: 'no' } };
}
const empName = d.emp['暱稱'] || 'unknown';
const store = d.tempData.store || '';
const dateStr = (d.today || '').replace(/\\//g, '-');
const timeStr = (d.currentTime || '').replace(/:/g, '-');
const photoDownloadUrl = 'https://api-data.line.me/v2/bot/message/' + d.msgId + '/content';
// 照片檔名
let fileName = '';
if (action === 'id_card') {
  fileName = '[' + empName + '][證件照][' + dateStr + '_' + timeStr + '].jpg';
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: { current_step: 'IDLE', temp_data: '' }, updateStore: null, replyMessages: [{ type: 'text', text: t.regDone }], hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'id_card' } };
}
if (action === 'open_store') {
  fileName = '[' + empName + '][' + store + '][開攤][' + dateStr + '_' + timeStr + '].jpg';
  const nickname = empName;
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'IDLE', temp_data: '', work_status: 'ON_DUTY', current_store: store, clock_in_time: d.currentTime },
    updateStore: { store, action: 'open', opener: nickname, time: d.currentTime, date: d.today },
    replyMessages: [{ type: 'text', text: t.openStoreDone + '\\n📍 ' + store + '\\n⏰ 開攤時間: ' + d.currentTime + '\\n👤 開攤人: ' + nickname }],
    hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'open_store',
    recordAction: 'open_store',
    recordData: { workDay: d.today, currentTime: d.currentTime, fullTimestamp: d.fullTimestamp, store, nickname }
  } };
}
if (action === 'clockin') {
  fileName = '[' + empName + '][' + store + '][上班][' + dateStr + '_' + timeStr + '].jpg';
  const nickname = empName;
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'IDLE', temp_data: '', work_status: 'ON_DUTY', current_store: store, clock_in_time: d.currentTime },
    updateStore: { store, action: 'add_staff', staffName: nickname },
    replyMessages: [{ type: 'text', text: t.clockInDone + '\\n📍 ' + store + '\\n⏰ ' + d.currentTime }],
    hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'clockin',
    recordAction: 'clockin',
    recordData: { workDay: d.today, currentTime: d.currentTime, fullTimestamp: d.fullTimestamp, store, nickname }
  } };
}
if (action === 'clockout') {
  fileName = '[' + empName + '][' + store + '][下班][' + dateStr + '_' + timeStr + '].jpg';
  const nickname = empName;
  const clockInTime = d.tempData.clock_in_time || '';
  let hoursText = '';
  let workHours = 0;
  if (clockInTime) {
    try {
      const inParts = clockInTime.split(':').map(Number);
      const outParts = d.currentTime.split(':').map(Number);
      let secs = (outParts[0]*3600+outParts[1]*60+(outParts[2]||0)) - (inParts[0]*3600+inParts[1]*60+(inParts[2]||0));
      if (secs < 0) secs += 86400;
      const units = Math.floor(secs / 900);
      workHours = units * 0.25;
      hoursText = '\\n⏱️ 工時：' + workHours.toFixed(2) + ' 小時';
    } catch(e) {}
  }
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'IDLE', temp_data: '', work_status: 'OFF_DUTY', current_store: '', clock_in_time: '' },
    updateStore: { store, action: 'remove_staff', staffName: nickname },
    replyMessages: [{ type: 'text', text: t.clockOutDone + '\\n🕐 上班：' + clockInTime + '\\n🕕 下班：' + d.currentTime + hoursText }],
    hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'clockout',
    recordAction: 'clockout',
    recordData: { workDay: d.today, currentTime: d.currentTime, fullTimestamp: d.fullTimestamp, store, nickname, clockInTime, workHours }
  } };
}
if (action === 'close_store') {
  fileName = '[' + empName + '][' + store + '][關攤][' + dateStr + '_' + timeStr + '].jpg';
  // 關攤：先拍照，然後問鈔票金額
  return { json: { replyToken: d.replyToken, userId: d.userId,
    updateEmp: { current_step: 'WAIT_CLOSE_REVENUE', temp_data: JSON.stringify({ action: 'close_store', store, clock_in_time: d.tempData.clock_in_time || '' }) },
    updateStore: null,
    replyMessages: [{ type: 'text', text: t.enterRevenue, quickReply: { items: [{ type: 'action', action: { type: 'postback', label: '❌ 取消', data: 'action=cancel' } }] } }],
    hasPhoto: 'yes', photoDownloadUrl, fileName, photoAction: 'close_store'
  } };
}
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, updateStore: null, replyMessages: [{ type: 'text', text: '⚠️ 未知動作' }], hasPhoto: 'no' } };
`, 200, 400));
conn('意圖路由', '處理WAIT_PHOTO', 8);

// === WAIT_CLOSE_REVENUE: 關攤結算 ===
add(codeN('處理關攤結算', `
const d = $json; const t = d.t;
const revenue = d.msgText.trim();
if (!/^\\d+$/.test(revenue)) {
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, updateStore: null, replyMessages: [{ type: 'text', text: t.invalidNum }], recordAction: 'none' } };
}
const amount = parseInt(revenue, 10);
const store = d.tempData.store || '';
const nickname = d.emp['暱稱'] || '';
const clockInTime = d.tempData.clock_in_time || '';
let workHours = 0;
if (clockInTime) {
  try {
    const inParts = clockInTime.split(':').map(Number);
    const outParts = d.currentTime.split(':').map(Number);
    let secs = (outParts[0]*3600+outParts[1]*60+(outParts[2]||0)) - (inParts[0]*3600+inParts[1]*60+(inParts[2]||0));
    if (secs < 0) secs += 86400;
    workHours = Math.floor(secs / 900) * 0.25;
  } catch(e) {}
}
return { json: { replyToken: d.replyToken, userId: d.userId,
  updateEmp: { current_step: 'IDLE', temp_data: '', work_status: 'OFF_DUTY', current_store: '', clock_in_time: '' },
  updateStore: { store, action: 'close', closer: nickname, time: d.currentTime },
  replyMessages: [{ type: 'text', text: t.closeStoreDone + '\\n📍 ' + store + '\\n💰 鈔票金額: $' + amount.toLocaleString() + '\\n🕐 上班：' + clockInTime + '\\n🕕 下班：' + d.currentTime + '\\n⏱️ 工時：' + workHours.toFixed(2) + ' 小時' }],
  recordAction: 'close_store',
  recordData: { workDay: d.today, currentTime: d.currentTime, fullTimestamp: d.fullTimestamp, store, nickname, clockInTime, workHours, revenue: amount }
} };
`, 200, 500));
conn('意圖路由', '處理關攤結算', 10);

// === WAIT_REVENUE（v17 相容：開攤中上班問業績）===
add(codeN('處理WAIT_REVENUE', `
const d = $json; const t = d.t;
const revenue = d.msgText.trim();
if (!/^\\d+$/.test(revenue)) {
  return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: null, updateStore: null, replyMessages: [{ type: 'text', text: t.invalidNum }], recordAction: 'none' } };
}
// 目前 v18 不問上班業績，這個分支保留給未來擴充
return { json: { replyToken: d.replyToken, userId: d.userId, updateEmp: { current_step: 'IDLE', temp_data: '' }, updateStore: null, replyMessages: [{ type: 'text', text: '✅ 已記錄' }], recordAction: 'none' } };
`, 200, 600));
conn('意圖路由', '處理WAIT_REVENUE', 9);

// ======================================================================
// 5. 照片管線（同 v17）
// ======================================================================
add(ifN('有照片?', '={{ $json.hasPhoto }}', 'equals', 'yes', 600, 400));
conn('處理WAIT_PHOTO', '有照片?');

{
  const n = clone('下載照片', '下載照片', 820, 350);
  n.parameters.url = '={{ $json.photoDownloadUrl }}';
  add(n);
}
conn('有照片?', '下載照片', 0);

{
  const n = clone('上傳至Drive', '上傳至Drive', 1040, 350);
  n.parameters.operation = 'upload';
  n.parameters.name = "={{ $('處理WAIT_PHOTO').item.json.fileName }}";
  n.parameters.folderId = { __rl: true, mode: 'id', value: DRIVE_FOLDER_ID };
  add(n);
}
conn('下載照片', '上傳至Drive');

add(clone('設定檔案權限', '設定檔案權限', 1260, 350));
conn('上傳至Drive', '設定檔案權限');

add(codeN('記錄照片連結', `
const prev = $('處理WAIT_PHOTO').item.json;
const driveFileId = $('上傳至Drive').item.json.id || '';
const driveLink = driveFileId ? 'https://drive.google.com/file/d/' + driveFileId + '/view' : '';
const result = { ...prev, driveFileId, driveLink };
if (prev.photoAction === 'id_card') {
  result.updateEmp = { ...(prev.updateEmp || {}), '證件照片': driveLink };
}
return { json: result };
`, 1480, 350));
conn('設定檔案權限', '記錄照片連結');

// ======================================================================
// 6. 統一更新：員工狀態 + 店鋪狀態 + 紀錄寫入 + LINE 回覆
// ======================================================================

// 匯流點：準備更新狀態
add(codeN('準備更新狀態', `
const d = $input.item.json;
if (!d.updateEmp) { return { json: { ...d, skipUpdate: 'yes' } }; }
return { json: { ...d, skipUpdate: 'no', UserID: d.userId, ...d.updateEmp } };
`, 1700, 200));

// 所有路徑匯入
conn('回覆語言選單', '準備更新狀態');
conn('處理取消', '準備更新狀態');
conn('處理未知', '準備更新狀態');
conn('組裝開攤選單', '準備更新狀態');
conn('組裝上班選單', '準備更新狀態');
conn('處理下班', '準備更新狀態');
conn('詢問關攤或下班', '準備更新狀態');
conn('處理WAIT_LANG', '準備更新狀態');
conn('處理WAIT_STORE', '準備更新狀態');
conn('記錄照片連結', '準備更新狀態');
conn('有照片?', '準備更新狀態', 1);
conn('處理關攤結算', '準備更新狀態');
conn('處理WAIT_REVENUE', '準備更新狀態');

// 需要更新員工?
add(ifN('需要更新?', '={{ $json.skipUpdate }}', 'notEquals', 'yes', 1920, 200));
conn('準備更新狀態', '需要更新?');

// 清理員工資料
add(codeN('清理員工資料', `
const d = $json;
const clean = { UserID: d.UserID };
const fields = ['current_step', 'temp_data', 'Language', '證件照片', '暱稱', '入職日', '時薪', '備註', 'work_status', 'current_store', 'clock_in_time', '角色'];
fields.forEach(f => { if (d[f] !== undefined) clean[f] = d[f]; });
return { json: clean };
`, 2140, 100));
conn('需要更新?', '清理員工資料', 0);

add(sheetsUpdate('更新員工狀態', '員工管理', 2360, 100));
conn('清理員工資料', '更新員工狀態');

// ★ v18: 更新店鋪狀態
add(codeN('準備店鋪更新', `
const d = $('準備更新狀態').item.json;
if (!d.updateStore) { return { json: { skipStoreUpdate: 'yes' } }; }
const us = d.updateStore;
const allStores = d.allStores || [];
const storeRow = allStores.find(s => s['店鋪名稱'] === us.store) || {};
const now = d.fullTimestamp || '';
if (us.action === 'open') {
  return { json: { skipStoreUpdate: 'no', '店鋪名稱': us.store, '狀態': 'OPEN', '開攤時間': us.time, '開攤人': us.opener, '在班人員': us.opener, '在班人數': 1, '今日日期': us.date, '更新時間': now } };
}
if (us.action === 'add_staff') {
  const currentList = (storeRow['在班人員'] || '').split(',').filter(s => s.trim());
  if (!currentList.includes(us.staffName)) currentList.push(us.staffName);
  return { json: { skipStoreUpdate: 'no', '店鋪名稱': us.store, '在班人員': currentList.join(','), '在班人數': currentList.length, '更新時間': now } };
}
if (us.action === 'remove_staff') {
  const currentList = (storeRow['在班人員'] || '').split(',').filter(s => s.trim());
  const newList = currentList.filter(n => n !== us.staffName);
  return { json: { skipStoreUpdate: 'no', '店鋪名稱': us.store, '在班人員': newList.join(','), '在班人數': newList.length, '更新時間': now } };
}
if (us.action === 'close') {
  return { json: { skipStoreUpdate: 'no', '店鋪名稱': us.store, '狀態': 'CLOSED', '在班人員': '', '在班人數': 0, '更新時間': now } };
}
return { json: { skipStoreUpdate: 'yes' } };
`, 2360, 250));
conn('更新員工狀態', '準備店鋪更新');

add(ifN('需要更新店鋪?', '={{ $json.skipStoreUpdate }}', 'notEquals', 'yes', 2580, 250));
conn('準備店鋪更新', '需要更新店鋪?');

// 更新店鋪狀態表（用店鋪名稱 match）
{
  const n = sheetsUpdate('更新店鋪狀態', '店鋪狀態', 2800, 250);
  n.parameters.columns.matchingColumns = ['店鋪名稱'];
  add(n);
}
conn('需要更新店鋪?', '更新店鋪狀態', 0);

// ★ v18: 寫入紀錄（每人工時 + 每日店鋪）
add(codeN('準備寫入紀錄', `
const d = $('準備更新狀態').item.json;
const ra = d.recordAction || 'none';
const rd = d.recordData || {};
const results = [];
if (ra === 'open_store') {
  // 每人工時紀錄
  results.push({ json: { sheetAction: 'attendance', '日期': rd.workDay, '員工姓名': rd.nickname, '店名': rd.store, '上班時間': rd.currentTime, '下班時間': '', '工時': '', '備註': '開攤' } });
  // 每日店鋪紀錄
  results.push({ json: { sheetAction: 'daily_store', '日期': rd.workDay, '店名': rd.store, '開攤時間': rd.currentTime.substring(0,5), '關攤時間': '', '營業時數': '', '人員工時明細': rd.nickname + ' ' + rd.currentTime + '-', '鈔票金額': '', '當日業績': '', '備註': '' } });
}
if (ra === 'clockin') {
  results.push({ json: { sheetAction: 'attendance', '日期': rd.workDay, '員工姓名': rd.nickname, '店名': rd.store, '上班時間': rd.currentTime, '下班時間': '', '工時': '', '備註': '' } });
}
if (ra === 'clockout') {
  results.push({ json: { sheetAction: 'clockout_update', '日期': rd.workDay, '員工姓名': rd.nickname, '下班時間': rd.currentTime, '工時': rd.workHours ? rd.workHours.toFixed(2) : '' } });
}
if (ra === 'close_store') {
  // 關攤人的工時
  results.push({ json: { sheetAction: 'clockout_update', '日期': rd.workDay, '員工姓名': rd.nickname, '下班時間': rd.currentTime, '工時': rd.workHours ? rd.workHours.toFixed(2) : '' } });
  // 更新每日店鋪紀錄
  results.push({ json: { sheetAction: 'daily_store_update', '日期': rd.workDay, '店名': rd.store, '關攤時間': rd.currentTime.substring(0,5), '鈔票金額': String(rd.revenue || 0) } });
}
if (results.length === 0) results.push({ json: { sheetAction: 'none' } });
return results;
`, 2580, 400));
conn('更新員工狀態', '準備寫入紀錄');

add(ifN('需要寫紀錄?', '={{ $json.sheetAction }}', 'notEquals', 'none', 2800, 400));
conn('準備寫入紀錄', '需要寫紀錄?');

add(switchN('紀錄類型路由', 'sheetAction', [
  { key: 'attendance', value: 'attendance' },
  { key: 'clockout_update', value: 'clockout_update' },
  { key: 'daily_store', value: 'daily_store' },
  { key: 'daily_store_update', value: 'daily_store_update' }
], 3020, 400));
conn('需要寫紀錄?', '紀錄類型路由', 0);

// 新增每人工時紀錄
add(sheetsAppend('新增工時記錄', '每人工時紀錄', 3240, 300));
conn('紀錄類型路由', '新增工時記錄', 0);

// 下班更新：查詢 → 更新
add(sheetsLookup('查詢今日工時', '每人工時紀錄', [
  { lookupColumn: '員工姓名', lookupValue: '={{ $json["員工姓名"] }}' },
  { lookupColumn: '日期', lookupValue: '={{ $json["日期"] }}' }
], 3240, 400));
conn('紀錄類型路由', '查詢今日工時', 1);

add(codeN('計算工時更新', `
const queried = $input.item.json;
const clockoutInfo = $('紀錄類型路由').item.json;
return { json: { row_number: queried.row_number, '下班時間': clockoutInfo['下班時間'], '工時': clockoutInfo['工時'] } };
`, 3460, 400));
conn('查詢今日工時', '計算工時更新');

add(sheetsUpdate('更新下班記錄', '每人工時紀錄', 3680, 400));
{ const n = nodes.find(x => x.name === '更新下班記錄'); if (n) n.parameters.columns.matchingColumns = ['row_number']; }
conn('計算工時更新', '更新下班記錄');

// 新增每日店鋪紀錄
add(sheetsAppend('新增店鋪紀錄', '每日店鋪紀錄', 3240, 500));
conn('紀錄類型路由', '新增店鋪紀錄', 2);

// 更新每日店鋪紀錄（關攤）
add(sheetsLookup('查詢今日店鋪', '每日店鋪紀錄', [
  { lookupColumn: '日期', lookupValue: '={{ $json["日期"] }}' },
  { lookupColumn: '店名', lookupValue: '={{ $json["店名"] }}' }
], 3240, 600));
conn('紀錄類型路由', '查詢今日店鋪', 3);

add(codeN('組裝店鋪更新', `
const existing = $input.item.json;
const closeInfo = $('紀錄類型路由').item.json;
// 計算營業時數
let bizHours = '';
try {
  const openTime = existing['開攤時間'] || '';
  const closeTime = closeInfo['關攤時間'] || '';
  if (openTime && closeTime) {
    const [oh, om] = openTime.split(':').map(Number);
    const [ch, cm] = closeTime.split(':').map(Number);
    let mins = (ch * 60 + cm) - (oh * 60 + om);
    if (mins < 0) mins += 1440;
    bizHours = (mins / 60).toFixed(1);
  }
} catch(e) {}
return { json: { row_number: existing.row_number, '關攤時間': closeInfo['關攤時間'], '營業時數': bizHours, '鈔票金額': closeInfo['鈔票金額'] } };
`, 3460, 600));
conn('查詢今日店鋪', '組裝店鋪更新');

add(sheetsUpdate('更新店鋪紀錄', '每日店鋪紀錄', 3680, 600));
{ const n = nodes.find(x => x.name === '更新店鋪紀錄'); if (n) n.parameters.columns.matchingColumns = ['row_number']; }
conn('組裝店鋪更新', '更新店鋪紀錄');

// ======================================================================
// 7. LINE Reply
// ======================================================================
add(codeN('組裝回覆', `
const item = $input.item.json;
const replyToken = item.replyToken;
const messages = item.replyMessages;
if (!replyToken || !messages || messages.length === 0) { return { json: { skip: true } }; }
return { json: { replyToken, messages } };
`, 1700, 500));
conn('準備更新狀態', '組裝回覆');

{
  const n = clone('LINE Reply API', 'LINE Reply', 1920, 500);
  n.parameters.url = 'https://api.line.me/v2/bot/message/reply';
  add(n);
}
conn('組裝回覆', 'LINE Reply');

// ======================================================================
// 輸出
// ======================================================================
const workflow = {
  name: 'StoreOps Bot v18 - 雙狀態機',
  nodes,
  connections,
  pinData: {},
  settings: { executionOrder: 'v1' },
  staticData: null,
  meta: v16.meta
};

const outPath = 'line-clock-in-bot-v18-dual-state.json';
fs.writeFileSync(outPath, JSON.stringify(workflow, null, 2), 'utf8');
console.log('✅ 成功產生 ' + outPath);
console.log('   節點數量: ' + nodes.length);
console.log('   連接數量: ' + Object.keys(connections).length);
console.log('   新增 Sheets: 店鋪狀態, 每日店鋪紀錄, 每人工時紀錄');
console.log('   核心改變: 雙狀態機 + 打卡智慧判斷 + 多人在班');
