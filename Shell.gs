/*************************************************************
 * 줄넘기 기록 관리 v2 — 학교 시트용 껍데기 (Shell.gs) · 점프 라이브판
 * (일반 껍데기 3판 + 점프 라이브: 반 전체 실시간 줄넘기 결과를 한꺼번에 기록)
 * ------------------------------------------------------------
 * 이 파일 하나만 스프레드시트의 Apps Script 에 붙여넣고 웹앱으로 배포하면 됩니다.
 * 화면은 GitHub(musicalpe.github.io/jumprope)에서 열리고, 이 파일은 뒤에서
 * 학생·기록·설정을 시트에 읽고 쓰는 일만 합니다. 화면이 새 판으로 바뀌어도
 * 이 파일은 그대로 두면 됩니다. (껍데기를 바꿔야 할 때는 화면이 알려줍니다)
 *
 * 배포 설정: 다음 사용자로 실행 = 나, 액세스 권한 = 모든 사용자
 *************************************************************/

const SHELL_VERSION = 3;                      // 껍데기 판 (화면이 확인함)  2: 새 학교는 승인 절차 기본 켜짐, 카메라 기록은 기본 바로 승인  3: 급수(Levels 시트)
const APP_URL = 'https://musicalpe.github.io/jumprope/';
const BETA_URL = 'https://musicalpe.github.io/jumprope/beta/';

const SHEET_STUDENTS = 'Students';
const SHEET_RECORDS  = 'Records';
const SHEET_LEVELS   = 'Levels';   // 3판: 급수 인증 (교사가 통과시킨 항목 한 줄씩)
const TOKEN_TTL_SEC   = 60 * 60; // 관리자 토큰 유효시간: 1시간
const DEFAULT_DAILY_GOAL = 100;  // 하루 목표 줄넘기 횟수 (관리자가 바꾸지 않았을 때 기본값)

function getDailyGoal_() {
  const saved = PropertiesService.getScriptProperties().getProperty('DAILY_GOAL');
  const n = Number(saved);
  return (saved && n > 0) ? n : DEFAULT_DAILY_GOAL;
}

// 학생 관리 화면(관리자 메뉴)에서 오늘의 목표를 조회/설정할 때 사용
function getDailyGoal() {
  return getDailyGoal_();
}

function setDailyGoal(token, value) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const n = Number(value);
  if (!n || n <= 0) return { ok: false, message: '1 이상의 숫자를 입력하세요.' };
  PropertiesService.getScriptProperties().setProperty('DAILY_GOAL', String(Math.round(n)));
  return { ok: true, goal: Math.round(n) };
}

/************ 입구 ************/
// 1) ?api=rope_x_who / rope_x_save : 줄넘기 판정기(카메라) 연동
// 2) 그 밖의 주소로 열면 : "프로그램 열기" 안내 화면 (화면은 GitHub 에 있음)
function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.api) return handleCameraApi_(q);
  const self = ScriptApp.getService().getUrl();
  const app = APP_URL + '?s=' + encodeURIComponent(self);
  const beta = BETA_URL + '?s=' + encodeURIComponent(self);
  const html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:Pretendard,"Malgun Gothic",sans-serif;background:#F3F5F8;margin:0;padding:24px;color:#1F2937}' +
    '.c{max-width:560px;margin:30px auto;background:#fff;border-radius:18px;box-shadow:0 4px 18px rgba(0,0,0,.06);overflow:hidden}' +
    '.h{background:linear-gradient(135deg,#F26A3D,#FF8A65);color:#fff;padding:22px 24px}.h h1{margin:0 0 4px;font-size:22px}.h p{margin:0;opacity:.9}' +
    '.b{padding:22px 24px;line-height:1.6}a.btn{display:block;text-align:center;background:#F26A3D;color:#fff;text-decoration:none;font-weight:800;padding:14px;border-radius:12px;font-size:17px;margin:14px 0}' +
    'code{display:block;background:#F3F4F6;padding:10px;border-radius:8px;word-break:break-all;font-size:12px}small{color:#6B7280}</style></head><body>' +
    '<div class="c"><div class="h"><h1>🏆 줄넘기 기록 관리</h1><p>껍데기 설치 완료 · 껍데기 판 ' + SHELL_VERSION + '</p></div><div class="b">' +
    '<p>이 주소는 <b>설치 확인용</b>이에요. 프로그램은 아래 버튼으로 엽니다. 열린 주소를 <b>즐겨찾기</b>해 두고, 학생들에게는 관리자 메뉴의 <b>QR</b>로 알려 주세요.</p>' +
    '<a class="btn" href="' + app + '" target="_top">프로그램 열기 →</a>' +
    '<small>프로그램 주소</small><code>' + app + '</code>' +
    '<p><small>시험판(새 기능 미리 보기): <a href="' + beta + '" target="_top">베타 열기</a></small></p>' +
    '</div></div></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('줄넘기 기록 관리 — 설치 확인')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 화면(GitHub)에서 오는 요청: POST 본문 {"fn":"함수이름","args":[...]} → {"ok":true,"result":...}
const RPC_ALLOW_ = [
  'ping', 'getAppSettingsPublic', 'setAppSettings', 'getExtraSettings', 'setExtraSettings', 'getAllDataAdmin',
  'getDailyGoal', 'setDailyGoal', 'getJumpTypes', 'setJumpTypes', 'resetAllRecords',
  'verifyAdminPassword', 'changeAdminPassword', 'getAllStudents', 'addStudent', 'addStudentsBulk', 'updateStudent',
  'updateStudentOrder', 'deleteStudent', 'getAllStudentsPublic', 'getStudentsSummary', 'getStudentDetailAuthed',
  'addRecord', 'getTodaySummaryPublic', 'getWeekSummaryPublic', 'getStreakSummaryPublic', 'getPendingRecordsPublic',
  'getRecentRecordsPublic', 'getPendingRecords', 'approveRecord', 'rejectRecord', 'getStudentRecordsForAdmin',
  'updateRecordAdmin', 'deleteRecordAdmin', 'getTheme', 'setTheme', 'getCameraSettings', 'getCameraSettingsAdmin',
  'setCameraSettings', 'issueCameraToken', 'generateMotivationMessage', 'getGeminiModelList', 'getMotivationSettings',
  'saveGeminiApiKey', 'regenerateMotivationNow', 'getLevelsPublic', 'saveLevelPasses', 'addLiveRecordsAdmin'
];
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = String(body.fn || '');
    if (RPC_ALLOW_.indexOf(fn) === -1) throw new Error('알 수 없는 요청: ' + fn);
    const g = (typeof globalThis !== 'undefined') ? globalThis : this;
    const f = g[fn];
    if (typeof f !== 'function') throw new Error('이 껍데기에 없는 기능입니다: ' + fn + ' (껍데기를 새 판으로 바꿔 주세요)');
    const args = Array.isArray(body.args) ? body.args : [];
    out = { ok: true, result: f.apply(null, args) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function ping() {
  return { shell: SHELL_VERSION, live: 1, appUrl: APP_URL, self: ScriptApp.getService().getUrl(), title: getSS_().getName() };
}

/************ 점프 라이브 — 선생님 화면(현황판)이 끝난 회차 결과를 한꺼번에 기록 ************
 * rows: [{ id: 학생ID, count: 횟수 }, ...]  · 선생님이 지켜본 카메라 판정이므로 승인된 카메라 기록으로 넣음
 * runId 가 같은 요청이 다시 오면(다시 보내기) 두 번 넣지 않음 */
function addLiveRecordsAdmin(token, typeStr, rows, runId) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다. 관리자 비밀번호로 다시 로그인해 주세요.');
  const type = String(typeStr || '').trim();
  if (!type) throw new Error('줄넘기 종류를 고르세요.');
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('결과 형식이 올바르지 않습니다.');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const cache = CacheService.getScriptCache(), key = runId ? 'LIVE_' + String(runId).slice(0, 40) : '';
    if (key && cache.get(key)) return { saved: 0, already: true };
    const ids = {};
    const st = getStudentsSheet_().getDataRange().getValues();
    for (let i = 1; i < st.length; i++) ids[String(st[i][0]).trim()] = true;
    const now = new Date(), dateStr = formatDate_(now), timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');
    const out = [], skipped = [];
    rows.forEach(function (r) {
      const sid = String((r && r.id) || '').trim(), cnt = Math.round(Number(r && r.count));
      if (!ids[sid]) { skipped.push(sid); return; }
      if (!cnt || cnt < 1) return;
      if (cnt > 5000) { skipped.push(sid); return; }
      out.push([Utilities.getUuid(), now, sid, dateStr, cnt, 'approved', timeStr, type, 'camera']);
    });
    if (out.length) {
      const sh = getRecordsSheet_();
      sh.getRange(sh.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
    }
    if (key) cache.put(key, '1', 6 * 60 * 60);
    return { saved: out.length, skipped: skipped };
  } finally { lock.releaseLock(); }
}

