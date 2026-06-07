# JR九州 領収書ダウンローダー

JR九州インターネット列車予約の予約一覧画面から、表示されている領収書を順番に保存する TypeScript CLI です。

## 方針

Playwright が直接起動するブラウザでは JR九州のログイン画面遷移で `ERR_HTTP2_PROTOCOL_ERROR` が出ることがあるため、この版では通常の Microsoft Edge を最小フラグで起動し、TypeScript から CDP 接続して操作します。

- パスワード、Cookie、ログイン状態を `.auth/` に保存しません。
- Edge 実行中だけ一時プロファイルを使い、終了時に削除します。
- ログイン、パスワード入力、追加認証は手動で行います。
- Edge のリモートデバッグポートは `127.0.0.1` の空きポートに限定します。
- GitHub への push は自動では行いません。

## セットアップ

```powershell
npm.cmd install
npx.cmd playwright install chromium
Copy-Item config.example.json config.json
```

## ダウンロード

まず保存予定を確認します。

```powershell
npm.cmd run download -- --dry-run
```

Edge が開いたら、JR九州にログインし、領収書を取得したい予約一覧を表示してください。準備ができたらターミナルで Enter を押します。

問題なければダウンロードします。

```powershell
npm.cmd run download
```

既に同名ファイルがある場合は上書きせずスキップします。

## 設定

`config.json` の主な項目です。

```json
{
  "startUrl": "https://train.yoyaku.jrkyushu.co.jp/jr/login",
  "downloadDirectory": "./downloads",
  "fileNameTemplate": "JR九州_{year}{month}_{index}.pdf",
  "receiptLinkPatterns": ["領収書", "領収書を表示", "領収書表示"],
  "maxReceipts": 100,
  "startupTimeoutMs": 30000
}
```

保存名テンプレートで使える値:

- `{year}`: 前月の西暦4桁
- `{month}`: 前月の月2桁
- `{index}`: 連番2桁

Edge が標準の場所にない場合は `edgeExecutablePath` を追加してください。

```json
{
  "edgeExecutablePath": "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
}
```

画面上の領収書ボタン名が変わった場合は、`receiptLinkPatterns` に新しい文言を追加してください。