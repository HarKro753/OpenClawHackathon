import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { chromium, type Browser, type Page } from "playwright-core";

type BraveState = {
  proc: ReturnType<typeof Bun.spawn> | null;
  port: number;
  cdpUrl: string;
  userDataDir: string;
};

const BRAVE_DEFAULT_PATH =
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BRAVE_CDP_PORT = Number(process.env.BRAVE_CDP_PORT || "9222");
const USER_DATA_DIR = join(import.meta.dir, ".brave-profile");

const braveState: BraveState = {
  proc: null,
  port: BRAVE_CDP_PORT,
  cdpUrl: `http://127.0.0.1:${BRAVE_CDP_PORT}`,
  userDataDir: USER_DATA_DIR,
};

function resolveBraveExecutable(): string {
  const override = process.env.BRAVE_BROWSER_PATH?.trim();
  if (override && existsSync(override)) return override;
  if (existsSync(BRAVE_DEFAULT_PATH)) return BRAVE_DEFAULT_PATH;
  throw new Error(
    "Brave Browser not found. Install Brave or set BRAVE_BROWSER_PATH.",
  );
}

async function isCdpReachable(cdpUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`${cdpUrl}/json/version`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function isProcessAlive(proc: BraveState["proc"]) {
  return Boolean(proc && proc.exitCode === null);
}

async function ensureBraveRunning(): Promise<void> {
  if (await isCdpReachable(braveState.cdpUrl)) return;

  if (isProcessAlive(braveState.proc)) {
    const readyDeadline = Date.now() + 8000;
    while (Date.now() < readyDeadline) {
      if (await isCdpReachable(braveState.cdpUrl)) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const exePath = resolveBraveExecutable();
  mkdirSync(braveState.userDataDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${braveState.port}`,
    `--user-data-dir=${braveState.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    "--password-store=basic",
    "about:blank",
  ];

  braveState.proc = Bun.spawn([exePath, ...args], {
    stdout: "ignore",
    stderr: "ignore",
  });

  const readyDeadline = Date.now() + 15000;
  while (Date.now() < readyDeadline) {
    if (await isCdpReachable(braveState.cdpUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error("Failed to start Brave with CDP enabled.");
}

let cachedBrowser: Browser | null = null;
let connecting: Promise<Browser> | null = null;

async function connectBrowser(): Promise<Browser> {
  if (cachedBrowser) return cachedBrowser;
  if (connecting) return connecting;

  connecting = (async () => {
    await ensureBraveRunning();
    const browser = await chromium.connectOverCDP(braveState.cdpUrl);
    browser.on("disconnected", () => {
      if (cachedBrowser === browser) cachedBrowser = null;
    });
    cachedBrowser = browser;
    return browser;
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

async function getActivePage(): Promise<Page> {
  const browser = await connectBrowser();
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const pages = context.pages();
  if (pages.length > 0) return pages[0];
  return await context.newPage();
}

function truncate(value: string, max = 12000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... (truncated ${value.length - max} chars)`;
}

export async function isBraveReachable(): Promise<boolean> {
  return isCdpReachable(braveState.cdpUrl);
}

export async function browserNavigate(targetUrl: string) {
  const page = await getActivePage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  return {
    url: page.url(),
    title: await page.title().catch(() => ""),
  };
}

export async function browserSnapshot() {
  const page = await getActivePage();
  const title = await page.title().catch(() => "");
  const url = page.url();
  const html = await page.content().catch(() => "");
  const text = await page.innerText("body").catch(() => "");

  return {
    url,
    title,
    html: truncate(html),
    text: truncate(text),
  };
}

export async function browserAct(params: {
  kind: "click" | "type" | "wait";
  selector?: string;
  text?: string;
  input?: string;
  timeMs?: number;
  submit?: boolean;
}) {
  const page = await getActivePage();
  const selector = params.selector?.trim();
  const text = params.text?.trim();

  if (params.kind === "wait") {
    if (params.timeMs) {
      await page.waitForTimeout(params.timeMs);
      return { ok: true };
    }
    if (selector) {
      await page.waitForSelector(selector, { timeout: 15000 });
      return { ok: true };
    }
    if (text) {
      await page.getByText(text).first().waitFor({ timeout: 15000 });
      return { ok: true };
    }
    throw new Error("wait requires timeMs, selector, or text");
  }

  if (params.kind === "click") {
    if (selector) {
      await page.locator(selector).first().click();
      return { ok: true };
    }
    if (text) {
      await page.getByText(text).first().click();
      return { ok: true };
    }
    throw new Error("click requires selector or text");
  }

  if (params.kind === "type") {
    if (!selector) {
      throw new Error("type requires selector");
    }
    if (typeof params.input !== "string") {
      throw new Error("type requires input text");
    }
    await page.locator(selector).first().fill(params.input);
    if (params.submit) {
      await page.keyboard.press("Enter");
    }
    return { ok: true };
  }

  throw new Error(`Unsupported act kind: ${params.kind}`);
}