/************ 앱 설정 (승인 절차 등) ************/
function getAppSettingsPublic() {
  const p = PropertiesService.getScriptProperties();
  return {
    approvalOn: approvalOn_(),
    cameraEnabled: p.getProperty('CAMERA_ENABLED') === '1',
    dailyGoal: getDailyGoal_(),
    shell: SHELL_VERSION
  };
}
function setAppSettings(token, obj) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  obj = obj || {};
  const p = PropertiesService.getScriptProperties();
  if (obj.approvalOn !== undefined) p.setProperty('APPROVAL_ON', obj.approvalOn ? '1' : '0');
  return { ok: true, settings: getAppSettingsPublic() };
}
// 앞으로 화면에 새 설정이 생겨도 껍데기를 바꾸지 않도록 마련한 자유 저장칸 (JSON)
function getExtraSettings() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('EXTRA_SETTINGS') || '{}'); } catch (e) { return {}; }
}
function setExtraSettings(token, patch) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const cur = getExtraSettings();
  Object.keys(patch || {}).forEach(function (k) { if (patch[k] === null) delete cur[k]; else cur[k] = patch[k]; });
  const text = JSON.stringify(cur);
  if (text.length > 8000) return { ok: false, message: '저장할 설정이 너무 큽니다.' };
  PropertiesService.getScriptProperties().setProperty('EXTRA_SETTINGS', text);
  return { ok: true, settings: cur };
}
// 화면에서 새 통계·기능을 직접 계산할 수 있게 전체 자료를 내려줌 (관리자만, 비밀번호 제외)
function getAllDataAdmin(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const st = getStudentsSheet_().getDataRange().getValues();
  const students = [];
  for (let i = 1; i < st.length; i++) students.push({ id: String(st[i][0]).trim(), grade: st[i][1], cls: st[i][2], number: st[i][3], name: st[i][4], order: st[i][6] });
  const rc = getRecordsSheet_().getDataRange().getValues();
  const records = [];
  for (let i = 1; i < rc.length; i++) records.push({ recordId: rc[i][0], studentId: String(rc[i][2]).trim(), date: formatDate_(rc[i][3]), count: Number(rc[i][4]) || 0, status: rc[i][5] || 'approved', time: formatTime_(rc[i][6]), type: typeLabel_(rc[i][7]), source: String(rc[i][8] || '') });
  return { students: students, records: records };
}
// 승인 절차: 한 번도 정한 적이 없으면 새 학교(기록 없음)는 켜짐, 이미 쓰던 학교(기록 있음)는 예전처럼 꺼짐으로 정해 둔다
function approvalOn_() {
  const p = PropertiesService.getScriptProperties();
  let v = p.getProperty('APPROVAL_ON');
  if (v !== '1' && v !== '0') {
    const sh = getSS_().getSheetByName(SHEET_RECORDS);
    v = (sh && sh.getLastRow() > 1) ? '0' : '1';
    p.setProperty('APPROVAL_ON', v);
  }
  return v === '1';
}

/************ 유틸 ************/
function hashPw_(pw) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pw), Utilities.Charset.UTF_8);
  return raw.map(b => ((b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))).join('');
}

function getSS_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getStudentsSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(SHEET_STUDENTS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_STUDENTS);
    sh.appendRow(['ID', 'Grade', 'Class', 'Number', 'Name', 'PasswordHash', 'SortOrder']);
  }
  return sh;
}

const RECORDS_HEADER_ = ['RecordID', 'Timestamp', 'StudentID', 'Date', 'Count', 'Status', 'Time', 'Type', 'Source'];
// Source 열: 'camera' = 카메라 판정기(줄넘기 판정기)가 자동으로 넣은 기록, 비어 있으면 직접 입력

/************ 줄넘기 종류 설정 (관리자 메뉴에서 변경) ************/
const DEFAULT_JUMP_TYPES = ['모아뛰기', '엇갈아뛰기', '이중뛰기', '십자뛰기'];
const NO_TYPE_LABEL = '(종류 없음)'; // 종류 기능이 생기기 전에 입력된 기록을 표시할 때 쓰는 이름

function getJumpTypes_() {
  const raw = PropertiesService.getScriptProperties().getProperty('JUMP_TYPES');
  if (!raw) return DEFAULT_JUMP_TYPES.slice();
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr.map(String);
  } catch (e) {}
  return DEFAULT_JUMP_TYPES.slice();
}

// 메인 화면 입력 폼·그래프에서 사용 (누구나 조회 가능)
function getJumpTypes() {
  return getJumpTypes_();
}

// 관리자 메뉴에서 종류 목록을 통째로 저장. 빈 줄·중복은 자동 제거, 최대 20개.
function setJumpTypes(token, list) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const cleaned = [];
  (list || []).forEach(function (t) {
    const name = String(t || '').trim();
    if (!name || cleaned.indexOf(name) !== -1) return;
    if (name === NO_TYPE_LABEL) return;
    cleaned.push(name);
  });
  if (cleaned.length === 0) return { ok: false, message: '종류를 한 개 이상 입력하세요.' };
  if (cleaned.length > 20) return { ok: false, message: '종류는 최대 20개까지 설정할 수 있습니다.' };
  PropertiesService.getScriptProperties().setProperty('JUMP_TYPES', JSON.stringify(cleaned));
  return { ok: true, types: cleaned };
}

// 시트에서 읽은 Type 셀 값을 화면용 이름으로 (비어 있으면 "(종류 없음)")
function typeLabel_(val) {
  const s = (val === null || val === undefined) ? '' : String(val).trim();
  return s || NO_TYPE_LABEL;
}

function getRecordsSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(SHEET_RECORDS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_RECORDS);
    sh.appendRow(RECORDS_HEADER_);
    return sh;
  }
  ensureRecordsSchema_(sh);
  return sh;
}

// Records 시트가 예전 버전(예: RecordID/Status/Time 열이 없던 시절)에 만들어졌더라도
// 시트를 열 때마다 자동으로 최신 구조(RecordID, Timestamp, StudentID, Date, Count, Status, Time)로
// 맞춰줍니다. 그래서 더 이상 migrateRecordsSheet()를 손으로 실행할 필요가 없습니다.
function ensureRecordsSchema_(sh) {
  const width = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (width === 0 || lastRow === 0) return;

  const header = sh.getRange(1, 1, 1, width).getValues()[0];
  if (header.indexOf('RecordID') !== -1) {
    // 이미 정상 구조. 빠진 열(Time, Type 등)만 뒤에 덧붙인다.
    appendMissingRecordColumns_(sh);
    return;
  }

  // 헤더에 RecordID가 없다. 다만 예전 버전 코드가 이미 [.., Status, Time]까지
  // 7칸을 채워 넣은 상태일 수 있으므로(헤더 이름표만 옛날 것), 실제 데이터를 보고 판단한다.
  let looksAlreadyNewSchema = false;
  if (lastRow >= 2 && width >= 6) {
    const sampleStatus = String(sh.getRange(2, 6).getValue()).trim(); // F열(6번째 칸)
    if (['approved', 'pending', 'rejected'].indexOf(sampleStatus) !== -1) {
      looksAlreadyNewSchema = true;
    }
  }

  if (looksAlreadyNewSchema) {
    // 열을 밀지 않고, 헤더 이름표만 최신 구조에 맞게 다시 씌운다.
    const fixedHeader = RECORDS_HEADER_.slice(0, width);
    sh.getRange(1, 1, 1, fixedHeader.length).setValues([fixedHeader]);
    for (let r = 2; r <= lastRow; r++) {
      const cell = sh.getRange(r, 1);
      if (!cell.getValue()) cell.setValue(Utilities.getUuid());
    }
    appendMissingRecordColumns_(sh);
    return;
  }

  // 진짜 예전(4~6열) 구조: RecordID를 맨 앞에 끼워 넣어 나머지 열을 오른쪽으로 민다.
  sh.insertColumnBefore(1);
  sh.getRange(1, 1).setValue('RecordID');
  for (let r = 2; r <= lastRow; r++) {
    const cell = sh.getRange(r, 1);
    if (!cell.getValue()) cell.setValue(Utilities.getUuid());
  }
  let header2 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (header2.indexOf('Status') === -1) {
    const lastCol = sh.getLastColumn();
    sh.getRange(1, lastCol + 1).setValue('Status');
    for (let r = 2; r <= lastRow; r++) {
      sh.getRange(r, lastCol + 1).setValue('approved'); // 기존 기록은 이미 승인된 것으로 간주
    }
  }
  appendMissingRecordColumns_(sh); // Time, Type 등 (기존 기록은 비워둠)
}

