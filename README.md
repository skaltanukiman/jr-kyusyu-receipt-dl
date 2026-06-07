# JR九州 領収書ダウンローダー

JR九州インターネット列車予約の予約一覧画面から、各予約の詳細画面を順番に開き、表示されている領収書を保存する TypeScript CLI です。

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

Edge が開いたら、JR九州にログインし、`予約確認・QR表示・変更・払いもどし` の予約一覧画面を表示してください。準備ができたらターミナルで Enter を押します。

このツールは予約一覧の赤い `詳細` ボタンを上から順番に開き、詳細画面の中で `領収書` ボタンを探します。領収書がない予約はスキップします。領収書画面では `印刷` ボタンの処理を実行し、印刷用レイアウトをPDFとして保存します。JR九州サイトはブラウザの戻る操作を嫌うため、各詳細の確認後は一覧URLを再読み込みして次の予約へ進みます。

問題なければ実際にダウンロードします。

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
  "detailButtonPatterns": ["詳細"],
  "printButtonPatterns": ["印刷"],
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

画面上のボタン名が変わった場合は、`receiptLinkPatterns`、`detailButtonPatterns`、`printButtonPatterns` に新しい文言を追加してください。