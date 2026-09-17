# Implementation Plan: 所属長の残業時間管理（月間）

**Branch**: `001-saburoku-monitor`（作業ブランチは `article/03-saburoku-monitor`） | **Date**: 2026-09-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-saburoku-monitor/spec.md`

## Summary

所属長が、自分の部下の今月の時間外を「残り」「1日あたり」「超える予定日」に直して毎朝見る画面。労務担当は全社を状態順に見る。
freee人事労務から事前に読んで JSON に落とした日次勤怠・打刻・所属・勤務カレンダーを、**静的な HTML＋素の JavaScript** が fetch で読み、
ブラウザの中だけで計算して表示する。freee へは書かない。通知はしない。
計算は**純関数**として1ファイルに分け、ブラウザと node の両方から同じ関数を呼ぶ。node 側の検証スクリプトが `TESTCASES.md` の T01〜T30 を
`data/*.json` に対して確かめる（憲法 III）。

## Technical Context

**Language/Version**: HTML5 / CSS / JavaScript（ES2020。ブラウザは現行 Chrome・Edge。node 20+ で検証スクリプトを実行）

**Primary Dependencies**: なし（ライブラリ・フレームワーク・ビルド工程を持たない。憲法 IV）

**Storage**: なし。読むのは `data/saburoku_2026-09.json`（freee から読んだ結果。閾値の履歴もこの中）。書き込みはしない。ブラウザの localStorage も使わない

**Testing**: `check_saburoku.js`（node。既存の `check.js` と同じ流儀＝依存なし・`node check_saburoku.js` で OK/NG を出す）。画面の目視確認はヘッドレス Chrome のスクリーンショット

**Target Platform**: ローカルの静的サーバー（`python -m http.server 4173`）で開くブラウザ。ワークベンチ `index.html` の「残業管理」タブ（iframe）からも開く

**Project Type**: 静的 Web ページ（単一ページ＋計算モジュール＋検証スクリプト）

**Performance Goals**: 要求なし（従業員34人・所属長1人あたり十数人）

**Constraints**: freee API を直接呼ばない（読むのは事前に落とした JSON）／認証・権限・配信は範囲外／日本語／既存の `index.html` の iframe 連携（`data-page="saburoku"` → `./saburoku.html?v=N`）を壊さない

**Scale/Scope**: 34人・15部門・1か月。画面は2つのビュー（所属長／全社）＋日別の表

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|---|---|---|
| I. freee が正本（読むだけ） | **PASS** | 実装は JSON を読むだけ。freee へ書かない。こちらで持つのは閾値の履歴（設定値）と取得日時（ログ）だけ。業務データの写しは作らない |
| II. 要求は4視点で書く／漏れは要求へ戻す | **PASS** | spec は REQUEST.md 第2部から導いた。plan で見つかった漏れは REQUEST.md の漏れ台帳へ（下の「plan で見つかったこと」） |
| III. テストで検証する | **PASS** | 計算を純関数に分け、`check_saburoku.js` が T01〜T30 を data/*.json で確認する。タスクは T番号を持つ（tasks で担保） |
| IV. 作り込まない | **PASS** | HTML＋CSS＋素の JS、3ファイル＋検証1本。ライブラリなし。範囲外（通知・複数月・認証…）は作らない |
| V. 分かったことを記録する | **PASS** | 各段を `TESTDATA_LOG.md` に記録。記事133の材料ファイルにも |

**Post-design re-check（Phase 1 後）**: 変更なし。data-model に「業務データを持たない」ことを明記。契約は JSON の形と URL のハッシュだけ。

### plan で見つかったこと（要求へ戻す候補）

- **「今日」をどう決めるか。** T25 の判定（前営業日の打刻を含むか）は「今日」が要る。実装は端末の時計を使うが、検証では日付を固定したい。
  → spec には無い。**要求の漏れではなく実装の都合**なので、URL の `?today=YYYY-MM-DD` で上書きできる、と契約に書く（漏れ台帳には載せない）
- **祝日を freee のカレンダーから読む、の範囲。** JSON の `calendar` は対象月だけ。「前営業日」が前月末になる月初（10/1 の朝）は、前月のカレンダーが要る。
  → **要求の漏れ台帳 #2 候補**（データ視点：カレンダーの範囲が「対象月」だけでは月初に足りない）。tasks の前に REQUEST.md へ戻す

## Project Structure

### Documentation (this feature)

```text
specs/001-saburoku-monitor/
├── plan.md              # このファイル
├── research.md          # Phase 0：時刻・日付の扱い（JST 固定）
├── data-model.md        # Phase 1：読むデータと計算した断面
├── quickstart.md        # Phase 1：動かし方と検証の手順
├── contracts/
│   ├── data-json.md     # data/saburoku_YYYY-MM.json の形（読む側の契約）
│   └── page-url.md      # saburoku.html の URL ハッシュ・クエリ（ワークベンチとの契約）
└── tasks.md             # Phase 2（/speckit-tasks）
```

### Source Code (repository root)

```text
saburoku.html            # 画面。既存を置き換える。CSS はこの中。DOM 描画だけを持つ
saburoku_calc.js         # 純関数：営業日・前営業日・閾値の選択・1人ぶんの断面・並び順・鮮度判定。ブラウザと node で共用
check_saburoku.js        # node 検証。data/*.json を読み、T01〜T30 の期待値を assert。既存 check.js と同じ流儀
data/
├── saburoku_2026-09.json            # 本データ（threshold_history を含む）
├── saburoku_2026-09_t25_stale.json  # T25：古い朝
└── saburoku_2026-09_t25_broken.json # T25：壊れた JSON
index.html               # 変更しない（iframe の src のキャッシュ番号だけ上げる）
```

**Structure Decision**: 単一の静的ページ。ディレクトリを増やさない（既存の `index.html`・`app.js`・`check.js` と同じ階層に置く）。
計算とDOMを分けるのは、node で検証するためだけ（憲法 III）。それ以外の分割はしない。

## Complexity Tracking

憲法の違反なし。記入不要。