// RECORDS_HEADER_에는 있는데 시트 헤더에 없는 열을 맨 뒤에 순서대로 덧붙인다.
function appendMissingRecordColumns_(sh) {
  const width = sh.getLastColumn();
  const header = width > 0 ? sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  let nextCol = width + 1;
  RECORDS_HEADER_.forEach(function (name) {
    if (header.indexOf(name) === -1) {
      sh.getRange(1, nextCol).setValue(name);
      nextCol++;
    }
  });
}

// 편집기에서 직접 선택해 "실행"하면, 승인 대기 목록이 왜 안 보이는지 진단하는 데 도움이 되는
// 정보를 실행 로그(보기 → 실행 기록 또는 로그)에 남겨줍니다. 웹앱 배포와 무관하게 동작하므로,
// 웹 화면에는 안 보이는데 시트에는 데이터가 있을 때 원인을 좁히는 용도입니다.
function debugPendingRecords() {
  const sh = getRecordsSheet_();
  const records = sh.getDataRange().getValues();
  const header = records[0];
  let pendingCount = 0;
  for (let i = 1; i < records.length; i++) {
    if ((records[i][5] || 'approved') === 'pending') pendingCount++;
  }
  Logger.log('헤더: ' + JSON.stringify(header));
  Logger.log('전체 기록 행 수: ' + (records.length - 1));
  Logger.log('상태가 pending으로 집계된 행 수: ' + pendingCount);
  if (records.length > 1) Logger.log('첫 번째 데이터 행 원본: ' + JSON.stringify(records[1]));
  return { totalRows: records.length - 1, pendingCount: pendingCount };
}

// 학생 명단은 그대로 두고, 입력된 기록(승인/대기/거절 전부)만 모두 삭제합니다.
// 관리자 메뉴의 "기록 초기화" 버튼에서 호출됩니다. 되돌릴 수 없으니 주의하세요.
function resetAllRecords(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sh = getRecordsSheet_();
  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.deleteRows(2, lastRow - 1);
  }
  return { ok: true };
}

// ⚠️ 기존에 이미 학생을 등록해두신 경우, Apps Script 편집기에서 이 함수를 딱 한 번 실행하세요.
// (학생 번호/순번 기능을 쓰기 위해 시트 구조를 ID·학년·반·번호·이름·비밀번호·순서 로 맞춰줍니다)
function migrateStudentsSheet() {
  const sh = getStudentsSheet_();
  let header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  if (header.indexOf('Number') === -1) {
    sh.insertColumnBefore(4); // 기존 4번째 열(Name) 앞에 삽입
    sh.getRange(1, 4).setValue('Number');
    header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  }
  if (header.indexOf('SortOrder') === -1) {
    const lastCol = sh.getLastColumn();
    sh.getRange(1, lastCol + 1).setValue('SortOrder');
    const lastRow = sh.getLastRow();
    for (let r = 2; r <= lastRow; r++) {
      sh.getRange(r, lastCol + 1).setValue(r - 1);
    }
  }
  return { ok: true, message: '마이그레이션 완료' };
}

// (참고용) Records 시트는 이제 getRecordsSheet_()가 열 때마다 자동으로 구조를 맞춰주므로
// 이 함수를 직접 실행하지 않으셔도 됩니다. 예전 안내를 보고 오신 분들을 위해 남겨둡니다.
function migrateRecordsSheet() {
  ensureRecordsSchema_(getRecordsSheet_());
  return { ok: true, message: '마이그레이션 완료 (이제는 자동으로 처리됩니다)' };
}

/************ 관리자 인증 ************/
const DEFAULT_ADMIN_PASSWORD = '1234'; // 아직 한 번도 설정한 적 없을 때 쓰는 초기 비밀번호

// (선택) Apps Script 편집기에서 직접 비밀번호를 정하고 싶을 때만 사용하세요.
// 예: setAdminPassword("내가정할비밀번호");
// 관리자 메뉴 화면에서도 로그인 후 바로 바꿀 수 있습니다.
function setAdminPassword(password) {
  PropertiesService.getScriptProperties().setProperty('ADMIN_HASH', hashPw_(password));
}

// (참고) 예전 방식. 이제는 관리자 메뉴의 "오늘의 한마디 (AI)" 카드에서 키를 넣을 수 있습니다.
function setGeminiApiKey(key) {
  PropertiesService.getScriptProperties().setProperty('GEMINI_KEY', key);
}

function getAdminHash_() {
  const saved = PropertiesService.getScriptProperties().getProperty('ADMIN_HASH');
  return saved || hashPw_(DEFAULT_ADMIN_PASSWORD);
}

function verifyAdminPassword(password) {
  if (hashPw_(password) !== getAdminHash_()) {
    return { ok: false, message: '비밀번호가 올바르지 않습니다.' };
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('ADMIN_' + token, '1', TOKEN_TTL_SEC);
  return { ok: true, token: token };
}

// 관리자 메뉴 화면에서 로그인한 상태로 비밀번호를 바꿀 때 사용
function changeAdminPassword(token, newPassword) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const pw = String(newPassword || '').trim();
  if (pw.length < 4) return { ok: false, message: '비밀번호는 4자 이상 입력하세요.' };
  PropertiesService.getScriptProperties().setProperty('ADMIN_HASH', hashPw_(pw));
  return { ok: true };
}

function checkAdminToken_(token) {
  if (!token) return false;
  return !!CacheService.getScriptCache().get('ADMIN_' + token);
}

/************ 학생 관리 (관리자 전용) ************/
function getAllStudents(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const data = getStudentsSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    list.push({
      id: data[i][0], grade: data[i][1], cls: data[i][2],
      number: data[i][3], name: data[i][4],
      order: (data[i][6] === '' || data[i][6] == null) ? 9999 + i : Number(data[i][6])
    });
  }
  list.sort((a, b) => a.order - b.order);
  return list;
}

function addStudent(token, grade, cls, number, name, password) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sh = getStudentsSheet_();
  const data = sh.getDataRange().getValues();
  let maxOrder = 0;
  for (let i = 1; i < data.length; i++) {
    const o = Number(data[i][6]) || 0;
    if (o > maxOrder) maxOrder = o;
  }
  const id = Utilities.getUuid();
  sh.appendRow([id, grade, cls, number, name, hashPw_(password), maxOrder + 1]);
  return { ok: true, id: id };
}

// 여러 학생을 한 번에 등록합니다. rows는 {grade, cls, number, name} 객체 배열입니다.
// 비밀번호는 모두 기본값(1234)으로 설정되며, 필요하면 학생 목록에서 개별적으로 바꿀 수 있습니다.
function addStudentsBulk(token, rows) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sh = getStudentsSheet_();
  const data = sh.getDataRange().getValues();
  let maxOrder = 0;
  for (let i = 1; i < data.length; i++) {
    const o = Number(data[i][6]) || 0;
    if (o > maxOrder) maxOrder = o;
  }
  const defaultHash = hashPw_('1234');
  // 이미 등록된 학생(학년·반·번호·이름 동일)은 건너뛴다
  const existing = {};
  for (let i = 1; i < data.length; i++) {
    existing[[data[i][1], data[i][2], data[i][3], data[i][4]].map(function (v) { return String(v).trim(); }).join('|')] = true;
  }
  const newRows = [];
  let skipped = 0, duplicates = 0;
  (rows || []).forEach(function (r) {
    const name = String((r && r.name) || '').trim();
    if (!name) { skipped++; return; }
    const grade = String((r && r.grade) || '').trim();
    const cls = String((r && r.cls) || '').trim();
    const number = String((r && r.number) || '').trim();
    const key = [grade, cls, number, name].join('|');
    if (existing[key]) { duplicates++; return; }
    existing[key] = true;
    const pw = String((r && r.password) || '').trim();
    maxOrder++;
    newRows.push([Utilities.getUuid(), grade, cls, number, name, pw.length >= 4 ? hashPw_(pw) : defaultHash, maxOrder]);
  });
  if (newRows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
  return { ok: true, added: newRows.length, skipped: skipped, duplicates: duplicates };
}

function updateStudent(token, id, grade, cls, number, name, password) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sh = getStudentsSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sh.getRange(i + 1, 2).setValue(grade);
      sh.getRange(i + 1, 3).setValue(cls);
      sh.getRange(i + 1, 4).setValue(number);
      sh.getRange(i + 1, 5).setValue(name);
      if (password) sh.getRange(i + 1, 6).setValue(hashPw_(password));
      return { ok: true };
    }
  }
  return { ok: false, message: '학생을 찾을 수 없습니다.' };
}

