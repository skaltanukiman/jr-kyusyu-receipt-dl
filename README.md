# JR九州 領収書ダウンローダー

JR九州インターネット列車予約の予約一覧画面から、表示されている領収書を順番に保存する
TypeScript CLIです。

## 前提

- Node.js 22以降をインストールしてください。
- 初回ログイン、ワンタイムパスワード、CAPTCHAなどは手動で操作します。
- ログイン状態は `.auth/` にローカル保存されます。共有・コミットしないでください。
- 対象期間の絞り込みが必要な場合は、ダウンロード実行前に表示ブラウザ上で操作してください。
- 会社への送信処理は含みません。送信先・送信方法が決まれば別処理として追加できます。

## セットアップ

```powershell
npm install
npx playwright install chromium
Copy-Item config.example.json config.json
npm run download -- --setup
```

ブラウザでログインし、領収書を取得したい予約一覧を表示してから、ターミナルで Enter を押します。

## ダウンロード

まず保存予定を確認します。

```powershell
npm run download -- --dry-run
```

問題なければダウンロードします。

```powershell
npm run download
```

既に同名ファイルがある場合は上書きせずスキップします。

## 保存名の変更

`config.json` の `fileNameTemplate` を変更します。利用できる値:

- `{year}`: 前月の西暦4桁
- `{month}`: 前月の月2桁
- `{index}`: 連番2桁

例:

```json
{
  "fileNameTemplate": "交通費_JR九州_{year}年{month}月_{index}.pdf"
}
```

画面上の領収書ボタン名が変わった場合は、`receiptLinkPatterns` に新しい文言を追加してください。
