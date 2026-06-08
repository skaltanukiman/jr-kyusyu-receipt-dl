export type RunArgs = {
  dryRun: boolean;
};

// コマンドライン引数を実行オプションへ変換する。
// --setup は認証情報を保存しない方針にしたため、明示的に使えないようにしている。
export function parseArgs(argv = process.argv): RunArgs {
  if (argv.includes("--setup")) {
    throw new Error("--setup は廃止しました。安全寄り運用では毎回手動ログインします。");
  }

  return {
    dryRun: argv.includes("--dry-run"),
  };
}
