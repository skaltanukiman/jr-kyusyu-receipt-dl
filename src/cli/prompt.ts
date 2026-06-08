export async function waitForEnter(): Promise<void> {
  process.stdin.resume();
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  process.stdin.pause();
}
