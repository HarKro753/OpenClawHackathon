import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

interface IntegrationsStore {
  notionApiKey?: string;
  linkedinLiAt?: string;
  linkedinJsessionId?: string;
  telegramBotToken?: string;
}

interface GogTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  scopes?: string[];
  email?: string;
  created_at: number;
}

const integrationsPath = join(import.meta.dir, ".integrations.json");
const gogTokensPath = join(import.meta.dir, ".gog-tokens.json");

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function writeJsonFile<T>(filePath: string, data: T) {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function loadIntegrationsFromDisk(): void {
  const store = readJsonFile<IntegrationsStore>(integrationsPath);
  if (store?.notionApiKey) {
    process.env.NOTION_API_KEY = store.notionApiKey;
  }
  if (store?.linkedinLiAt) {
    process.env.LINKEDIN_LI_AT = store.linkedinLiAt;
  }
  if (store?.linkedinJsessionId) {
    process.env.LINKEDIN_JSESSIONID = store.linkedinJsessionId;
  }
  if (store?.telegramBotToken) {
    process.env.TELEGRAM_BOT_TOKEN = store.telegramBotToken;
  }

  const gogTokens = readJsonFile<GogTokens>(gogTokensPath);
  if (gogTokens?.access_token) {
    setGogEnv(gogTokens);
  }
}

export function setNotionApiKey(apiKey: string) {
  const store = readJsonFile<IntegrationsStore>(integrationsPath) || {};
  store.notionApiKey = apiKey;
  writeJsonFile(integrationsPath, store);
  process.env.NOTION_API_KEY = apiKey;
}

export function getNotionApiKey(): string | undefined {
  return process.env.NOTION_API_KEY;
}

export function setLinkedInCookies(params: {
  liAt: string;
  jsessionId: string;
}) {
  const store = readJsonFile<IntegrationsStore>(integrationsPath) || {};
  store.linkedinLiAt = params.liAt;
  store.linkedinJsessionId = params.jsessionId;
  writeJsonFile(integrationsPath, store);
  process.env.LINKEDIN_LI_AT = params.liAt;
  process.env.LINKEDIN_JSESSIONID = params.jsessionId;
}

export function getLinkedInCookies(): {
  liAt?: string;
  jsessionId?: string;
} {
  return {
    liAt: process.env.LINKEDIN_LI_AT,
    jsessionId: process.env.LINKEDIN_JSESSIONID,
  };
}

export function setGogTokens(tokens: GogTokens) {
  writeJsonFile(gogTokensPath, tokens);
  setGogEnv(tokens);
}

export function getGogTokens(): GogTokens | null {
  return readJsonFile<GogTokens>(gogTokensPath);
}

export function getIntegrationStatus() {
  const linkedin = getLinkedInCookies();
  return {
    notion: { connected: Boolean(getNotionApiKey()) },
    gog: {
      connected: Boolean(
        getGogTokens()?.refresh_token || getGogTokens()?.access_token,
      ),
    },
    linkedin: {
      connected: Boolean(linkedin.liAt && linkedin.jsessionId),
    },
    telegram: {
      connected: Boolean(getTelegramBotToken()),
    },
  };
}

export function getGogTokensPath(): string {
  return gogTokensPath;
}

export function setTelegramBotToken(token: string) {
  const store = readJsonFile<IntegrationsStore>(integrationsPath) || {};
  store.telegramBotToken = token;
  writeJsonFile(integrationsPath, store);
  process.env.TELEGRAM_BOT_TOKEN = token;
}

export function getTelegramBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function setGogEnv(tokens: GogTokens) {
  process.env.GOG_ACCESS_TOKEN = tokens.access_token;
  if (tokens.refresh_token) {
    process.env.GOG_REFRESH_TOKEN = tokens.refresh_token;
  }
  if (tokens.expires_in) {
    process.env.GOG_TOKEN_EXPIRES_AT = String(
      tokens.created_at + tokens.expires_in * 1000,
    );
  }
  if (tokens.token_type) {
    process.env.GOG_TOKEN_TYPE = tokens.token_type;
  }
  if (tokens.scope) {
    process.env.GOG_TOKEN_SCOPE = tokens.scope;
  }
  if (tokens.email) {
    process.env.GOG_ACCOUNT = tokens.email;
  }
}
