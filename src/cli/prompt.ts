// ターミナルから1行入力を受け取る共通処理。
// 対象月入力とEnter待ちの両方で使う。
export async function readLine(): Promise<string> {
  process.stdin.resume();
  const value = await new Promise<Buffer>((resolve) => process.stdin.once("data", (data: Buffer) => resolve(data)));
  process.stdin.pause();
  return value.toString("utf8").trim();
}

// ユーザーがブラウザ側の準備を終えるまで待つ。
export async function waitForEnter(): Promise<void> {
  await readLine();
}
