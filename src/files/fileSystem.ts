import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function downloadableFileSet(downloadsDirectory: string): Promise<Set<string>> {
  await mkdir(downloadsDirectory, { recursive: true });
  return new Set(await readdir(downloadsDirectory));
}

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

function isTemporaryDownload(fileName: string): boolean {
  return fileName.endsWith(".crdownload") || fileName.endsWith(".tmp") || fileName.endsWith(".download");
}

async function isStableFile(filePath: string): Promise<boolean> {
  const first = await stat(filePath).catch(() => null);
  if (!first || !first.isFile()) {
    return false;
  }

  await delay(500);
  const second = await stat(filePath).catch(() => null);
  return Boolean(second?.isFile() && second.size === first.size && second.size > 0);
}

export async function moveDownloadedFile(sourcePath: string, targetPath: string): Promise<void> {
  await rm(targetPath, { force: true });
  await rename(sourcePath, targetPath);
}
