export type RunArgs = {
  dryRun: boolean;
};

export function parseArgs(argv = process.argv): RunArgs {
  if (argv.includes("--setup")) {
    throw new Error("--setup は廃止しました。安全寄り運用では毎回手動ログインします。");
  }

  return {
    dryRun: argv.includes("--dry-run"),
  };
}
