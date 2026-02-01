import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

interface IntegrationsStore {
  notionApiKey?: string;
  linkedinLiAt?: string;
  linkedinJsessionId?: string;
  telegramBotToken?: string;
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  scopes?: string[];
  email?: string;
  created_at: number;
}

// ============================================================================
// In-Memory Store (replaces process.env usage)
// ============================================================================

let integrationsCache: IntegrationsStore = {};
let googleTokensCache: GoogleTokens | null = null;

// ============================================================================
// File Paths
// ============================================================================

const integrationsPath = join(import.meta.dir, ".integrations.json");
const googleTokensPath = join(import.meta.dir, ".google-tokens.json");

// ============================================================================
// File I/O Helpers
// ============================================================================

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

// ============================================================================
// Initialization
// ============================================================================

export function loadIntegrationsFromDisk(): void {
  const store = readJsonFile<IntegrationsStore>(integrationsPath);
  if (store) {
    integrationsCache = store;
  }

  const googleTokens = readJsonFile<GoogleTokens>(googleTokensPath);
  if (googleTokens?.access_token) {
    googleTokensCache = googleTokens;
  }
}

// ============================================================================
// Notion Integration
// ============================================================================

export function setNotionApiKey(apiKey: string) {
  integrationsCache.notionApiKey = apiKey;
  writeJsonFile(integrationsPath, integrationsCache);
}

export function getNotionApiKey(): string | undefined {
  return integrationsCache.notionApiKey;
}

// ============================================================================
// LinkedIn Integration
// ============================================================================

export function setLinkedInCookies(params: {
  liAt: string;
  jsessionId: string;
}) {
  integrationsCache.linkedinLiAt = params.liAt;
  integrationsCache.linkedinJsessionId = params.jsessionId;
  writeJsonFile(integrationsPath, integrationsCache);
}

export function getLinkedInCookies(): {
  liAt?: string;
  jsessionId?: string;
} {
  return {
    liAt: integrationsCache.linkedinLiAt,
    jsessionId: integrationsCache.linkedinJsessionId,
  };
}

// ============================================================================
// Google Integration
// ============================================================================

export function setGoogleTokens(tokens: GoogleTokens) {
  googleTokensCache = tokens;
  writeJsonFile(googleTokensPath, tokens);
}

export function getGoogleTokens(): GoogleTokens | null {
  return googleTokensCache;
}

export function getGoogleTokensPath(): string {
  return googleTokensPath;
}

// ============================================================================
// Telegram Integration
// ============================================================================

export function setTelegramBotToken(token: string) {
  integrationsCache.telegramBotToken = token;
  writeJsonFile(integrationsPath, integrationsCache);
}

export function getTelegramBotToken(): string | undefined {
  return integrationsCache.telegramBotToken;
}

// ============================================================================
// Status
// ============================================================================

export function getIntegrationStatus() {
  const linkedin = getLinkedInCookies();
  const googleTokens = getGoogleTokens();
  return {
    notion: { connected: Boolean(getNotionApiKey()) },
    google: {
      connected: Boolean(
        googleTokens?.refresh_token || googleTokens?.access_token,
      ),
      email: googleTokens?.email,
    },
    linkedin: {
      connected: Boolean(linkedin.liAt && linkedin.jsessionId),
    },
    telegram: {
      connected: Boolean(getTelegramBotToken()),
    },
  };
}
