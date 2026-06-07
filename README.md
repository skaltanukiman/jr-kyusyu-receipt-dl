# JR九州 領収書ダウンローダー

JR九州インターネット列車予約の予約一覧画面から、表示されている領収書を順番に保存する TypeScript CLI です。

## 安全寄りの運用

この版ではログインセッションを保存しません。毎回ブラウザで手動ログインし、領収書一覧まで移動したあと、ダウンロード処理だけを自動化します。

- パスワード、Cookie、ログイン状態を `.auth/` に保存しません。
- ワンタイムパスワード、CAPTCHA、追加認証は手動で対応します。
- ブラウザを閉じるとログイン状態は基本的に残りません。
- 会社への送信処理は含みません。送信先・送信方法が決まれば別処理として追加できます。

## セットアップ

Node.js 22 以降をインストールしてください。

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

ブラウザが開いたら、JR九州にログインし、領収書を取得したい予約一覧を表示してください。準備ができたらターミナルで Enter を押します。

問題なければダウンロードします。

```powershell
npm.cmd run download
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