// 드래그로 변경한 순서를 저장 (orderedIds: 위에서부터 아래 순서의 학생 ID 배열)
function updateStudentOrder(token, orderedIds) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sh = getStudentsSheet_();
  const data = sh.getDataRange().getValues();
  const idToRow = {};
  for (let i = 1; i < data.length; i++) idToRow[data[i][0]] = i + 1;
  orderedIds.forEach((id, idx) => {
    const row = idToRow[id];
    if (row) sh.getRange(row, 7).setValue(idx + 1);
  });
  return { ok: true };
}

function deleteStudent(token, id) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sid = String(id).trim();
  const sh = getStudentsSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === sid) { sh.deleteRow(i + 1); break; }
  }
  // 그 학생의 기록도 함께 지움 (StudentID 는 Records 의 3번째 칸)
  deleteRowsWhere_(getRecordsSheet_(), function (r) { return String(r[2]).trim() === sid; });
  // 급수 인증 기록도 함께 지움 (3판)
  const lsh = getSS_().getSheetByName(SHEET_LEVELS);
  if (lsh) deleteRowsWhere_(lsh, function (r) { return String(r[0]).trim() === sid; });
  return { ok: true };
}

// 조건에 맞는 줄을 아래에서부터, 이어진 줄끼리 묶어서 지운다 (한 줄씩 지우는 것보다 빠름). 첫 줄(머리줄)은 건드리지 않음
function deleteRowsWhere_(sh, pred) {
  const v = sh.getDataRange().getValues();
  let removed = 0, end = -1;
  for (let i = v.length - 1; i >= 0; i--) {
    const hit = i >= 1 && pred(v[i]);
    if (hit && end < 0) end = i;
    if (!hit && end >= 0) { sh.deleteRows(i + 2, end - i); removed += end - i; end = -1; }
  }
  return removed;
}

/************ 입력 폼용 학생 목록 (누구나 조회 가능, 비밀번호 제외) ************/
function getAllStudentsPublic() {
  const data = getStudentsSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    list.push({
      id: data[i][0], grade: data[i][1], cls: data[i][2],
      number: data[i][3], name: data[i][4],
      order: (data[i][6] === '' || data[i][6] == null) ? 9999 + i : Number(data[i][6])
    });
  }
  list.sort((a, b) => a.order - b.order);
  return list;
}

/************ 메인 화면 데이터 ************/
// 반환: { types: [그래프에 표시할 종류 이름들], list: [{id, name, grade, cls, total, byType: {종류: 합계}}] }
// types에는 관리자가 설정한 종류가 순서대로 들어가고, 종류 없이 입력된 옛 기록이 있으면 "(종류 없음)"이 마지막에 붙습니다.
function getStudentsSummary() {
  const students = getStudentsSheet_().getDataRange().getValues();
  const records = getRecordsSheet_().getDataRange().getValues();
  const totals = {};
  const byType = {};
  const seenTypes = {};
  for (let i = 1; i < records.length; i++) {
    const status = records[i][5] || 'approved'; // 구버전 데이터 호환
    if (status !== 'approved') continue;
    const sid = String(records[i][2]).trim();
    const cnt = Number(records[i][4]) || 0;
    const type = typeLabel_(records[i][7]);
    totals[sid] = (totals[sid] || 0) + cnt;
    if (!byType[sid]) byType[sid] = {};
    byType[sid][type] = (byType[sid][type] || 0) + cnt;
    seenTypes[type] = true;
  }
  const result = [];
  for (let i = 1; i < students.length; i++) {
    const id = String(students[i][0]).trim();
    if (totals[id]) {
      result.push({ id, name: students[i][4], grade: students[i][1], cls: students[i][2], total: totals[id], byType: byType[id] || {} });
    }
  }
  result.sort((a, b) => b.total - a.total);

  const types = getJumpTypes_();
  Object.keys(seenTypes).forEach(function (t) {
    if (types.indexOf(t) === -1) types.push(t); // 설정 목록에서 빠진(이름이 바뀐) 종류나 "(종류 없음)"도 그래프에는 보이게
  });
  return { types: types, list: result };
}

// 화면(StudentPage)에서 "학생 정보를 찾을 수 없습니다"가 뜰 때 원인을 바로 확인하기 위한 진단 함수
function debugStudentLookup(id) {
  const students = getStudentsSheet_().getDataRange().getValues();
  const target = String(id).trim();
  const ids = [];
  for (let i = 1; i < students.length; i++) {
    ids.push(String(students[i][0]).trim());
  }
  let actualFnResult = null;
  let actualFnError = null;
  try {
    actualFnResult = getStudentInfo(id);
  } catch (err) {
    actualFnError = String(err);
  }
  return {
    requestedId: target,
    totalStudents: ids.length,
    idsSample: ids.slice(0, 5),
    manualMatchFound: ids.indexOf(target) !== -1,
    getStudentInfoResult: actualFnResult,
    getStudentInfoError: actualFnError
  };
}

/************ 개별 학생 데이터 ************/
function getStudentInfo(id) {
  const students = getStudentsSheet_().getDataRange().getValues();
  const target = String(id).trim();
  for (let i = 1; i < students.length; i++) {
    if (String(students[i][0]).trim() === target) {
      return { id, grade: students[i][1], cls: students[i][2], number: students[i][3], name: students[i][4] };
    }
  }
  return null;
}

function formatDate_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(val);
}

// "10:42" 같은 시간 문자열을 시트에 저장하면 구글 시트가 자동으로 시간(Date) 타입으로
// 바꿔버리는 경우가 있어서, 다시 읽을 때 이상한 날짜값이 되지 않도록 방어합니다.
function formatTime_(val) {
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  }
  return val ? String(val) : '';
}

function getStudentDetailAuthed(id, password) {
  try {
    const students = getStudentsSheet_().getDataRange().getValues();
    const target = String(id).trim();
    let row = null;
    for (let i = 1; i < students.length; i++) {
      if (String(students[i][0]).trim() === target) { row = students[i]; break; }
    }
    if (!row) {
      const ids = [];
      for (let i = 1; i < students.length; i++) ids.push(String(students[i][0]).trim());
      return {
        notFound: true,
        requestedId: target,
        totalStudents: ids.length,
        idsSample: ids.slice(0, 5)
      };
    }
    if (hashPw_(password) !== row[5]) {
      return { wrongPassword: true, message: '비밀번호가 올바르지 않습니다.' };
    }
    const info = { id: target, grade: row[1], cls: row[2], number: row[3], name: row[4] };
    const records = getRecordsSheet_().getDataRange().getValues();
    const list = [];
    for (let i = 1; i < records.length; i++) {
      if (String(records[i][2]).trim() === target) {
        list.push({
          date: formatDate_(records[i][3]),
          count: Number(records[i][4]) || 0,
          status: records[i][5] || 'approved',
          time: formatTime_(records[i][6]),
          type: typeLabel_(records[i][7]),
          source: String(records[i][8] || '')
        });
      }
    }
    list.sort((a, b) => new Date(a.date) - new Date(b.date));
    let cum = 0;
    const daily = list.map(r => {
      if (r.status === 'approved') cum += r.count;
      return { date: r.date, count: r.count, status: r.status, time: r.time, type: r.type, source: r.source, cumulative: cum };
    });
    return { info: info, daily: daily, types: getJumpTypes_() };
  } catch (err) {
    return { serverError: true, message: String(err), stack: (err && err.stack) ? String(err.stack) : '' };
  }
}

/************ 기록 입력 (비밀번호 없이, 승인 대기로 저장) ************/
function addRecord(id, dateStr, count, timeStr, typeStr) {
  const students = getStudentsSheet_().getDataRange().getValues();
  const target = String(id).trim();
  let found = false;
  for (let i = 1; i < students.length; i++) {
    if (String(students[i][0]).trim() === target) { found = true; break; }
  }
  if (!found) return { ok: false, message: '학생 정보를 찾을 수 없습니다.' };

  const cnt = Number(count);
  if (!cnt || cnt < 0) return { ok: false, message: '올바른 횟수를 입력하세요.' };
  const time = timeStr ? String(timeStr).trim() : '';
  const type = typeStr ? String(typeStr).trim() : '';
  if (!type) return { ok: false, message: '줄넘기 종류를 선택하세요.' };

  // v2: 입력할 때마다 한 줄씩 쌓는다 (그날 여러 번 뛰면 모두 더해짐). 승인 절차를 켰으면 한 건씩 승인 대기.
  if (cnt > 5000) return { ok: false, message: '한 번에 5000회까지만 입력할 수 있어요.' };
  getRecordsSheet_().appendRow([Utilities.getUuid(), new Date(), target, String(dateStr).trim(), Math.round(cnt), approvalOn_() ? 'pending' : 'approved', time, type, '']);
  return { ok: true, approval: approvalOn_(), message: approvalOn_() ? '입력되었습니다! 선생님 승인 후 그래프에 반영됩니다.' : '저장되었습니다! 그래프에 바로 반영됩니다.' };
}

