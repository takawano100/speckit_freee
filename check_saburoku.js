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

/* ── 出力 ── */
for (const line of results) console.log(line);
const total = results.length;
console.log(failed ? `\nNG: ${failed} / ${total} 件が違う` : `\nOK: ${total} 件すべて一致`);
process.exit(failed ? 1 : 0);
