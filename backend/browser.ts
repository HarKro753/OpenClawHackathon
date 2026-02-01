import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import {
  chromium,
  type Browser,
  type Page,
  type BrowserContext,
} from "playwright-core";
import { getLinkedInCookies } from "./integrations.js";

type BrowserState = {
  browser: Browser | null;
  context: BrowserContext | null;
  userDataDir: string;
};

const BRAVE_DEFAULT_PATH =
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const USER_DATA_DIR = join(import.meta.dir, ".brave-profile");

const browserState: BrowserState = {
  browser: null,
  context: null,
  userDataDir: USER_DATA_DIR,
};

function resolveBraveExecutable(): string {
  if (existsSync(BRAVE_DEFAULT_PATH)) return BRAVE_DEFAULT_PATH;
  throw new Error("Brave Browser not found. Install Brave.");
}

let browserLaunching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserState.browser && browserState.browser.isConnected()) {
    console.log("[Browser] Using existing browser instance");
    return browserState.browser;
  }

  if (browserLaunching) {
    console.log("[Browser] Waiting for browser to finish launching");
    return browserLaunching;
  }

  browserLaunching = (async () => {
    console.log("[Browser] Launching Brave browser...");

    const executablePath = resolveBraveExecutable();
    mkdirSync(browserState.userDataDir, { recursive: true });

    const browser = await chromium.launch({
      executablePath,
      headless: false,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-component-update",
      ],
    });

    console.log("[Browser] Browser launched successfully");

    browser.on("disconnected", () => {
      console.log("[Browser] Browser disconnected");
      browserState.browser = null;
      browserState.context = null;
    });

    browserState.browser = browser;
    return browser;
  })().finally(() => {
    browserLaunching = null;
  });

  return browserLaunching;
}

async function getBrowserContext(): Promise<BrowserContext> {
  if (browserState.context) {
    console.log("[Browser] Using existing browser context");
    return browserState.context;
  }

  const browser = await getBrowser();
  console.log("[Browser] Creating new incognito browser context...");

  // Create an incognito context for anonymous browsing
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  // Inject LinkedIn cookies if available from integrations
  const { liAt, jsessionId } = getLinkedInCookies();

  if (liAt && jsessionId) {
    console.log("[Browser] Injecting LinkedIn cookies for auto-login...");
    await context.addCookies([
      {
        name: "li_at",
        value: liAt,
        domain: ".linkedin.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
      {
        name: "JSESSIONID",
        value: jsessionId,
        domain: ".linkedin.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ]);
    console.log("[Browser] LinkedIn cookies injected successfully");
  } else {
    console.log("[Browser] No LinkedIn cookies found in integrations");
  }

  console.log("[Browser] Context created");
  browserState.context = context;
  return context;
}

async function getActivePage(): Promise<Page> {
  console.log("[Browser] Getting active page...");
  const context = await getBrowserContext();

  const pages = context.pages();
  console.log(`[Browser] Found ${pages.length} page(s) in context`);

  if (pages.length > 0) {
    console.log(`[Browser] Using existing page at: ${pages[0].url()}`);
    return pages[0];
  }

  console.log("[Browser] Creating new page...");
  const newPage = await context.newPage();
  console.log("[Browser] New page created");
  return newPage;
}

function truncate(value: string, max = 12000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... (truncated ${value.length - max} chars)`;
}

export async function isBraveReachable(): Promise<boolean> {
  try {
    const browser = await getBrowser();
    return browser.isConnected();
  } catch {
    return false;
  }
}

export async function browserNavigate(targetUrl: string) {
  console.log(`[Browser] Navigating to: ${targetUrl}`);
  try {
    const page = await getActivePage();
    console.log(`[Browser] Current URL before navigation: ${page.url()}`);

    const response = await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const finalUrl = page.url();
    const title = await page.title().catch(() => "");

    console.log(
      `[Browser] Navigation complete. Final URL: ${finalUrl}, Title: ${title}`,
    );

    if (!response) {
      throw new Error("Navigation failed - no response received");
    }

    if (!response.ok()) {
      console.warn(
        `[Browser] Navigation returned status: ${response.status()}`,
      );
    }

    return {
      url: finalUrl,
      title,
      status: response.status(),
    };
  } catch (error) {
    console.error(`[Browser] Navigation error:`, error);
    throw error;
  }
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

export async function browserScroll(params: {
  direction: "up" | "down" | "left" | "right";
  amount?: number;
  selector?: string;
}) {
  const page = await getActivePage();
  const selector = params.selector?.trim();
  const amount = params.amount ?? 500;

  // Calculate scroll deltas based on direction
  let deltaX = 0;
  let deltaY = 0;

  switch (params.direction) {
    case "up":
      deltaY = -amount;
      break;
    case "down":
      deltaY = amount;
      break;
    case "left":
      deltaX = -amount;
      break;
    case "right":
      deltaX = amount;
      break;
  }

  if (selector) {
    // Scroll within a specific element
    await page
      .locator(selector)
      .first()
      .evaluate(
        (el, { dx, dy }) => {
          el.scrollBy(dx, dy);
        },
        { dx: deltaX, dy: deltaY },
      );
  } else {
    // Scroll the page using mouse wheel
    await page.mouse.wheel(deltaX, deltaY);
  }

  return {
    ok: true,
    scrolled: { deltaX, deltaY },
    direction: params.direction,
  };
}

export async function browserAct(params: {
  kind: "click" | "type" | "wait" | "scroll";
  selector?: string;
  text?: string;
  input?: string;
  timeMs?: number;
  submit?: boolean;
  direction?: "up" | "down" | "left" | "right";
  amount?: number;
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

  if (params.kind === "scroll") {
    const direction = params.direction ?? "down";
    return browserScroll({
      direction,
      amount: params.amount,
      selector,
    });
  }

  throw new Error(`Unsupported act kind: ${params.kind}`);
}