// 누구나 볼 수 있는 승인 대기 목록 (학생이 자기 입력이 잘 접수됐는지 확인하는 용도)
// 오늘 승인된 기록만 학생별로 합산 (많이 뛴 순). 목표 달성 인원 계산에도 사용.
function getTodaySummaryPublic() {
  const students = getStudentsSheet_().getDataRange().getValues();
  const today = formatDate_(new Date());
  const totals = {};
  const records = getRecordsSheet_().getDataRange().getValues();
  for (let i = 1; i < records.length; i++) {
    const status = records[i][5] || 'approved';
    if (status !== 'approved') continue;
    if (formatDate_(records[i][3]) !== today) continue;
    const sid = String(records[i][2]).trim();
    totals[sid] = (totals[sid] || 0) + (Number(records[i][4]) || 0);
  }
  const list = [];
  for (let i = 1; i < students.length; i++) {
    const sid = String(students[i][0]).trim();
    if (totals[sid]) list.push({ id: sid, name: students[i][4], total: totals[sid] });
  }
  list.sort((a, b) => b.total - a.total);
  return { goal: getDailyGoal_(), list: list };
}

// 이번 주(월요일부터 오늘까지) 승인된 기록만 학생별로 합산
function getWeekSummaryPublic() {
  const students = getStudentsSheet_().getDataRange().getValues();
  const now = new Date();
  const day = now.getDay(); // 0=일 ... 6=토
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
  const mondayStr = formatDate_(monday);
  const totals = {};
  const records = getRecordsSheet_().getDataRange().getValues();
  for (let i = 1; i < records.length; i++) {
    const status = records[i][5] || 'approved';
    if (status !== 'approved') continue;
    const d = formatDate_(records[i][3]);
    if (d < mondayStr) continue;
    const sid = String(records[i][2]).trim();
    totals[sid] = (totals[sid] || 0) + (Number(records[i][4]) || 0);
  }
  const list = [];
  for (let i = 1; i < students.length; i++) {
    const sid = String(students[i][0]).trim();
    if (totals[sid]) list.push({ id: sid, name: students[i][4], total: totals[sid] });
  }
  list.sort((a, b) => b.total - a.total);
  return { weekStart: mondayStr, list: list };
}

/* ---- 연속 기록(스트릭) 계산 ----
 * 오늘(또는 오늘 기록이 아직 없다면 어제)부터 거꾸로 하루씩 확인하며
 * 승인된 기록이 끊기지 않고 이어진 날 수를 센다. */
function shiftDateStr_(dateStr, deltaDays) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  return formatDate_(d);
}

function computeStreak_(dateMap, todayStr) {
  let anchor = todayStr;
  if (!dateMap[anchor]) {
    anchor = shiftDateStr_(todayStr, -1);
    if (!dateMap[anchor]) return 0;
  }
  let streak = 0;
  let cursor = anchor;
  while (dateMap[cursor]) {
    streak++;
    cursor = shiftDateStr_(cursor, -1);
  }
  return streak;
}

function getStreakSummaryPublic() {
  const students = getStudentsSheet_().getDataRange().getValues();
  const records = getRecordsSheet_().getDataRange().getValues();
  const byStudent = {};
  for (let i = 1; i < records.length; i++) {
    const status = records[i][5] || 'approved';
    if (status !== 'approved') continue;
    const sid = String(records[i][2]).trim();
    const d = formatDate_(records[i][3]);
    if (!byStudent[sid]) byStudent[sid] = {};
    byStudent[sid][d] = true;
  }
  const todayStr = formatDate_(new Date());
  const list = [];
  for (let i = 1; i < students.length; i++) {
    const sid = String(students[i][0]).trim();
    const dateMap = byStudent[sid];
    if (!dateMap) continue;
    const streak = computeStreak_(dateMap, todayStr);
    if (streak > 0) list.push({ id: sid, name: students[i][4], streak: streak });
  }
  list.sort((a, b) => b.streak - a.streak);
  return { list: list };
}

function getPendingRecordsPublic() {
  const students = getStudentsSheet_().getDataRange().getValues();
  const studentMap = {};
  for (let i = 1; i < students.length; i++) {
    studentMap[String(students[i][0]).trim()] = {
      grade: students[i][1], cls: students[i][2], number: students[i][3], name: students[i][4]
    };
  }
  const records = getRecordsSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < records.length; i++) {
    const status = records[i][5] || 'approved';
    if (status !== 'pending') continue;
    const sid = String(records[i][2]).trim();
    if (!studentMap[sid]) continue;   // 삭제된 학생의 기록
    const s = studentMap[sid];
    list.push({
      grade: s.grade || '', cls: s.cls || '', number: s.number || '', name: s.name || '(알 수 없음)',
      date: formatDate_(records[i][3]), count: Number(records[i][4]) || 0, time: formatTime_(records[i][6]),
      type: typeLabel_(records[i][7]),
      source: String(records[i][8] || '')
    });
  }
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  return list;
}

// 승인 절차를 끈 경우 메인 화면 "오늘 입력된 기록" 목록
function getRecentRecordsPublic() {
  const students = getStudentsSheet_().getDataRange().getValues();
  const map = {};
  for (let i = 1; i < students.length; i++) map[String(students[i][0]).trim()] = { grade: students[i][1], cls: students[i][2], number: students[i][3], name: students[i][4] };
  const today = formatDate_(new Date());
  const records = getRecordsSheet_().getDataRange().getValues();
  const list = [];
  for (let i = records.length - 1; i >= 1 && list.length < 30; i--) {
    if (formatDate_(records[i][3]) !== today) continue;
    if ((records[i][5] || 'approved') === 'rejected') continue;
    const s = map[String(records[i][2]).trim()] || {};
    list.push({ grade: s.grade || '', cls: s.cls || '', number: s.number || '', name: s.name || '(알 수 없음)', date: formatDate_(records[i][3]), count: Number(records[i][4]) || 0, time: formatTime_(records[i][6]), type: typeLabel_(records[i][7]), source: String(records[i][8] || ''), status: records[i][5] || 'approved' });
  }
  return list;
}

/************ 기록 승인 (관리자 전용) ************/
function getPendingRecords(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const students = getStudentsSheet_().getDataRange().getValues();
  const studentMap = {};
  for (let i = 1; i < students.length; i++) {
    studentMap[String(students[i][0]).trim()] = {
      grade: students[i][1], cls: students[i][2], number: students[i][3], name: students[i][4]
    };
  }
  const records = getRecordsSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < records.length; i++) {
    const status = records[i][5] || 'approved';
    if (status !== 'pending') continue;
    const sid = String(records[i][2]).trim();
    if (!studentMap[sid]) continue;   // 삭제된 학생의 기록
    const s = studentMap[sid];
    list.push({
      recordId: records[i][0],
      grade: s.grade || '', cls: s.cls || '', number: s.number || '', name: s.name || '(알 수 없음)',
      date: formatDate_(records[i][3]),
      count: Number(records[i][4]) || 0,
      time: formatTime_(records[i][6]),
      type: typeLabel_(records[i][7]),
      source: String(records[i][8] || '')
    });
  }
  list.sort((a, b) => new Date(a.date) - new Date(b.date));
  return list;
}

function setRecordStatus_(token, recordId, status) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sh = getRecordsSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(recordId).trim()) {
      sh.getRange(i + 1, 6).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, message: '기록을 찾을 수 없습니다.' };
}

function approveRecord(token, recordId) { return setRecordStatus_(token, recordId, 'approved'); }
function rejectRecord(token, recordId) { return setRecordStatus_(token, recordId, 'rejected'); }

/************ 학생별 기록 관리 (관리자 전용 - 학생 관리 페이지에서 사용) ************/
function getStudentRecordsForAdmin(token, studentId) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const students = getStudentsSheet_().getDataRange().getValues();
  const target = String(studentId).trim();
  let info = null;
  for (let i = 1; i < students.length; i++) {
    if (String(students[i][0]).trim() === target) {
      info = { grade: students[i][1], cls: students[i][2], number: students[i][3], name: students[i][4] };
      break;
    }
  }
  if (!info) return { notFound: true };
  const records = getRecordsSheet_().getDataRange().getValues();
  const list = [];
  for (let i = 1; i < records.length; i++) {
    if (String(records[i][2]).trim() === target) {
      list.push({
        recordId: records[i][0],
        date: formatDate_(records[i][3]),
        count: Number(records[i][4]) || 0,
        status: records[i][5] || 'approved',
        time: formatTime_(records[i][6]),
        type: typeLabel_(records[i][7]),
        source: String(records[i][8] || '')
      });
    }
  }
  list.sort((a, b) => new Date(b.date) - new Date(a.date));
  return { info: info, records: list, types: getJumpTypes_() };
}

