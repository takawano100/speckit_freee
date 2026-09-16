/*
 * check_saburoku.js — TESTCASES.md の T01〜T31 を data/*.json で確かめる（node・依存なし）。
 * 使い方: node check_saburoku.js
 * 純関数（saburoku_calc.js）だけを呼ぶ。DOM は使わない。憲法 III。
 */
const fs = require('node:fs');
const path = require('node:path');
const S = require('./saburoku_calc.js');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
const D = read('saburoku_2026-09.json');

const results = [];
let failed = 0;
function ok(tcase, name, cond, detail) {
  if (cond) results.push(`OK ${tcase} ${name}`);
  else { failed += 1; results.push(`NG ${tcase} ${name}${detail ? ' — ' + detail : ''}`); }
}
function eq(tcase, name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  ok(tcase, name, a === e, `expected ${e} got ${a}`);
}
function tryRun(label, fn) {
  try { fn(); } catch (err) { failed += 1; results.push(`NG ${label} — 例外: ${err.message}`); }
}

/* 対象月の初日と、既定の「今日」 */
const monthFirst = D.month + '-01';
const today = D.as_of;   // 2026-09-13（freee から読んだ日。日曜）

/* ── K004: Foundational（営業日・前営業日・閾値・表示） 〔T10・T30〕 ── */
tryRun('K004', () => {
  const bd = S.businessDays(D.calendar);
  eq('T10', '9月の営業日は19日（9/21〜23 は休み）', bd.length, 19);
  ok('T10', '9/21 は営業日でない', !bd.includes('2026-09-21'));
  eq('T25', '今日 9/16 の前営業日は 9/15', S.prevBusinessDay(D.calendar, '2026-09-16'), '2026-09-15');
  eq('T25', '日曜 9/13 の前営業日は 9/11', S.prevBusinessDay(D.calendar, '2026-09-13'), '2026-09-11');
  eq('T31', '月初 9/1 はカレンダーに前営業日が無い → null', S.prevBusinessDay(D.calendar, '2026-09-01'), null);

  const th9 = S.pickThreshold(D.threshold_history, D.thresholds, '2026-09-01');
  eq('T30', '2026-09 の閾値は 45:00/36:00（2025-04-01〜）', [th9.warning_mins, th9.caution_mins, th9.effective_from], [2700, 2160, '2025-04-01']);
  eq('T30', '次の更新は 2026-09-15〜 40:00', th9.next && [th9.next.effective_from, th9.next.warning_mins], ['2026-09-15', 2400]);
  const th10 = S.pickThreshold(D.threshold_history, D.thresholds, '2026-10-01');
  eq('T30', '2026-10 の閾値は 40:00/32:00', [th10.warning_mins, th10.caution_mins], [2400, 1920]);
  const thFb = S.pickThreshold(undefined, D.thresholds, '2026-09-01');
  eq('T30', 'history が無ければ thresholds にフォールバック', thFb.warning_mins, 2700);

  eq('T03', 'hm(1845) = 30:45', S.hm(1845), '30:45');
  eq('T03', 'hm(0) = 0:00', S.hm(0), '0:00');
  eq('T03', 'md(2026-09-18) = 9/18', S.md('2026-09-18'), '9/18');
  eq('T07', 'weekday(2026-09-28) = 月', S.weekday('2026-09-28'), '月');
  eq('T03', 'weekday(2026-09-18) = 金', S.weekday('2026-09-18'), '金');
});

/* ── 部署から人を取る補助 ── */
const dept = name => D.departments.find(d => d.group.name === name);
const member = (deptName, personName) => dept(deptName).members.find(m => m.name === personName);
const pm = (deptName, personName, t = today) =>
  S.personMonth(member(deptName, personName), D.calendar, t, S.pickThreshold(D.threshold_history, D.thresholds, monthFirst));

