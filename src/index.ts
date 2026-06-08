import process from "node:process";
import { main } from "./app.js";

// CLI実行時のエントリポイント。
// main側で後始末まで終えてから、Nodeプロセスを明示的に終了する。
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