function updateRecordAdmin(token, recordId, count, status, typeStr) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const cnt = Number(count);
  if (isNaN(cnt) || cnt < 0) return { ok: false, message: '올바른 횟수를 입력하세요.' };
  const sh = getRecordsSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(recordId).trim()) {
      sh.getRange(i + 1, 5).setValue(cnt);
      sh.getRange(i + 1, 6).setValue(status);
      if (typeStr !== undefined && typeStr !== null) {
        const t = String(typeStr).trim();
        sh.getRange(i + 1, 8).setValue(t === NO_TYPE_LABEL ? '' : t);
      }
      return { ok: true };
    }
  }
  return { ok: false, message: '기록을 찾을 수 없습니다.' };
}

function deleteRecordAdmin(token, recordId) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const sh = getRecordsSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(recordId).trim()) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, message: '기록을 찾을 수 없습니다.' };
}

/************ 진단용 (문제 확인 시 편집기에서 직접 실행) ************/
function debugFindStudent(id) {
  const students = getStudentsSheet_().getDataRange().getValues();
  const target = String(id).trim();
  Logger.log('찾는 ID: [' + target + ']');
  for (let i = 1; i < students.length; i++) {
    Logger.log('행 ' + (i + 1) + ' ID: [' + String(students[i][0]).trim() + '] 일치여부: ' + (String(students[i][0]).trim() === target));
  }
}


/************ 테마(색상) 설정 — 관리자 메뉴에서 변경, 모든 화면에 적용 ************/
const THEME_PRESETS_ = [
  { id: 'coral',  name: '코랄',   accent: '#F26A3D' },
  { id: 'mint',   name: '민트',   accent: '#12968A' },
  { id: 'sky',    name: '하늘',   accent: '#0EA5E9' },
  { id: 'violet', name: '보라',   accent: '#6C5CE7' },
  { id: 'green',  name: '초록',   accent: '#16A34A' },
  { id: 'amber',  name: '주황',   accent: '#E08A0B' },
  { id: 'rose',   name: '로즈',   accent: '#E11D48' },
  { id: 'slate',  name: '슬레이트', accent: '#4B5B6E' }
];
const THEME_BGS_ = [
  { id: 'light', name: '연회색 (기본)', color: '#F3F5F8' },
  { id: 'warm',  name: '따뜻한 베이지', color: '#F7F4EE' },
  { id: 'white', name: '흰색',          color: '#FFFFFF' },
  { id: 'tint',  name: '강조색 연하게', color: 'accent' }
];

function hexToRgb_(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex_(rgb) {
  return '#' + rgb.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase();
}
// 두 색을 t(0~1) 비율로 섞는다 (t=1이면 b)
function mixHex_(a, b, t) {
  const x = hexToRgb_(a), y = hexToRgb_(b);
  return rgbToHex_([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
}

function getTheme_() {
  const p = PropertiesService.getScriptProperties();
  let accent = String(p.getProperty('THEME_ACCENT') || '').trim();
  if (!hexToRgb_(accent)) accent = THEME_PRESETS_[0].accent;
  let bg = String(p.getProperty('THEME_BG') || 'light');
  if (!THEME_BGS_.some(function (b) { return b.id === bg; })) bg = 'light';
  return { accent: accent.toUpperCase(), bg: bg };
}

function getTheme() {
  const t = getTheme_();
  return { accent: t.accent, bg: t.bg, presets: THEME_PRESETS_, bgs: THEME_BGS_ };
}

function setTheme(token, obj) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  obj = obj || {};
  let accent = String(obj.accent || '').trim();
  if (!hexToRgb_(accent)) return { ok: false, message: '색상 값이 올바르지 않습니다. (#RRGGBB)' };
  let bg = String(obj.bg || 'light');
  if (!THEME_BGS_.some(function (b) { return b.id === bg; })) bg = 'light';
  const p = PropertiesService.getScriptProperties();
  p.setProperty('THEME_ACCENT', accent.toUpperCase());
  p.setProperty('THEME_BG', bg);
  return { ok: true, theme: getTheme_() };
}

/************ 줄넘기 판정기(카메라 모션 인식) 연동 ************/
// 판정기 페이지(GitHub Pages, 별도 파일)는 이 웹앱 주소를 ?app= 으로 받아
//   GET {app}?api=rope_x_who&t=토큰            → 학생 정보·오늘 합계·목표
//   GET {app}?api=rope_x_save&t=토큰&count=N&…  → 기록 저장
// 두 가지를 호출합니다. 토큰은 학생이 메인 화면에서 "카메라로 뛰기"를 누를 때 발급되며 3시간 뒤 사라집니다.
const DEFAULT_CAMERA_URL = 'https://musicalpe.github.io/jump-rope-checker/';
const CAMERA_TOKEN_TTL_SEC = 3 * 60 * 60;

function getCameraSettings_() {
  const p = PropertiesService.getScriptProperties();
  const sens = Number(p.getProperty('CAMERA_SENS'));
  return {
    enabled: p.getProperty('CAMERA_ENABLED') === '1',
    autoApprove: p.getProperty('CAMERA_AUTO_APPROVE') !== '0',   // 카메라가 센 기록은 기본으로 바로 승인 (껍데기 2판부터)
    sens: (sens >= 6 && sens <= 16) ? Math.round(sens) : 10,
    url: (p.getProperty('CAMERA_URL') || DEFAULT_CAMERA_URL).trim() || DEFAULT_CAMERA_URL
  };
}

// 메인 화면용 (누구나): "카메라로 뛰기" 버튼을 보일지만 알려준다
function getCameraSettings() {
  const c = getCameraSettings_();
  return { enabled: c.enabled };
}

function getCameraSettingsAdmin(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  return getCameraSettings_();
}

function setCameraSettings(token, obj) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  obj = obj || {};
  const p = PropertiesService.getScriptProperties();
  let sens = Math.round(Number(obj.sens));
  if (!(sens >= 6 && sens <= 16)) sens = 10;
  let url = String(obj.url || '').trim();
  if (!url) url = DEFAULT_CAMERA_URL;
  if (!/^https:\/\//.test(url)) return { ok: false, message: '판정기 주소는 https:// 로 시작해야 합니다.' };
  p.setProperty('CAMERA_ENABLED', obj.enabled ? '1' : '0');
  p.setProperty('CAMERA_AUTO_APPROVE', obj.autoApprove ? '1' : '0');
  p.setProperty('CAMERA_SENS', String(sens));
  p.setProperty('CAMERA_URL', url);
  return { ok: true, settings: getCameraSettings_() };
}

// 메인 화면 "카메라로 뛰기": 학생·종류를 확인하고 판정기로 갈 주소를 만들어 준다
function issueCameraToken(studentId, typeStr) {
  const c = getCameraSettings_();
  if (!c.enabled) return { ok: false, message: '선생님이 카메라 판정기 사용을 켜지 않았습니다.' };
  const info = getStudentInfo(String(studentId || '').trim());
  if (!info) return { ok: false, message: '학생 정보를 찾을 수 없습니다.' };
  const type = String(typeStr || '').trim();
  if (!type) return { ok: false, message: '줄넘기 종류를 선택하세요.' };
  const token = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  CacheService.getScriptCache().put('CAM_' + token, JSON.stringify({ sid: info.id, type: type }), CAMERA_TOKEN_TTL_SEC);
  const url = c.url + (c.url.indexOf('?') === -1 ? '?' : '&') +
    'app=' + encodeURIComponent(ScriptApp.getService().getUrl()) +
    '&t=' + token + '&kind=' + encodeURIComponent(type) + '&sens=' + c.sens + '&target=rope';
  return { ok: true, url: url };
}

function cameraJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 오늘 그 학생의 합계 (거절된 기록 제외, 승인 대기 포함 — 판정기 화면의 "오늘 N회" 표시용)
function todayTotalForStudent_(sid) {
  const today = formatDate_(new Date());
  const records = getRecordsSheet_().getDataRange().getValues();
  let sum = 0;
  for (let i = 1; i < records.length; i++) {
    if (String(records[i][2]).trim() !== sid) continue;
    if (formatDate_(records[i][3]) !== today) continue;
    if ((records[i][5] || 'approved') === 'rejected') continue;
    sum += Number(records[i][4]) || 0;
  }
  return sum;
}

function handleCameraApi_(q) {
  try {
    const api = String(q.api || '');
    const c = getCameraSettings_();
    if (!c.enabled) return cameraJson_({ ok: false, error: '카메라 판정기 사용이 꺼져 있습니다.' });
    const raw = q.t ? CacheService.getScriptCache().get('CAM_' + String(q.t)) : null;
    if (!raw) return cameraJson_({ ok: false, error: '연결이 만료됐어요. 앱에서 "카메라로 뛰기"를 다시 눌러 주세요.' });
    const link = JSON.parse(raw);
    const info = getStudentInfo(link.sid);
    if (!info) return cameraJson_({ ok: false, error: '학생 정보를 찾을 수 없습니다.' });
    const goal = getDailyGoal_();

    if (api === 'rope_x_who') {
      return cameraJson_({ ok: true, data: {
        학년: info.grade, 반: info.cls, 번호: info.number, 이름: info.name,
        오늘: todayTotalForStudent_(info.id), 하루목표: goal, 최소: 1
      } });
    }
    if (api === 'rope_x_save') {
      const cnt = Math.round(Number(q.count));
      if (!cnt || cnt < 1) return cameraJson_({ ok: false, error: '1회 이상일 때만 기록할 수 있어요.' });
      if (cnt > 5000) return cameraJson_({ ok: false, error: '횟수가 너무 큽니다.' });
      const type = link.type;
      const now = new Date();
      const dateStr = formatDate_(now);
      const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');
      const status = (c.autoApprove || !approvalOn_()) ? 'approved' : 'pending';
      const sh = getRecordsSheet_();
      const data = sh.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][2]).trim() === info.id && formatDate_(data[i][3]) === dateStr &&
            String(data[i][7] || '').trim() === type) { rowIndex = i + 1; break; }
      }
      if (rowIndex > 0) {
        // 같은 날·같은 종류 기록이 있으면 거기에 더한다 ("한 번 더 뛰기"로 여러 번 뛰어도 합산). 거절된 기록이면 새 값으로.
        const prevStatus = String(data[rowIndex - 1][5] || 'approved');
        const prev = prevStatus === 'rejected' ? 0 : (Number(data[rowIndex - 1][4]) || 0);
        sh.getRange(rowIndex, 5).setValue(prev + cnt);
        sh.getRange(rowIndex, 6).setValue(status);
        sh.getRange(rowIndex, 7).setValue(timeStr);
        sh.getRange(rowIndex, 8).setValue(type);
        sh.getRange(rowIndex, 9).setValue('camera');
      } else {
        sh.appendRow([Utilities.getUuid(), now, info.id, dateStr, cnt, status, timeStr, type, 'camera']);
      }
      const todayTotal = todayTotalForStudent_(info.id);
      return cameraJson_({ ok: true, data: { 횟수: cnt, 오늘: todayTotal, 하루목표: goal, 달성: todayTotal >= goal, 승인대기: status === 'pending' } });
    }
    return cameraJson_({ ok: false, error: '알 수 없는 요청: ' + api });
  } catch (err) {
    return cameraJson_({ ok: false, error: String((err && err.message) || err) });
  }
}

