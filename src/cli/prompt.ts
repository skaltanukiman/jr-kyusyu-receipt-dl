export async function readLine(): Promise<string> {
  process.stdin.resume();
  const value = await new Promise<Buffer>((resolve) => process.stdin.once("data", (data: Buffer) => resolve(data)));
  process.stdin.pause();
  return value.toString("utf8").trim();
}

export async function waitForEnter(): Promise<void> {
  await readLine();
}
