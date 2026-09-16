# Data Model: 所属長の残業時間管理（月間）

憲法 I：正本は freee。**ここに挙げるものは freee から読んだ結果か、こちらの設定値か、計算した断面のどれか**。業務データの写しを保存する器は作らない。
実装上の形は `contracts/data-json.md`。

## 読むもの（freee から読んだ結果。JSON に入っている）

| エンティティ | 主キー | 属性 | 出どころ |
|---|---|---|---|
| 従業員 | `employee_id` | `num`（社員番号）・`name`・`position`（役職。空＝一般）・`etype`（regular / fixed-term / part-time）・`dept`（主務の部署コード）・`dept_name`・`hq`（本部）・`head_num`（その部署の部長の社員番号）・`sub[]`（兼務先）・`is_head`・`data_state`（取得／未登録） | `employees` + `employee_group_memberships` |
| 部署 | `code` | `name`・`group_id`・`hq`・`head_num`（部長が居なければ null） | `groups` + 役職 |
| 勤務カレンダー | `date` | `normal_day` / `prescribed_holiday` / `legal_holiday` | `work_records[].day_pattern` |
| 日次勤怠 | `employee_id` × `date` | `clock_in`・`clock_out`（無ければ null）・`break_mins`・`overtime_mins`・`latenight_mins`・`is_absence`・`day_pattern`（休日出勤のとき）・`time_clock_only`（出勤打刻だけの日） | `work_record_summaries?work_records=true` + `time_clocks` |
| 除外 | `num` | `name`・`reason`（役員・勤怠管理なし） | 雇用形態 |

**検証ルール（読む側）**
- `clock_in` があるのに `clock_out` が無い日次勤怠は存在しない（freee が 400 で拒む。T12）。出勤打刻だけは `time_clock_only` で表す
- `is_absence: true` の日は `clock_in` null・`overtime_mins` 0
- 休日出勤の記録は `day_pattern` が `normal_day` 以外で、`overtime_mins` に全時間が入る（T10 で実測）

## こちらで持つもの（設定値）

| エンティティ | 属性 | 規則 |
|---|---|---|
| 閾値の履歴 `threshold_history[]` | `effective_from`（YYYY-MM-DD）・`warning_mins`・`caution_mins`・`source` | 正本は freee の36協定設定。写し。**判定に使う1件＝`effective_from` ≤ 対象月の初日 の中で最新**（FR-006b）。無ければ `thresholds`（後方互換）にフォールバック |

## 計算する断面（保存しない。開くたびに計算）

### 従業員の月次断面 `PersonMonth`

| 属性 | 定義 | 要件 |
|---|---|---|
| `punched[]` | 対象月の営業日（`normal_day`、`today` より前）で `clock_in` がある日 | FR-003 |
| `absent[]` | 同・`is_absence` の日 | FR-009 |
| `halfClock[]` | 同・`time_clock_only` の日 | FR-008 |
| `missing[]` | 同・`clock_in` 無し かつ 欠勤でない日（退勤なしを含む） | FR-007 |
| `holidayWork[]` | 営業日以外で `clock_in` がある日（`today` より前） | FR-004 |
| `ot` | `punched` と `holidayWork` の `overtime_mins` の合計 | FR-003・004 |
| `pace` | `punched` だけの `overtime_mins` 合計 ÷ `punched.length`。punched が0なら 0 | FR-005（休日分はペースに入れない） |
| `remain` | `warning − ot` | FR-005 |
| `hitDate` | `future`（`today` 以降の営業日）に `pace` を順に足して `warning` に届く最初の日。届かなければ null | FR-005 |
| `forecast` | `ot + pace × future.length` | FR-005 |
| `status` | `none`（打刻も休日出勤も無い）／`warn`（ot ≥ warning）／`caution`（ot ≥ caution）／`safe` | FR-006 |
| `paceIsRough` | `punched.length < 3` | Edge（T24） |

### 部署の一覧 `DeptView`
`members` を `status` の重い順（warn → caution → safe → none）、同じなら `remain` 昇順。部長は `self: true`。（FR-001）

### 全社の一覧 `CompanyView`
除外を除く全員の `PersonMonth`。状態ごとの件数、部門ごとの件数、`head_num` が無い部署の印。（FR-010・011）

### 鮮度 `Freshness`
`prevBusinessDay` = カレンダーの営業日で `today` より前の最後の日。`lastPunchDate` = データ中の打刻の最終日。
`stale` = `lastPunchDate < prevBusinessDay`。`undeterminable` = カレンダーに `today` より前の営業日が無い（月初）。（FR-012・R-2）

## 状態遷移
無し。すべて開くたびに再計算する。保存する状態は無い。