/************ 오늘의 한마디 (AI 응원 문구) ************
 * - 관리자 메뉴에서 Gemini API 키를 저장하면, 하루에 한 번 AI가 새 문구를 만들어 저장해둡니다.
 * - 키가 없거나 호출이 실패하면 기본 문구 중 하나를 보여줍니다. (화면이 멈추지 않도록 절대 오류를 던지지 않음)
 * - 한 번 만든 문구는 그날 하루 동안 재사용하므로 API 호출은 하루 1~2번 수준입니다.
 */
const GEMINI_MODELS_ = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']; // 앞에서부터 시도, 안 되면 다음 모델
const MOTIVATION_FALLBACK_ = [
  '오늘의 작은 도약이 내일의 큰 성장을 만듭니다!',
  '꾸준함이 실력입니다. 오늘도 줄넘기 한 번 더!',
  '땀 흘린 만큼 튼튼해지는 우리 친구들, 최고예요!',
  '어제보다 한 번 더! 나와의 약속을 지켜봐요.',
  '건강한 습관은 매일의 반복에서 시작됩니다.'
];

function fallbackMotivation_() {
  const day = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'D')) || 0;
  return MOTIVATION_FALLBACK_[day % MOTIVATION_FALLBACK_.length]; // 같은 날엔 같은 문구
}

// 메인 화면이 호출. 반환: { text, source: 'ai' | 'default', date }
function generateMotivationMessage() {
  try {
    const props = PropertiesService.getScriptProperties();
    const today = formatDate_(new Date());
    if (props.getProperty('MOTIVATION_DATE') === today && props.getProperty('MOTIVATION_TEXT')) {
      return { text: props.getProperty('MOTIVATION_TEXT'), source: props.getProperty('MOTIVATION_SOURCE') || 'ai', date: today };
    }
    const apiKey = props.getProperty('GEMINI_KEY');
    if (apiKey) {
      const result = callGeminiForMotivation_(apiKey);
      if (result.ok) {
        props.setProperties({ MOTIVATION_DATE: today, MOTIVATION_TEXT: result.text, MOTIVATION_SOURCE: 'ai', MOTIVATION_MODEL: result.model, MOTIVATION_ERROR: '' });
        return { text: result.text, source: 'ai', date: today };
      }
      // 실패: 하루 동안 계속 재시도하지 않도록 기본 문구를 오늘 값으로 저장하고, 오류는 관리자 화면에 표시
      props.setProperties({ MOTIVATION_DATE: today, MOTIVATION_TEXT: fallbackMotivation_(), MOTIVATION_SOURCE: 'default', MOTIVATION_ERROR: result.error || '알 수 없는 오류' });
    }
    return { text: fallbackMotivation_(), source: 'default', date: today };
  } catch (err) {
    return { text: fallbackMotivation_(), source: 'default', date: '' };
  }
}

function buildMotivationPrompt_() {
  const summary = getStudentsSummary();
  const list = summary.list || [];
  const totalJumps = list.reduce(function (s, r) { return s + r.total; }, 0);
  const top = list[0];
  const today = getTodaySummaryPublic();
  const streak = getStreakSummaryPublic();
  const types = getJumpTypes_();
  return '너는 초등학생들의 줄넘기 운동을 지도하는 체육 선생님이다.\n' +
    '우리 반 상황: 참여 학생 ' + list.length + '명, 누적 줄넘기 ' + totalJumps + '회.\n' +
    (top ? ('누적 1위: ' + top.name + ' 학생 (' + top.total + '회).\n') : '') +
    (today.list.length ? ('오늘 가장 많이 뛴 학생: ' + today.list[0].name + ' (' + today.list[0].total + '회).\n') : '오늘은 아직 승인된 기록이 없다.\n') +
    (streak.list.length ? ('연속 기록 1위: ' + streak.list[0].name + ' (' + streak.list[0].streak + '일 연속).\n') : '') +
    '연습하는 줄넘기 종류: ' + types.join(', ') + '.\n' +
    '오늘 날짜: ' + formatDate_(new Date()) + '.\n' +
    '이 상황에 맞게 학생들을 격려하고 꾸준한 운동 습관을 응원하는 한국어 문장을 1~2문장, 60자 이내로 써줘. ' +
    '특정 학생 이름은 넣어도 되고 안 넣어도 된다. 매일 다른 느낌이 나도록 표현을 바꿔줘. ' +
    '따옴표, 이모지, 설명 없이 문장만 출력해.';
}

