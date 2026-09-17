/*
 * saburoku_calc.js — 所属長の残業時間管理（月間）の純関数。
 * ブラウザ（saburoku.html）と node（check_saburoku.js）で同じものを呼ぶ。DOM に触らない。
 * 日付はすべて 'YYYY-MM-DD' の文字列。時刻帯は JST 固定（specs/001-saburoku-monitor/research.md R-1）。
 * 正本は freee。ここで持つのは計算だけで、保存する状態は無い（憲法 I）。
 * 要件番号は specs/001-saburoku-monitor/spec.md の FR、テスト番号は TESTCASES.md の T。
 */
(function (root) {
  'use strict';

  const Saburoku = {};
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const RANK = { warn: 0, caution: 1, safe: 2, none: 3 };

  /* ── 表示の補助（K007）── */
  Saburoku.hm = mins => {
    const sign = mins < 0 ? '-' : '';
    const m = Math.abs(Math.round(mins));
    return `${sign}${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  };
  Saburoku.md = date => `${+date.slice(5, 7)}/${+date.slice(8, 10)}`;
  /* 曜日は Date.UTC で求める。端末のタイムゾーンに影響されない（R-1） */
  Saburoku.weekday = date => {
    const [y, m, d] = date.split('-').map(Number);
    return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  };

  /* ── 営業日（K005）── freee のカレンダー（day_pattern）だけで決める（FR-013） */
  Saburoku.businessDays = calendar =>
    Object.keys(calendar).filter(d => calendar[d] === 'normal_day').sort();

  /* today より前の最後の営業日。カレンダーに無ければ null（月初。R-2・T31） */
  Saburoku.prevBusinessDay = (calendar, today) => {
    const before = Saburoku.businessDays(calendar).filter(d => d < today);
    return before.length ? before[before.length - 1] : null;
  };

  /* ── 閾値（K006）── 正本は freee の36協定設定。写しの履歴から
   *   対象月の初日に有効だった1件を選ぶ（FR-006a・006b）。次に来る更新も返す。 */
  Saburoku.pickThreshold = (history, fallback, monthFirstDay) => {
    if (!Array.isArray(history) || history.length === 0) {
      return { warning_mins: fallback.warning_mins, caution_mins: fallback.caution_mins, effective_from: null, next: null, source: 'thresholds（後方互換）' };
    }
    const sorted = [...history].sort((a, b) => a.effective_from.localeCompare(b.effective_from));
    const inForce = sorted.filter(h => h.effective_from <= monthFirstDay);
    const cur = inForce.length ? inForce[inForce.length - 1] : sorted[0];
    const next = sorted.find(h => h.effective_from > cur.effective_from) || null;
    return { warning_mins: cur.warning_mins, caution_mins: cur.caution_mins, effective_from: cur.effective_from, source: cur.source || '', next };
  };

  /* ── 1人ぶんの月次断面（K010・K015・K032）── data-model.md の PersonMonth
   *   punched   : 営業日（today より前）で打刻のある日           FR-003
   *   absent    : 欠勤の日（is_absence）                        FR-009
   *   halfClock : 出勤打刻だけの日（time_clock_only）           FR-008
   *   missing   : 打刻が無く欠勤でもない日（退勤なしを含む）      FR-007
   *   holidayWork: 営業日以外で打刻のある日                     FR-004
   *   ot        : punched + holidayWork の時間外                FR-003・004
   *   pace      : punched だけの時間外 ÷ punched の日数（休日分はペースに入れない）FR-005
   *   hitDate   : pace を残り営業日に足して warning に届く最初の日 FR-005
   *   status    : none / warn / caution / safe                  FR-006
   */
  Saburoku.personMonth = (member, calendar, today, threshold) => {
    const rec = Object.fromEntries((member.records || []).map(r => [r.date, r]));
    const has = d => !!(rec[d] && rec[d].clock_in);
    const bd = Saburoku.businessDays(calendar);
    /* 在籍期間（FR-017・2周目）：入社日以降・退職日以前の所定日だけを数える。入社前・退職後は打刻なしにも数えない */
    const allDays = Object.keys(calendar).sort();
    const enrollFrom = member.entry_date || (allDays[0] || null);
    const enrollTo = member.retire_date || (allDays[allDays.length - 1] || null);
    const inEnroll = d => (!enrollFrom || d >= enrollFrom) && (!enrollTo || d <= enrollTo);
    const retired = !!(member.retire_date && member.retire_date < today);
    const notYetJoined = !!(member.entry_date && member.entry_date > today);
    const past = bd.filter(d => d < today && inEnroll(d));
    const future = bd.filter(d => d >= today && inEnroll(d));

    const punched = past.filter(has);
    const absent = past.filter(d => rec[d] && rec[d].is_absence);
    const halfClock = past.filter(d => rec[d] && rec[d].time_clock_only && !has(d));
    const missing = past.filter(d => !has(d) && !(rec[d] && rec[d].is_absence));
    const holidayWork = Object.keys(rec).filter(d => d < today && calendar[d] && calendar[d] !== 'normal_day' && has(d)).sort();

    const otWeekday = punched.reduce((a, d) => a + (rec[d].overtime_mins || 0), 0);
    const otHoliday = holidayWork.reduce((a, d) => a + (rec[d].overtime_mins || 0), 0);
    const ot = otWeekday + otHoliday;
    const pace = punched.length ? otWeekday / punched.length : 0;
    const remain = threshold.warning_mins - ot;

    let hitDate = null;
    if (!retired && pace > 0 && ot < threshold.warning_mins) {
      let acc = ot;
      for (const d of future) { acc += pace; if (acc >= threshold.warning_mins) { hitDate = d; break; } }
    }
    const forecast = retired ? null : ot + pace * future.length;   // 退職済みなら見込みは出さない（FR-017）

    const status = (punched.length === 0 && holidayWork.length === 0) ? 'none'
      : ot >= threshold.warning_mins ? 'warn'
      : ot >= threshold.caution_mins ? 'caution'
      : 'safe';

    return {
      m: member, rec, past, future,
      punched, absent, halfClock, missing, holidayWork,
      ot, otWeekday, otHoliday, pace, remain, hitDate, forecast, status,
      paceIsRough: punched.length > 0 && punched.length < 3,
      enrollFrom, enrollTo, retired, notYetJoined,
      rank: RANK[status]
    };
  };

  /* ── 並び（K011）── 状態の重い順、同じなら残りが少ない順（FR-001） */
  Saburoku.sortMembers = rows =>
    [...rows].sort((a, b) => a.rank - b.rank || a.remain - b.remain || String(a.m.num).localeCompare(String(b.m.num)));

  /* ── 鮮度（K022）── data-model.md の Freshness（FR-012・R-2）
   *   prevBusinessDay : カレンダーの営業日で today より前の最後の日（無ければ null）
   *   lastPunchDate   : データ中の打刻の最終日（全メンバーの records で clock_in がある最大の日付）
   *   stale           : 前営業日の打刻を含んでいない（lastPunchDate < prevBusinessDay）
   *   undeterminable  : カレンダーに前営業日が無い（月初。カレンダーが前月を含まない。T31）
   */
  Saburoku.freshness = (data, today) => {
    const prev = Saburoku.prevBusinessDay(data.calendar || {}, today);
    const members = [
      ...((data.departments || []).flatMap(d => d.members || [])),
      ...(((data.company || {}).members) || [])
    ];
    let last = null;
    for (const m of members) for (const r of (m.records || [])) {
      if (r.clock_in && r.date < today && (!last || r.date > last)) last = r.date;
    }
    if (!prev) return { prevBusinessDay: null, lastPunchDate: last, stale: false, undeterminable: true };
    return { prevBusinessDay: prev, lastPunchDate: last, stale: !last || last < prev, undeterminable: false };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Saburoku;
  else root.Saburoku = Saburoku;
})(typeof window !== 'undefined' ? window : globalThis);
