# Tasks: 所属長の残業時間管理（月間）

**Input**: Design documents from `/specs/001-saburoku-monitor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 憲法 III により**必須**。検証は `check_saburoku.js`（node・依存なし）で、実装の前に書いて先に失敗させる。
**T番号**: すべてのタスクは `TESTCASES.md` のケース番号（`T01`〜`T31`）を `〔T..〕` で持つ。持てないタスクは作らない。

> **番号の衝突について**：Spec Kit のタスク ID は `T001` 形式だが、テストケース番号 `T01` と読み違えるので、
> このファイルではタスク ID を **`K001`** 形式にした（K＝工程）。ID の規則以外は Spec Kit の型どおり。
> この衝突は「Spec Kit が勝手に決めたこと」として `TESTDATA_LOG.md` に記録する。

**Organization**: ユーザーストーリー順（US1 P1 → US2 P2 → US3 P3 → US4 P3）。各ストーリーの中は 検証 → 純関数 → 画面 の順。

## Format: `[ID] [P?] [Story] Description 〔T..〕`

- **[P]**: 別ファイルで依存なし。並行してよい
- **[Story]**: US1〜US4（spec.md のユーザーストーリー）
- **〔T..〕**: TESTCASES.md のケース番号

## Path Conventions

リポジトリ直下（plan.md の構成どおり）。ディレクトリは増やさない。

```text
saburoku_calc.js      純関数（ブラウザ・node 共用）
check_saburoku.js     node 検証
saburoku.html         画面（既存を置き換える）
data/*.json           テストデータ（既にある）
index.html            iframe のキャッシュ番号だけ
```

---

## Phase 1: Setup

**Purpose**: 器を作る。ロジックは書かない。

- [X] K001 `saburoku_calc.js` の骨組みを作る：`Saburoku` オブジェクトに空の関数（`businessDays`, `prevBusinessDay`, `pickThreshold`, `personMonth`, `sortMembers`, `freshness`, `hm`, `md`, `weekday`）と、末尾の `module.exports` / `window.Saburoku` の分岐（research R-3） 〔T02〕
- [X] K002 [P] `check_saburoku.js` の骨組みを作る：`data/*.json` を読む・`require('./saburoku_calc.js')`・`ok(name, cond, detail)` で集計し、最後に `OK:`／`NG:` を出して終了コードを返す。既存 `check.js` の流儀に合わせる 〔T02〕
- [X] K003 [P] `saburoku.html` を新規に書き直す骨組み：`<script src="saburoku_calc.js">` を読み、`?data=`・`?today=`・`#dep=`・`#all` を解釈して `Saburoku` を呼ぶだけの空の画面（contracts/page-url.md）。CSS は既存のものを流用してよい 〔T17〕

**Checkpoint**: `node check_saburoku.js` が「0件確認」で終了コード 0。画面は空で開く。

---

## Phase 2: Foundational（全ストーリーが依存する純関数）

**Purpose**: 営業日・閾値・日付表示。これが無いとどのストーリーも計算できない。

- [X] K004 検証：`check_saburoku.js` に営業日・前営業日・閾値選択・表示関数の assert を書く。9月の営業日は19日（9/21〜23 は休み）／今日 9/16 の前営業日は 9/15／閾値は 2026-09-01 時点で 45:00・36:00、2026-10-01 時点で 40:00・32:00／`hm(1845)==='30:45'`／`weekday('2026-09-28')==='月'`。**この時点で失敗することを確認** 〔T10・T30〕
- [X] K005 `saburoku_calc.js`：`businessDays(calendar)` と `prevBusinessDay(calendar, today)`（research R-2。カレンダーに無ければ null） 〔T10・T31〕
- [X] K006 [P] `saburoku_calc.js`：`pickThreshold(history, fallback, monthFirstDay)`（`effective_from ≤ monthFirstDay` の最新。history が無ければ fallback。次に来る更新も返す） 〔T30〕
- [X] K007 [P] `saburoku_calc.js`：`hm(mins)`・`md(date)`・`weekday(date)`（`Date.UTC` で曜日。research R-1） 〔T03〕

**Checkpoint**: K004 の assert が通る。

---

## Phase 3: User Story 1 — 所属長が、部下の「残り」と「超える日」を毎朝見る (Priority: P1) 🎯 MVP

**Goal**: 所属長ビュー。部下ごとに 実績・残り・1日あたり・予定日・月末見込み・状態。主務の部下だけ、状態の重い順。

**Independent Test**: `check_saburoku.js` で 三上・岡田・白石・堀内・加瀬 の期待値が出る。画面 `#dep=3` で三上に 9/28（月）。

### 検証（先に書く）

- [X] K008 [US1] `check_saburoku.js`：`personMonth` の assert。三上 ot=1485・remain=1215・pace=165・hitDate='2026-09-28'・forecast=3135・status='safe'／岡田 ot=1845・hitDate='2026-09-18'・forecast=3895・status='safe'（注意線36h）／白石 ot=2745・status='warn'・hitDate=null／堀内 ot=1380（休日5h込み）・pace=120・hitDate=null／加瀬 ot=450 〔T02・T03・T04・T07〕
- [X] K009 [P] [US1] `check_saburoku.js`：`sortMembers` の assert。人事部は 堀内（remain 1320）→ 加瀬（2250）→ 長瀬 → 相川（none）の順。相川は労務部の members に居ない（JSON の形で担保。全社 members の dept で確認） 〔T13・T14・T16〕

### 実装

- [X] K010 [US1] `saburoku_calc.js`：`personMonth(member, calendar, today, threshold)`（data-model の PersonMonth。punched／holidayWork／ot／pace（休日分を除く）／remain／hitDate／forecast／status／paceIsRough） 〔T02・T03・T04・T07・T10〕
- [X] K011 [US1] `saburoku_calc.js`：`sortMembers(rows)`（warn→caution→safe→none、同じなら remain 昇順） 〔T02〕
- [X] K012 [US1] `saburoku.html`：所属長ビュー。部署ボタン（`departments`）、カード（氏名・役職・自分・状態・実績・バー・残り・1日あたり・予定日・月末見込み）、`#dep=n` の読み書き。予定日は `paceIsRough` なら「まだ目安」を添える 〔T02・T03・T04・T07・T13・T24〕
- [X] K013 [US1] `saburoku.html`：画面上部に「対象月・時点・経過／残り営業日・**閾値 45:00／36:00（2025-04-01〜）・次回 2026-09-15〜 40:00／32:00**」を出す 〔T30〕

**Checkpoint**: `node check_saburoku.js` で US1 の assert が通る。ヘッドレス Chrome で `#dep=3` を撮り、三上 9/28（月）を目視。

---

## Phase 4: User Story 2 — 打刻の状態を見分けて、数字の信用度が分かる (Priority: P2)

**Goal**: 打刻なし／欠勤／退勤なし／休日出勤を別々に数え、日別の表に「未」「欠」「退勤なし」「休」で出す。

**Independent Test**: 長瀬 missing=4（うち halfClock=1）・ot=510／加瀬 absent=1・missing=0／平井 ot=0・status='safe'／相川 status='none'・missing=9。

### 検証（先に書く）

- [X] K014 [US2] `check_saburoku.js`：長瀬 `missing.length===4`・`halfClock.length===1`・`punched.length===5`・pace=102／加瀬 `absent.length===1`・`missing.length===0`／平井 ot=0・status='safe'／相川 status='none'・missing=9／堀内 `holidayWork=['2026-09-12']` 〔T01・T05・T06・T10・T11・T12〕

### 実装

- [X] K015 [US2] `saburoku_calc.js`：`personMonth` に absent／halfClock／missing の区別を入れる（K010 に含めてよいが、assert はここで通す） 〔T05・T06・T11・T12〕
- [X] K016 [US2] `saburoku.html`：カードに「打刻なし n日/N日（退勤なし k）」「欠勤 n日」「休日出勤 n日（h:mm を合計に含む）」を出す。0 のものは出さない 〔T05・T06・T10・T11・T12〕
- [X] K017 [US2] `saburoku.html`：日別の表。列＝経過営業日＋休日出勤があった日（「休」）。セル＝時間外／「未」／「欠」／「退勤なし」。3時間以上は色 〔T06・T10・T11・T12・T16〕

**Checkpoint**: US2 の assert が通る。人事部の画面で 長瀬の行に「未・退勤なし」、加瀬に「欠」、堀内に 9/12（土・休）列。

---

## Phase 5: User Story 3 — 労務担当が全社を状態順に見る (Priority: P3)

**Goal**: 全社ビュー。件数・部門ストリップ・フィルタ・一覧（部門・所属長・氏名・兼務・状態・数字・データ取得状態）。所属長のいない部署に印。

**Independent Test**: 34人。warn=1・caution=0・safe=6・none=27。先頭は白石。部長の行は「自分（部長）」。

### 検証（先に書く）

- [X] K018 [US3] `check_saburoku.js`：`company.members` 全員を `personMonth` → 件数 warn=1／caution=0／safe=6／none=27、`sortMembers` の先頭が白石、`excluded.length===2`、`head_num` の無い部署は 0 件 〔T15・T17〕

### 実装

- [X] K019 [US3] `saburoku.html`：「所属長として見る／全社を見る」の切替と `#all` 〔T17〕
- [X] K020 [US3] `saburoku.html`：全社ビュー。件数カード・部門ストリップ（要対応数・「（所属長なし）」）・状態と部門のフィルタ・一覧（状態・本部・部門・所属長／自分（部長）／所属長なし・氏名・兼務・役職・時間外・残り・予定日・打刻なし・データ） 〔T13・T15・T17〕

**Checkpoint**: US3 の assert が通る。`#all` の画面で白石が先頭、件数が一致。

---

## Phase 6: User Story 4 — 数字の鮮度が分かる (Priority: P3)

**Goal**: 前営業日の打刻を含まない朝は赤い注意書き。JSON が読めない朝は全員「取得できず」。

**Independent Test**: `_t25_stale.json`（今日 9/15）で stale=true・prevBusinessDay='2026-09-14'・lastPunch='2026-09-11'。本データ（今日 9/16）で stale=false？→ **注意：本データも打刻は 9/11 まで。前営業日 9/15 を含まないので stale=true になる。** これは正しい挙動（データを 9/16 に読み直していないから）。検証では `?today=2026-09-14` で stale=false を確認する。

### 検証（先に書く）

- [X] K021 [US4] `check_saburoku.js`：`freshness(staleData, '2026-09-15')` → stale=true・prev='2026-09-14'・last='2026-09-11'／`freshness(data, '2026-09-14')` → stale=false／`freshness(data, '2026-09-13')`（日曜）→ prev='2026-09-11'・stale=false／カレンダー外（today='2026-09-01'）→ undeterminable=true 〔T25・T31〕

### 実装

- [X] K022 [US4] `saburoku_calc.js`：`freshness(data, today)`（data-model の Freshness） 〔T25・T31〕
- [X] K023 [US4] `saburoku.html`：stale なら最上部に赤で「前回 9/13 19:00 の数字です（9/11 の打刻まで）」、undeterminable なら「前営業日を判定できない（カレンダーが前月を含まない）」。fresh なら下に取得日時だけ 〔T25・T31〕
- [X] K024 [US4] `saburoku.html`：JSON の fetch 失敗・parse 失敗のとき、一覧の枠を出して全員「取得できず」（メンバー名は出せないので「取得できず」の行を1つ＋赤の説明）。ハッシュ・クエリは保持 〔T25〕

**Checkpoint**: `?data=..._t25_stale.json` で赤い注意書き、`..._t25_broken.json` で「取得できず」。

---

## Phase 7: Polish & 検証の記録

- [X] K025 `index.html`：iframe の `./saburoku.html?v=N` の N を上げる（それ以外は触らない） 〔T17〕
- [X] K026 quickstart.md の URL を順に開いてヘッドレス Chrome で撮り、`specs/001-saburoku-monitor/shots/` に保存（目視の証拠） 〔T02〜T07・T17・T25・T30〕
- [X] K027 `TESTCASES.md` を更新：T01〜T07・T09〜T17・T25・T30 の状態を「済（Spec Kit 実装で再現）」に、T03 の期待値を「安全・予定日 9/18」に書き換え、T31 は未のまま。確認ログに行を足す 〔T01〜T31〕
- [X] K028 `TESTDATA_LOG.md`：Spec Kit の表に tasks・implement の行（聞かれたこと・勝手に決めたこと・こちらが直したこと。K番号の件を含む） 〔T17〕
- [X] K029 [P] 記事133の材料ファイル（`My_First_Skills_Graphs/下書きドラフト案/note_draft_axis_b_133_speckit_plan_implement_材料.md`）に、implement で起こったことと「Spec Kit なしの saburoku.html との差」を追記 〔T17〕

---

## Phase 8: 2周目（2026-09-17）— 保留3つを要求で決めて反映

**Purpose**: T18（月途中の入社・退職＝FR-017）と T15（所属長のいない部署＝FR-011 追記）。T27 は決定 #11 で済（タスクなし）。
1周目の K001〜K029 は済。`setup-tasks.ps1` は tasks.md が既にあると上書きしない。

**Independent Test**: `node check_saburoku.js` で 新井 ot=480・punched=4・missing=0／富永 ot=480・missing=0・retired=true・hitDate=null／全社 35人・safe 8・none 26・所属長なし 1 部署。画面 `#dep=4`（新井「入社 9/8」）、`#dep=5`（富永「退職 9/10」）、`#dep=6`（見出し「カスタマーサポート部 ・ 所属長なし」）。

### 検証（先に書く）

- [ ] K030 [US2] `check_saburoku.js`：T18 の assert。新井（総務部）ot=480・punched.length=4・missing.length=0・pace=120・hitDate=null・notYetJoined=false／富永（法務部）ot=480・punched.length=8・missing.length=0・retired=true・hitDate=null・forecast=null 〔T18〕
- [ ] K031 [P] [US3] `check_saburoku.js`：K018 の件数を更新（35人・safe 8・none 26・`head_num` の無い部署 1・is_head 14）。T15 の assert：`departments` にカスタマーサポート部があり `manager` が null 〔T15・T17〕

### 実装

- [ ] K032 [US2] `saburoku_calc.js`：`personMonth` に在籍期間を入れる。`enrollFrom`＝`entry_date`（無ければ月初）、`enrollTo`＝`retire_date`（無ければ月末）。`past`・`future` をこの範囲で切る。`retired`（retire_date < today）なら `hitDate`=null・`forecast`=null。`notYetJoined`（entry_date > today）。返り値に `enrollFrom`・`enrollTo`・`retired`・`notYetJoined` 〔T18〕
- [ ] K033 [US2] `saburoku.html`：カードに「入社 9/8」「退職 9/10」の印（`.who small` に）。退職済みは予定日・月末見込みを「—」。日別の表で在籍期間外の日は `—`（「未」にしない）〔T18〕
- [ ] K034 [US3] `saburoku.html`：`departments[].manager` が null のとき、部署ボタンを「○○部 ・ 所属長なし」、見出しを「○○部 ・ 所属長なし の残業時間管理」。カードは普通に出す（`self` は無い）〔T15〕
- [ ] K035 [US3] `saburoku.html`：全社ビューの所属長列は変更なし（既に「所属長なし」を出す）。件数の表示が 35 人になることを目視 〔T15・T17〕

### 検証の記録

- [ ] K036 `index.html`：iframe の `./saburoku.html?v=N` を上げる 〔T17〕
- [ ] K037 ヘッドレス Chrome で `#dep=4`・`#dep=5`・`#dep=6`・`#all` を撮り `specs/001-saburoku-monitor/shots/lap2_*.png` に保存 〔T15・T18〕
- [ ] K038 `TESTCASES.md`：T15・T18 を「済（2周目）」、T25 を「済」に直す。確認ログに 9/17 の行 〔T15・T18・T25〕
- [ ] K039 `TESTDATA_LOG.md`：2026-09-14 の表に 2周目の段ごとの行（clarify 2問・plan 漏れ #3・tasks 10・implement の推移・/cost・時刻）〔T17〕

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → US4 → Polish。**US2 は US1 の `personMonth` を拡張する**ので、US1 のあと
- US3・US4 は US1 の純関数に依存するが、互いには独立
- 各ストーリーの中：検証（先に書いて失敗させる）→ 純関数 → 画面

### Parallel Opportunities

- K002・K003（Setup）は K001 と並行
- K006・K007 は K005 と並行
- K009 は K008 と並行
- K029 は K027・K028 と並行

## Parallel Example: Phase 2

```text
K005 businessDays / prevBusinessDay    （saburoku_calc.js）
K006 pickThreshold                      （同ファイル・別関数。同じ人が続けて書く）
K007 hm / md / weekday                  （同ファイル・別関数）
```
※ 同一ファイルなので、実際は1人で順に書く。[P] は「依存が無い」の意味。

## Implementation Strategy

### MVP First（US1 だけ）
1. Phase 1・2 → 2. US1（K008〜K013）→ **止めて検証**：`node check_saburoku.js`、`#dep=3` の目視 → 3. ここで一度コミット

### Incremental
US2 → US3 → US4 の順に、各 Checkpoint で `node check_saburoku.js` を通してコミット。最後に Polish。

## Notes

- 範囲外（通知・複数月・年間・認証・権限・配信・フレックス・パート・役員）のタスクは無い。増やさない（憲法 IV）
- 途中で要求の漏れが出たら、REQUEST.md の漏れ台帳 → 要求本文 → TESTCASES → spec の順（憲法 II）。tasks はその後に直す
- コミットは Checkpoint ごと。メッセージは日本語