// 이 키로 쓸 수 있는 모델을 구글에 직접 물어본다 (generateContent 지원 모델만, 텍스트용 우선).
// 반환: { ok, models: ['gemini-2.5-flash', ...], error }
function listGeminiModels_(apiKey) {
  try {
    const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=' + encodeURIComponent(apiKey),
      { method: 'get', muteHttpExceptions: true });
    const code = res.getResponseCode();
    const body = res.getContentText();
    if (code !== 200) {
      let msg = ''; try { msg = JSON.parse(body).error.message || ''; } catch (e) { msg = body.slice(0, 200); }
      return { ok: false, models: [], error: 'ListModels HTTP ' + code + ' ' + msg };
    }
    const json = JSON.parse(body);
    const names = (json.models || [])
      .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1; })
      .map(function (m) { return String(m.name || '').replace(/^models\//, ''); })
      .filter(function (n) { return /gemini/i.test(n) && !/(image|tts|audio|live|embedding|vision|thinking-exp)/i.test(n); });
    // flash 계열을 앞으로, 그 안에서는 버전 높은 순(문자열 역순으로 대략)
    names.sort(function (a, b) {
      const fa = /flash/.test(a) ? 0 : 1, fb = /flash/.test(b) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return b.localeCompare(a);
    });
    return { ok: true, models: names, error: '' };
  } catch (err) {
    return { ok: false, models: [], error: 'ListModels ' + String(err) };
  }
}

function callGeminiForMotivation_(apiKey) {
  const prompt = buildMotivationPrompt_();
  const errors = [];

  function tryModel(model) {
    try {
      const res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey),
        { method: 'post', contentType: 'application/json',
          payload: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 1.0, maxOutputTokens: 300 } }),
          muteHttpExceptions: true }
      );
      const code = res.getResponseCode();
      const body = res.getContentText();
      if (code === 200) {
        const json = JSON.parse(body);
        const cand = json.candidates && json.candidates[0];
        const text = cand && cand.content && cand.content.parts && cand.content.parts.map(function (p) { return p.text || ''; }).join('');
        if (text && text.trim()) return { ok: true, text: String(text).trim().replace(/^["'“”]+|["'“”]+$/g, ''), model: model };
        errors.push(model + ': 응답에 문구가 없음' + (cand && cand.finishReason ? ' (' + cand.finishReason + ')' : ''));
        return { ok: false, stop: false };
      }
      let msg = ''; try { msg = JSON.parse(body).error.message || ''; } catch (e) { msg = body.slice(0, 200); }
      errors.push(model + ': HTTP ' + code + ' ' + msg);
      return { ok: false, stop: (code === 400 || code === 401 || code === 403) }; // 키 자체 문제면 더 시도해도 소용없음
    } catch (err) {
      errors.push(model + ': ' + String(err));
      return { ok: false, stop: false };
    }
  }

  // 1) 먼저 알려진 모델 이름으로 시도
  for (let i = 0; i < GEMINI_MODELS_.length; i++) {
    const r = tryModel(GEMINI_MODELS_[i]);
    if (r.ok) return r;
    if (r.stop) return { ok: false, error: errors.join('  |  ') };
  }
  // 2) 전부 실패(대개 모델 이름이 바뀐 경우) → 이 키로 쓸 수 있는 모델 목록을 받아와서 다시 시도
  const listed = listGeminiModels_(apiKey);
  if (!listed.ok) errors.push(listed.error);
  const candidates = listed.models.filter(function (m) { return GEMINI_MODELS_.indexOf(m) === -1; }).slice(0, 4);
  for (let i = 0; i < candidates.length; i++) {
    const r = tryModel(candidates[i]);
    if (r.ok) return r;
    if (r.stop) break;
  }
  if (listed.ok && listed.models.length === 0) errors.push('이 키로 사용할 수 있는 텍스트 생성 모델이 없습니다. (Gemini API가 켜진 키인지 확인)');
  return { ok: false, error: errors.join('  |  ') };
}

// 관리자 메뉴 "사용 가능한 모델 확인" 버튼
function getGeminiModelList(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!apiKey) return { ok: false, message: 'API 키가 저장되어 있지 않습니다.' };
  const r = listGeminiModels_(apiKey);
  return r.ok ? { ok: true, models: r.models } : { ok: false, message: r.error };
}

/* ---- 관리자 메뉴용 ---- */
function getMotivationSettings(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const p = PropertiesService.getScriptProperties();
  const key = p.getProperty('GEMINI_KEY') || '';
  return {
    hasKey: !!key,
    keyMasked: key ? (key.slice(0, 6) + '…' + key.slice(-4)) : '',
    lastDate: p.getProperty('MOTIVATION_DATE') || '',
    lastText: p.getProperty('MOTIVATION_TEXT') || '',
    lastSource: p.getProperty('MOTIVATION_SOURCE') || '',
    lastModel: p.getProperty('MOTIVATION_MODEL') || '',
    lastError: p.getProperty('MOTIVATION_ERROR') || ''
  };
}

// 키 저장(빈 문자열이면 키 삭제 → 기본 문구로 돌아감). 저장 직후 바로 한 번 생성해 보고 결과를 돌려준다.
function saveGeminiApiKey(token, key) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const p = PropertiesService.getScriptProperties();
  const k = String(key || '').trim();
  if (!k) {
    p.deleteProperty('GEMINI_KEY');
    p.deleteProperty('MOTIVATION_DATE'); p.deleteProperty('MOTIVATION_TEXT'); p.deleteProperty('MOTIVATION_SOURCE'); p.deleteProperty('MOTIVATION_ERROR');
    return { ok: true, removed: true };
  }
  if (k.length < 20) return { ok: false, message: 'API 키가 너무 짧습니다. 복사가 제대로 됐는지 확인하세요.' };
  p.setProperty('GEMINI_KEY', k);
  return regenerateMotivationNow(token);
}

// "지금 새 문구 만들기" 버튼: 오늘 문구를 새로 만들어 저장
function regenerateMotivationNow(token) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const p = PropertiesService.getScriptProperties();
  const apiKey = p.getProperty('GEMINI_KEY');
  if (!apiKey) return { ok: false, message: 'API 키가 저장되어 있지 않습니다.' };
  const today = formatDate_(new Date());
  const result = callGeminiForMotivation_(apiKey);
  if (result.ok) {
    p.setProperties({ MOTIVATION_DATE: today, MOTIVATION_TEXT: result.text, MOTIVATION_SOURCE: 'ai', MOTIVATION_MODEL: result.model, MOTIVATION_ERROR: '' });
    return { ok: true, text: result.text, model: result.model };
  }
  p.setProperty('MOTIVATION_ERROR', result.error || '알 수 없는 오류');
  return { ok: false, message: result.error || '알 수 없는 오류' };
}

/************ 급수 인증 (3판) ************
 * Levels 시트: StudentID, Level(급수 번호 0~), Item(항목 번호 0~), PassedAt(yyyy-MM-dd), By
 * 급수표(이름·항목·횟수)는 화면이 EXTRA_SETTINGS.levels 에 두고, 여기는 "누가 몇 급 몇 번 항목을 언제 통과했는지"만 저장
 * 지금 급수는 화면이 계산 (앞 급수부터 모든 항목을 통과한 만큼) */
const LEVELS_HEADER_ = ['StudentID', 'Level', 'Item', 'PassedAt', 'By'];
function getLevelsSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(SHEET_LEVELS);
  if (!sh) { sh = ss.insertSheet(SHEET_LEVELS); sh.appendRow(LEVELS_HEADER_); }
  return sh;
}
// 누구나: { 학생ID: [[급수, 항목, 날짜], ...] } (학생 화면·메인 화면의 급수 띠에 씀)
function getLevelsPublic() {
  const v = getLevelsSheet_().getDataRange().getValues();
  const out = {};
  for (let i = 1; i < v.length; i++) {
    const id = String(v[i][0]).trim();
    if (!id) continue;
    const d = v[i][3] instanceof Date ? formatDate_(v[i][3]) : String(v[i][3] || '').slice(0, 10);
    (out[id] = out[id] || []).push([Number(v[i][1]), Number(v[i][2]), d]);
  }
  return out;
}
// 관리자: changes = [{ id, level, item, pass: true/false, date? }] → 통과는 한 줄 추가(이미 있으면 그대로), 취소는 그 줄 삭제
function saveLevelPasses(token, changes) {
  if (!checkAdminToken_(token)) throw new Error('권한이 없습니다.');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getLevelsSheet_();
    const v = sh.getDataRange().getValues();
    const rowOf = {};
    for (let i = 1; i < v.length; i++) rowOf[String(v[i][0]).trim() + '|' + Number(v[i][1]) + '|' + Number(v[i][2])] = i + 1;
    const today = formatDate_(new Date());
    const add = [], del = [];
    (Array.isArray(changes) ? changes : []).slice(0, 2000).forEach(function (c) {
      const id = String(c && c.id || '').trim();
      const lv = Math.round(Number(c.level)), it = Math.round(Number(c.item));
      if (!id || !(lv >= 0 && lv < 30) || !(it >= 0 && it < 30)) return;
      const k = id + '|' + lv + '|' + it;
      if (c.pass) {
        if (rowOf[k]) return;
        const d = /^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')) ? String(c.date) : today;
        add.push([id, lv, it, d, 'teacher']); rowOf[k] = -1;
      } else if (rowOf[k] > 0) del.push(rowOf[k]);
    });
    del.sort(function (a, b) { return b - a; }).forEach(function (r) { sh.deleteRow(r); });
    if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, LEVELS_HEADER_.length).setValues(add);
  } finally {
    lock.releaseLock();
  }
  return getLevelsPublic();
}