/* ── K008: US1 personMonth 〔T02・T03・T04・T07〕 ── */
tryRun('K008', () => {
  const mikami = pm('労務部', '三上 詩織');
  eq('T07', '三上 時間外 24:45', mikami.ot, 1485);
  eq('T07', '三上 残り 20:15', mikami.remain, 1215);
  eq('T07', '三上 1日あたり 2:45', mikami.pace, 165);
  eq('T07', '三上 超える予定日 9/28', mikami.hitDate, '2026-09-28');
  eq('T07', '三上 月末見込み 52:15', Math.round(mikami.forecast), 3135);
  eq('T07', '三上 状態 安全', mikami.status, 'safe');

  const okada = pm('経理部', '岡田 千尋');
  eq('T03', '岡田 時間外 30:45', okada.ot, 1845);
  eq('T03', '岡田 状態 安全（注意線 36h 未満）', okada.status, 'safe');
  eq('T03', '岡田 残り 14:15', okada.remain, 855);
  eq('T03', '岡田 超える予定日 9/18', okada.hitDate, '2026-09-18');
  eq('T03', '岡田 月末見込み 64:55', Math.round(okada.forecast), 3895);

  const shiraishi = pm('財務部', '白石 千夏');
  eq('T04', '白石 時間外 45:45', shiraishi.ot, 2745);
  eq('T04', '白石 状態 警告', shiraishi.status, 'warn');
  eq('T04', '白石 超過 0:45', shiraishi.remain, -45);
  eq('T04', '白石 予定日は無し（到達済み）', shiraishi.hitDate, null);

  const horiuchi = pm('人事部', '堀内 舞');
  eq('T10', '堀内 時間外 23:00（休日5h込み）', horiuchi.ot, 1380);
  eq('T10', '堀内 1日あたり 2:00（休日分はペースに入れない）', horiuchi.pace, 120);
  eq('T02', '堀内 予定日なし（月内は超えない見込み）', horiuchi.hitDate, null);
  eq('T02', '堀内 状態 安全', horiuchi.status, 'safe');

  const kase = pm('人事部', '加瀬 亜美');
  eq('T02', '加瀬 時間外 7:30', kase.ot, 450);
  eq('T02', '加瀬 状態 安全', kase.status, 'safe');
});

/* ── K009: US1 sortMembers・主務の部下だけ 〔T13・T14・T16〕 ── */
tryRun('K009', () => {
  const th = S.pickThreshold(D.threshold_history, D.thresholds, monthFirst);
  const rows = S.sortMembers(dept('人事部').members.map(m => S.personMonth(m, D.calendar, today, th)));
  eq('T02', '人事部の並び：堀内(残22:00) → 長瀬(36:30) → 加瀬(37:30) → 相川(打刻なし)', rows.map(r => r.m.name), ['堀内 舞', '長瀬 佑樹', '加瀬 亜美', '相川 悠介']);
  ok('T13', '相川は自分（部長）', rows.find(r => r.m.name === '相川 悠介').m.self === true);
  ok('T16', '課長の長瀬は部長の一覧に出る', rows.some(r => r.m.name === '長瀬 佑樹'));
  ok('T14', '兼務の相川は労務部の一覧に居ない', !dept('労務部').members.some(m => m.name === '相川 悠介'));
  const aikawa = D.company.members.find(m => m.name === '相川 悠介');
  eq('T14', '相川の主務は人事部（D103）', aikawa.dept, 'D103');
  ok('T14', '相川に兼務がある', aikawa.sub.length > 0);
});

