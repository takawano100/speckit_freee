# Contract: `saburoku.html` の URL（ワークベンチとの契約）

ワークベンチ `index.html` は「残業管理」タブで `./saburoku.html?v=N` を iframe に読む。これを壊さない。

| 形 | 意味 | 例 |
|---|---|---|
| `saburoku.html` | 所属長ビュー・先頭の部署 | — |
| `#dep=<n>` | 所属長ビューで n 番目の部署（0 始まり） | `#dep=3` 労務部 |
| `#all` | 全社ビュー（労務担当） | — |
| `?data=<path>` | 読む JSON を差し替える（検証用。既定 `data/saburoku_2026-09.json`） | `?data=data/saburoku_2026-09_t25_stale.json` |
| `?today=YYYY-MM-DD` | 「今日」を上書きする（検証用。既定は JSON の `as_of`） | `?today=2026-09-15` |
| `?v=N` | キャッシュ避け。意味は無い | `?v=2` |

- ハッシュは切り替え時に `history.replaceState` で更新する（戻るボタンの履歴を汚さない）
- 画面が読み込みに失敗しても、ハッシュとクエリは保持する
- `saburoku_calc.js` が公開する関数（node からも呼ぶ）：
  `businessDays(calendar)`, `prevBusinessDay(calendar, today)`, `pickThreshold(history, fallback, monthFirstDay)`,
  `personMonth(member, calendar, today, threshold)`, `sortMembers(rows)`, `freshness(data, today)`, `hm(mins)`, `md(date)`, `weekday(date)`
