# JR九州 領収書ダウンローダー

> このプロジェクトは、OpenAI Codexの対話を通じて作成しました。  
> 実際のJR九州Webサイトを操作しながら発生したHTTP/2エラー、画面遷移、印刷用PDFの再現、区間・予約状態の取得といった課題を一つずつ確認し、動作結果をもとに実装を改善しています。安全性を考慮してログインセッションを保存せず、面倒な領収書取得部分だけを自動化するなど、利便性と安全性のバランスを意識して設計しました。

## 概要

JR九州インターネット列車予約の予約一覧画面から、領収書を順番にPDFとして保存するTypeScript製CLIツールです。

Microsoft Edgeへのログインと予約一覧画面への移動はユーザーが手動で行い、その後の対象予約の抽出、詳細画面の確認、領収書PDFの保存、ファイル名の生成を自動化します。

## 主な機能

- 予約一覧の「出発日時」を基準に、指定した月の予約だけを処理
- 予約状態が `利用済み` の予約だけを処理
- `5`、`05`、`2026-05`、`00`、`all` 形式の対象月指定
- 対象行の詳細画面と領収書画面を順番に開いてPDF保存
- 出発日、区間、設定した氏名・費目を使用したファイル名生成
- 設定した往路・復路に応じた区分番号の付与
- 同名ファイルが存在する場合のスキップ
- `--dry-run` による保存予定ファイル名の確認
- 完了後の成功件数、スキップ件数、総件数、年月別件数の表示
- 処理終了時のEdgeと一時プロファイルの自動終了・削除

## 使用技術

- TypeScript
- Node.js
- Playwright
- Microsoft Edge
- Chrome DevTools Protocol（CDP）
- Vitest

## セットアップ

### 必要な環境

- Windows
- Node.js / npm
- Microsoft Edge

### インストール

```powershell
git clone <repository-url>
cd jr-kyusyu-receipt-dl
npm.cmd install
Copy-Item config.example.json config.json
```

作成した `config.json` を、自分の利用内容に合わせて編集してください。

## 設定ファイル

設定はプロジェクトルートの `config.json` から読み込みます。  
`config.json` が存在しない場合はプログラム内の初期値が使われますが、正しいファイル名を生成するため、`config.example.json` をコピーして設定することを推奨します。

```json
{
  "startUrl": "https://train.yoyaku.jrkyushu.co.jp/jr/login",
  "downloadDirectory": "./downloads",
  "receipt": {
    "name": "山田 太郎",
    "expenseItem": "通勤費",
    "outboundRoute": {
      "from": "出発駅",
      "to": "到着駅",
      "number": 1
    },
    "returnRoute": {
      "from": "到着駅",
      "to": "出発駅",
      "number": 2
    }
  },
  "receiptLinkPatterns": [
    "領収書",
    "領収書を表示",
    "領収書表示"
  ],
  "detailButtonPatterns": [
    "詳細"
  ],
  "printButtonPatterns": [
    "印刷"
  ],
  "maxReceipts": 100,
  "startupTimeoutMs": 30000
}
```

### 主な設定項目

| 項目 | 説明 |
| --- | --- |
| `startUrl` | Edge起動時に開くURL |
| `downloadDirectory` | PDFの保存先。相対パスはプロジェクトルート基準 |
| `receipt.name` | 出力ファイル名に使用する氏名 |
| `receipt.expenseItem` | 出力ファイル名に使用する費目 |
| `receipt.outboundRoute` | 往路の出発駅、到着駅、区分番号 |
| `receipt.returnRoute` | 復路の出発駅、到着駅、区分番号 |
| `receiptLinkPatterns` | 領収書ボタン・リンクの検索文字列 |
| `detailButtonPatterns` | 予約詳細ボタンの検索文字列 |
| `printButtonPatterns` | 領収書画面の印刷ボタンの検索文字列 |
| `maxReceipts` | 1回の実行で処理する領収書の最大件数 |
| `startupTimeoutMs` | Edgeの起動待ちタイムアウト時間（ミリ秒） |
| `edgeExecutablePath` | Edgeを自動検出できない場合に指定する実行ファイルの絶対パス（任意） |

設定した駅名の末尾にある `駅` は、区間判定時に無視されます。

`config.json` には氏名などの個人情報が含まれるため、Gitの管理対象外になっています。

## 使い方

### ダウンロードを実行する

```powershell
npm.cmd run download
```

実行後、対象月を入力します。

| 入力例 | 対象 |
| --- | --- |
| `5` / `05` | 画面上に表示されている5月の利用済み予約 |
| `2026-05` | 画面上に表示されている2026年5月の利用済み予約 |
| `00` / `all` / `ALL` | 画面上に表示されているすべての利用済み予約 |

対象月を入力すると、一時プロファイルを使用したMicrosoft Edgeが開きます。

1. Edge上でJR九州Web会員サービスへ手動でログインします。
2. 「予約確認・QR表示・変更・払いもどし」の予約一覧画面を表示します。
3. ターミナルに戻り、Enterキーを押します。
4. 指定月に一致し、予約状態が `利用済み` の予約だけが処理され、領収書が `downloadDirectory` に保存されます。
5. 処理完了後、成功件数、スキップ件数、総件数、年月別件数が表示され、Edgeとプロセスが終了します。

### 保存予定を確認する

PDFを保存せず、対象予約と保存予定ファイル名を確認できます。

```powershell
npm.cmd run download -- --dry-run
```

### 型チェック

```powershell
npm.cmd run check
```

### ユニットテスト

実際のJR九州サイトやEdgeには接続せず、ファイル名生成、対象月指定、予約状態判定、区間判定、設定読み込みなどの純粋なロジックを検証します。

```powershell
npm.cmd run test
```

### GitHub Actions

`main` または `feature` ブランチへのpushと、各ブランチ向けのPull Request作成時に、GitHub Actionsで型チェックとユニットテストを自動実行します。  
GitHubのリポジトリ画面にある「Actions」タブから、手動実行することもできます。

## 出力ファイル名の仕様

PDFは次の形式で保存されます。

```text
YYYYMMDD_区分番号氏名_費目 領収書_JR出発駅⇒到着駅.pdf
```

例:

```text
20260511_1山田 太郎_通勤費 領収書_JR出発駅⇒到着駅.pdf
20260511_2山田 太郎_通勤費 領収書_JR到着駅⇒出発駅.pdf
```

- `YYYYMMDD`: 予約一覧の出発日
- `区分番号`: `outboundRoute` または `returnRoute` に設定した番号
- `氏名`: `receipt.name`
- `費目`: `receipt.expenseItem`
- `出発駅⇒到着駅`: 予約一覧から取得した区間

区間が設定済みの往路・復路のどちらにも一致しない場合は警告を表示し、区分番号 `9` を付けて保存します。  
Windowsでファイル名に使用できない文字は、保存時に `_` へ置き換えます。

## 注意事項

- ログイン、パスワード入力、追加認証は自動化していません。
- ログイン情報やセッション情報をプロジェクト内へ保存しません。
- Edgeは実行ごとに一時プロファイルで起動し、処理終了時に削除されます。
- 自動化中に開いたEdgeを手動で閉じると、処理は継続できません。
- 予約一覧画面に表示されていない予約は処理対象になりません。
- `払戻済み` など、予約状態が `利用済み` ではない行は詳細画面を開かず、処理対象外にします。
- JR九州Webサイトの画面構成や文言が変更された場合、設定またはソースコードの修正が必要になることがあります。
- 同名のPDFが既に保存されている場合は上書きせず、スキップします。
- `config.json` と `downloads/` はGitの管理対象外です。
