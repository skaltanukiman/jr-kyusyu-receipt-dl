import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

// クリック前に一時ダウンロードフォルダの状態を覚えておく。
// クリック後に増えたファイルだけを検出するために使う。
export async function downloadableFileSet(downloadsDirectory: string): Promise<Set<string>> {
  await mkdir(downloadsDirectory, { recursive: true });
  return new Set(await readdir(downloadsDirectory));
}

// Edgeが一時フォルダへ保存したファイルを待つ。
// ダウンロード中の拡張子を除外し、サイズが安定してから完了扱いにする。
export async function waitForDownloadedFile(
  downloadsDirectory: string,
  beforeFiles: Set<string>,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const files = await readdir(downloadsDirectory).catch(() => []);
    for (const file of files) {
      if (beforeFiles.has(file) || isTemporaryDownload(file)) {
        continue;
      }

      const filePath = path.join(downloadsDirectory, file);
      if (await isStableFile(filePath)) {
        return filePath;
      }
    }
    await delay(300);
  }

  throw new Error("ダウンロードファイルを検出できませんでした。");
}

// Chromium/Edgeがダウンロード中に使う一時ファイル名を除外する。
function isTemporaryDownload(fileName: string): boolean {
  return fileName.endsWith(".crdownload") || fileName.endsWith(".tmp") || fileName.endsWith(".download");
}

// ファイルサイズが短時間で変わらなければ、書き込み完了済みとみなす。
async function isStableFile(filePath: string): Promise<boolean> {
  const first = await stat(filePath).catch(() => null);
  if (!first || !first.isFile()) {
    return false;
  }

  await delay(500);
  const second = await stat(filePath).catch(() => null);
  return Boolean(second?.isFile() && second.size === first.size && second.size > 0);
}

// 一時ダウンロードフォルダから、ユーザー指定の保存先へ移動する。
export async function moveDownloadedFile(sourcePath: string, targetPath: string): Promise<void> {
  await rm(targetPath, { force: true });
  await rename(sourcePath, targetPath);
}
