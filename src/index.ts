import process from "node:process";
import { main } from "./app.js";

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
