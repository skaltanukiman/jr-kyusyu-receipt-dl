import type { ChildProcess } from "node:child_process";
import type { Browser, Page } from "playwright";

export type BrowserSession = {
  browser: Browser;
  downloadsDirectory: string;
  edgeProcess: ChildProcess;
  page: Page;
  profileDirectory: string;
};
