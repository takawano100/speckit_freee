# Research: 所属長の残業時間管理（月間）

Phase 0。Technical Context の未確定は1点だけ（時刻・日付の扱い）。他は憲法と spec で決まっている。

## R-1 時刻・日付の扱い — JST 固定、日付は文字列で持つ

**Decision**: 日付は `YYYY-MM-DD` の文字列のまま比較・計算する。時刻帯は **JST 固定**とし、`Date` のタイムゾーン変換を使わない。
曜日だけは `Date.UTC(y, m-1, d)` から `getUTCDay()` で求める（端末のタイムゾーンに影響されない）。
「今日」は既定で `data.as_of`（JSON に書いてある「この数字がいつ時点か」）を使い、URL の `?today=YYYY-MM-DD` で上書きできる。
端末の時計は使わない。

**Rationale**:
- freee の返す日付は `2026-09-01` の形、時刻は `+09:00` 付き。計算は日単位（営業日・打刻の有無）で足りる。時刻の演算は無い
- `new Date('2026-09-01')` は UTC 深夜と解釈され、JST の端末で `getDay()` すると前日の曜日になる事故が起きる。文字列比較（`'2026-09-11' < '2026-09-14'`）は辞書順＝日付順なので安全
- 「今日」を端末の時計にすると、検証（T25：今日が 9/15 のとき古い）が日によって結果が変わる。JSON の `as_of` を「今日」にすれば、node でもブラウザでも同じ結果になる。実運用で毎朝 JSON を作り直すなら `as_of` は毎朝更新される

**Alternatives considered**:
- `Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo' })` で端末時計を JST に直す：実運用では正しいが、検証が日付に依存する。今回は要求確認なので採らない
- 日付ライブラリ：憲法 IV（ライブラリを増やさない）で不可

## R-2 「前営業日」の求め方

**Decision**: `calendar`（freee の `day_pattern`）で `normal_day` の日付を昇順に並べ、`today` より前の最後の1つを前営業日とする。
`today` が営業日でも、前営業日は「today より前」で求める（今朝の時点で今日の打刻は無いのが普通）。

**Rationale**: 祝日をこちらで持たない（FR-013）。freee のカレンダーだけで決まる。

**判明した制約**: JSON の `calendar` は対象月の分だけ。**月初（10/1 の朝）は前営業日が 9 月にあり、カレンダーに無い。**
→ 実装は「カレンダーに前営業日が無いときは『前営業日を判定できない』と出す」。
→ **要求の漏れ台帳 #2 候補**（データ視点：カレンダーの範囲が対象月だけでは月初に足りない）。plan.md に記載。tasks の前に REQUEST.md へ戻す。

## R-3 純関数と DOM の分け方（node で同じ関数を呼ぶ）

**Decision**: `saburoku_calc.js` の末尾で
`if (typeof module !== 'undefined') module.exports = Saburoku; else window.Saburoku = Saburoku;`
とする。ブラウザは `<script src="saburoku_calc.js">` で読み、node は `require('./saburoku_calc.js')`。
ES Modules は使わない（`file://` で開いたとき読めない場合があり、ビルドも無いので古典的な形が一番軽い）。

**Alternatives considered**: `<script type="module">`＋`import`：node 側で `.mjs` にするか package.json を触る必要が出る。憲法 IV に照らして採らない。
