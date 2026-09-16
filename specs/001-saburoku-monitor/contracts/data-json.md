# Contract: `data/saburoku_YYYY-MM.json`（読む側の契約）

画面と検証スクリプトはこの形を読む。作る側（MCP で freee から落とす手順）はこの仕様の範囲外だが、形はここに従う。
実物：`data/saburoku_2026-09.json`。

```jsonc
{
  "source": "freee人事労務 API（開発用テスト事業所 12755401）",
  "fetched_at": "2026-09-16T08:30:00+09:00",   // 取得日時。画面の下に出す
  "as_of": "2026-09-16",                        // この数字が「いつ時点」か。既定の「今日」
  "month": "2026-09",                           // 対象月（勤務月）
  "endpoints": ["..."],                         // 読んだ API。記録用
  "thresholds": { "caution_mins": 2160, "warning_mins": 2700, "note": "..." },   // 後方互換。history が無いときだけ使う
  "threshold_history": [                        // 正本は freee の36協定設定。写し
    { "effective_from": "2025-04-01", "warning_mins": 2700, "caution_mins": 2160, "source": "..." },
    { "effective_from": "2026-09-15", "warning_mins": 2400, "caution_mins": 1920, "source": "..." }
  ],
  "calendar": { "2026-09-01": "normal_day", "2026-09-05": "prescribed_holiday", "2026-09-06": "legal_holiday" },
  "departments": [                              // 所属長ビュー用（部署ごとに部長＋部下）
    { "group": { "id": 918839, "code": "D103", "name": "人事部" },
      "manager": { "employee_id": 4211185, "num": "E001", "name": "相川 悠介", "position": "部長", "note": "..." },
      "members": [ ] }
  ],
  "company": {                                  // 全社ビュー用
    "note": "...",
    "excluded": [ { "num": "E002", "name": "...", "reason": "役員・勤怠管理なし" } ],
    "departments": [ { "code": "D101", "name": "経理部", "group_id": 918835, "hq": "管理本部", "head_num": "E004" } ],
    "members": [ ]
  }
}
```

## Member

```jsonc
{
  "employee_id": 4211254, "num": "E009", "name": "堀内 舞", "position": "主任",
  "self": false,                                // 所属長ビュー：部長自身なら true
  "summary": { "work_days": 9, "overtime_mins": 1380, "latenight_mins": 0 },   // freee の月次（参考。判定には使わない）
  "records": [ ]
}
```
`company.members` の Member は、さらに `dept`・`dept_name`・`hq`・`head_num`・`sub[]`・`is_head`・`etype`・`data_state` を持つ。

## Record（1日）

```jsonc
{ "date": "2026-09-01", "clock_in": "09:00", "clock_out": "20:00", "break_mins": 60, "overtime_mins": 120, "latenight_mins": 0 }
{ "date": "2026-09-08", "clock_in": null, "clock_out": null, "overtime_mins": 0, "is_absence": true }
{ "date": "2026-09-11", "clock_in": null, "clock_out": null, "overtime_mins": 0, "time_clock_only": { "clock_in": "09:00", "note": "出勤打刻だけ" } }
{ "date": "2026-09-12", "clock_in": "10:00", "clock_out": "15:00", "break_mins": 0, "overtime_mins": 300, "day_pattern": "prescribed_holiday" }
```
上から：通常／欠勤／退勤なし（出勤打刻だけ）／休日出勤。

## 規則

- 日付はすべて `YYYY-MM-DD`。時刻は `HH:MM`（JST）。分は整数
- `records` に無い営業日＝打刻なし（みなし）。JSON に「打刻なし」の行は作らない
- `calendar` は対象月の全日を持つ（月初の前営業日判定に前月が要る件は R-2・漏れ台帳 #2 候補）
- 壊れた JSON・読めない JSON は、画面が「全員 取得できず」を出す（FR-012）。T25 用に `_t25_broken.json` を置いている