/* ── K014: US2 打刻の状態 〔T01・T05・T06・T10・T11・T12〕 ── */
tryRun('K014', () => {
  const nagase = pm('人事部', '長瀬 佑樹');
  eq('T06', '長瀬 打刻した日 5', nagase.punched.length, 5);
  eq('T06', '長瀬 打刻なし 4（退勤なしを含む）', nagase.missing.length, 4);
  eq('T12', '長瀬 退勤なし 1（9/11）', nagase.halfClock, ['2026-09-11']);
  eq('T06', '長瀬 時間外 8:30', nagase.ot, 510);
  eq('T06', '長瀬 1日あたり 1:42（5日で割る）', nagase.pace, 102);
  const kase = pm('人事部', '加瀬 亜美');
  eq('T11', '加瀬 欠勤 1（9/8）', kase.absent, ['2026-09-08']);
  eq('T11', '加瀬 打刻なし 0（欠勤は数えない）', kase.missing.length, 0);
  eq('T11', '加瀬 打刻した日 8', kase.punched.length, 8);
  const hirai = pm('総務部', '平井 直樹');
  eq('T01', '平井 時間外 0:00', hirai.ot, 0);
  eq('T01', '平井 状態 安全（打刻はある）', hirai.status, 'safe');
  eq('T01', '平井 打刻なし 0', hirai.missing.length, 0);
  const aikawa = pm('人事部', '相川 悠介');
  eq('T05', '相川 状態 打刻なし', aikawa.status, 'none');
  eq('T05', '相川 打刻なし 9/9', aikawa.missing.length, 9);
  const horiuchi = pm('人事部', '堀内 舞');
  eq('T10', '堀内 休日出勤 9/12', horiuchi.holidayWork, ['2026-09-12']);
  eq('T10', '堀内 休日の時間外 5:00', horiuchi.otHoliday, 300);
});

/* ── K018: US3 全社 〔T15・T17〕 ── */
tryRun('K018', () => {
  const th = S.pickThreshold(D.threshold_history, D.thresholds, monthFirst);
  const rows = S.sortMembers(D.company.members.map(m => S.personMonth(m, D.calendar, today, th)));
  const c = k => rows.filter(r => r.status === k).length;
  eq('T17', '全社 34人', rows.length, 34);
  eq('T17', '警告 1', c('warn'), 1);
  eq('T17', '注意 0（注意線 36h）', c('caution'), 0);
  eq('T17', '安全 6', c('safe'), 6);
  eq('T17', '打刻なし 27', c('none'), 27);
  eq('T17', '先頭は白石', rows[0].m.name, '白石 千夏');
  eq('T17', '役員 2 人は対象外', D.company.excluded.length, 2);
  eq('T15', '部長のいない部署 0', D.company.departments.filter(d => !d.head_num).length, 0);
  ok('T13', '部長は is_head', D.company.members.filter(m => m.is_head).length === 15);
});

/* ── K021: US4 鮮度 〔T25・T31〕 ── */
tryRun('K021', () => {
  const stale = read('saburoku_2026-09_t25_stale.json');
  const f1 = S.freshness(stale, stale.as_of);          // 今日 9/15（火）
  eq('T25', '古い朝：前営業日 9/14', f1.prevBusinessDay, '2026-09-14');
  eq('T25', '古い朝：打刻の最終日 9/12（堀内の土曜出勤）', f1.lastPunchDate, '2026-09-12');
  eq('T25', '古い朝：stale=true', f1.stale, true);
  const f2 = S.freshness(D, '2026-09-14');            // 今日 9/14（月）。前営業日 9/11 を含む
  eq('T25', '9/14 の朝：stale=false', f2.stale, false);
  const f3 = S.freshness(D, '2026-09-13');            // 日曜
  eq('T25', '日曜：前営業日 9/11・stale=false', [f3.prevBusinessDay, f3.stale], ['2026-09-11', false]);
  const f4 = S.freshness(D, '2026-09-01');            // 月初。カレンダーに前営業日が無い
  eq('T31', '月初：undeterminable=true', f4.undeterminable, true);
  let broken = null;
  try { JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'saburoku_2026-09_t25_broken.json'), 'utf8')); } catch (e) { broken = e; }
  ok('T25', '壊れた JSON は parse で例外（画面は「取得できず」を出す）', broken !== null);
});

/* ── 出力 ── */
for (const line of results) console.log(line);
const total = results.length;
console.log(failed ? `\nNG: ${failed} / ${total} 件が違う` : `\nOK: ${total} 件すべて一致`);
process.exit(failed ? 1 : 0);
