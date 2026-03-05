# economy_snapshot / microCMS 保存メモ

## 目的
- ローカルの `copper-for-me` から `microCMS` の `economy_snapshots` を手動更新する
- 欠けた日付を埋める（backfill）ときに使う

## 前提（今回の運用方針）
- 本番サイトは `microCMS` から読むだけ
- 保存はローカルで実行する
- `mode=csv` では:
  - 基本は CSV ベース
  - CSV に指定日データがない場合のみ **FRED だけ** API 補完
  - `Alpha Vantage` / `Metals.dev` は API を回さない

## 事前準備
### 1. ローカルで Next.js を起動
```bash
cd /home/bigfooter/dev/openclaw-project/copper-for-me
npm run dev
```

### 2. `.env.local` に必要な設定があること
- `ECONOMY_SNAPSHOT_API_TOKEN` または `MARKET_SNAPSHOT_API_TOKEN` または `CRON_SECRET`
- `MICROCMS_*`（snapshot書き込み用）
- `FRED_API_KEY`（FRED補完を使う場合）

トークン有無の確認（値は表示しない）:
```bash
grep -E '^(ECONOMY_SNAPSHOT_API_TOKEN|MARKET_SNAPSHOT_API_TOKEN|CRON_SECRET)=' .env.local | sed 's/=.*/=***hidden***/'
```

## 手動更新コマンド（欠け日を埋める）
### date指定 + CSV優先 + FREDのみ補完
```bash
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=csv&date=2026-02-21&fredFallback=1" \
  -H "Authorization: Bearer 実際のトークン文字列"
```

### 例: 連続日を埋める
```bash
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=csv&date=2026-02-21&fredFallback=1" -H "Authorization: Bearer 実トークン"
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=csv&date=2026-02-22&fredFallback=1" -H "Authorization: Bearer 実トークン"
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=csv&date=2026-02-23&fredFallback=1" -H "Authorization: Bearer 実トークン"
```

## レスポンスの見方（重要）
成功例:
```json
{
  "ok": true,
  "mode": "csv",
  "requestedDate": "2026-02-21",
  "updatedAt": "2026-02-24T10:22:14.577Z",
  "cacheBucketJst": "2026-02-21",
  "sourceStatus": {
    "mode": "csv",
    "fred": "fallback",
    "alpha": "empty",
    "metals": "disabled"
  },
  "counts": { "fred": 23, "alpha": 0 },
  "csvStats": {
    "targetDate": "2026-02-21",
    "csvHits": 11,
    "fredApiFallbackHits": 12,
    "misses": 3
  },
  "persisted": {
    "ok": true,
    "action": "updated",
    "id": "xmy_7ucpj"
  }
}
```

### 主な確認ポイント
- `ok: true` → API実行成功
- `persisted.ok: true` → microCMS 保存成功
- `persisted.action`
  - `created` = 新規作成
  - `updated` = 既存日付を更新
- `cacheBucketJst` → microCMS に保存される日付キー
- `sourceStatus.fred`
  - `ok` = FREDはCSVだけで足りた（またはAPI不要）
  - `fallback` = 一部を FRED API で補完した
- `csvStats.csvHits` / `fredApiFallbackHits` / `misses`
  - 何件CSVで取れたか、何件FRED API補完したか、何件欠損したか

## よくあるエラー
### 401 unauthorized
原因:
- `Authorization` ヘッダのトークンが違う
- `Bearer <TOKEN>` の `<TOKEN>` をそのまま使っている

対処:
- `.env.local` のトークン値を使う（`ECONOMY_SNAPSHOT_API_TOKEN` / `MARKET_SNAPSHOT_API_TOKEN` / `CRON_SECRET` のどれか）

### FRED補完が効かない
原因:
- `FRED_API_KEY` 未設定
- 指定日以前のデータがFRED側でも取得できない

## 補足
- `mode=live`（従来挙動）は live API ベースで保存する
- `mode=csv` はローカル運用向け（本番Vercelで `stock-data-processor/data` を読めない前提）

## 表示用の運用ルール（重要）
- 現在の CSV には `USD/JPY`（`usd_jpy`）を入れていない
- そのため、**本番表示で使う最新 snapshot は `mode=live` で作る**
- `mode=csv` は、欠け日を埋める backfill（再現性重視）に使う

### おすすめ手順（実務）
1. 過去日の欠けを埋める → `mode=csv`（ローカルで実行）
2. 最後に当日分を更新 → `mode=live`
3. 本番表示を確認

### 例（本番表示用の最新更新）
```bash
curl -X POST "https://www.copper-for-me.com/api/economy-snapshot/rebuild?mode=live" \
  -H "Authorization: Bearer 実トークン"
```

## コピペ用（運用パターン別）

### 共通前提（ローカルAPIを叩く前に1回）
`http://127.0.0.1:3000/...` を使うコマンドの前に、ローカルで `copper-for-me` を起動しておく。

```bash
cd /home/bigfooter/dev/openclaw-project/copper-for-me
npm run dev
```

### パターンA: 毎日版（CSV更新なし）
- 目的: 当日分の表示を更新する（`USD/JPY` を含む）

#### 1) ローカルで microCMS 更新（live）
```bash
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=live" \
  -H "Authorization: Bearer 実トークン"
```

#### 2) 本番表示を再検証（revalidate）
```bash
curl -X POST "https://www.copper-for-me.com/api/economy-snapshot/rebuild?mode=live" \
  -H "Authorization: Bearer 実トークン"
```

---

### パターンB: CSV更新あり版（backfill + 当日表示更新）
- 目的: CSVを反映しつつ、最後に表示用の最新 snapshot も更新する

#### 1) ローカルで CSVベース更新（指定日）
```bash
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=csv&date=2026-02-25&fredFallback=1" \
  -H "Authorization: Bearer 実トークン"
```

#### 2) ローカルで microCMS 更新（live, 表示用）
```bash
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=live" \
  -H "Authorization: Bearer 実トークン"
```

#### 3) 本番表示を再検証（revalidate）
```bash
curl -X POST "https://www.copper-for-me.com/api/economy-snapshot/rebuild?mode=live" \
  -H "Authorization: Bearer 実トークン"
```

---

### パターンC: 欠け日まとめ埋め（複数日 backfill）
- 目的: 過去日の `economy_snapshots` をまとめて補完する

#### 1) ローカルで CSV backfill（複数日）
```bash
for d in 2026-02-20 2026-02-21 2026-02-22 2026-02-23 2026-02-24; do
  curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=csv&date=${d}&fredFallback=1" \
    -H "Authorization: Bearer 実トークン"
  echo
done
```

#### 2) ローカルで live 更新（表示用に最新を作る）
```bash
curl -X POST "http://127.0.0.1:3000/api/economy-snapshot/rebuild?mode=live" \
  -H "Authorization: Bearer 実トークン"
```

#### 3) 本番表示を再検証（revalidate）
```bash
curl -X POST "https://www.copper-for-me.com/api/economy-snapshot/rebuild?mode=live" \
  -H "Authorization: Bearer 実トークン"
```
