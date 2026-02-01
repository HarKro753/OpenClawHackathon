import { getNotionApiKey } from "./index.js";

// ============================================================================
// Types
// ============================================================================

export interface NotionPage {
  id: string;
  object: "page";
  url: string;
  created_time: string;
  last_edited_time: string;
  parent: {
    type: string;
    database_id?: string;
    page_id?: string;
    workspace?: boolean;
  };
  properties: Record<string, NotionPropertyValue>;
  icon?: { type: string; emoji?: string };
  cover?: { type: string; external?: { url: string } };
}

export interface NotionBlock {
  id: string;
  object: "block";
  type: string;
  created_time: string;
  last_edited_time: string;
  has_children: boolean;
  [key: string]: unknown;
}

export interface NotionDataSource {
  id: string;
  object: "database" | "data_source";
  title: Array<{ plain_text: string }>;
  description?: Array<{ plain_text: string }>;
  properties: Record<string, NotionPropertySchema>;
  url: string;
  created_time: string;
  last_edited_time: string;
  parent: {
    type: string;
    page_id?: string;
    workspace?: boolean;
  };
}

export interface NotionSearchResult {
  object: "list";
  results: Array<NotionPage | NotionDataSource>;
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionPropertyValue {
  id: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionPropertySchema {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown;
}

export interface NotionBlockInput {
  object?: "block";
  type: string;
  [key: string]: unknown;
}

export interface NotionFilter {
  property?: string;
  [key: string]: unknown;
}

export interface NotionSort {
  property?: string;
  timestamp?: string;
  direction: "ascending" | "descending";
}

// ============================================================================
// API Helper
// ============================================================================

const NOTION_VERSION = "2022-06-28";
const NOTION_BASE_URL = "https://api.notion.com/v1";

async function notionFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const apiKey = getNotionApiKey();
  if (!apiKey) {
    throw new Error(
      "Notion not connected. Please connect Notion in the integrations page.",
    );
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${NOTION_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Notion API error (${response.status}): ${errorText}`);
  }

  return response;
}

// ============================================================================
// Search API
// ============================================================================

export async function notionSearch(
  query?: string,
  filter?: { property: "object"; value: "page" | "database" },
  pageSize: number = 20,
): Promise<NotionSearchResult> {
  const body: Record<string, unknown> = {
    page_size: Math.min(pageSize, 100),
  };

  if (query) {
    body.query = query;
  }

  if (filter) {
    body.filter = filter;
  }

  const response = await notionFetch("/search", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (await response.json()) as NotionSearchResult;
}

// ============================================================================
// Page API
// ============================================================================

export async function notionGetPage(pageId: string): Promise<NotionPage> {
  const response = await notionFetch(`/pages/${pageId}`);
  return (await response.json()) as NotionPage;
}

export async function notionCreatePage(
  parent: { database_id: string } | { page_id: string },
  properties: Record<string, unknown>,
  children?: NotionBlockInput[],
  icon?: { emoji: string } | { external: { url: string } },
  cover?: { external: { url: string } },
): Promise<NotionPage> {
  const body: Record<string, unknown> = {
    parent,
    properties,
  };

  if (children && children.length > 0) {
    body.children = children;
  }

  if (icon) {
    body.icon = icon;
  }

  if (cover) {
    body.cover = cover;
  }

  const response = await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (await response.json()) as NotionPage;
}

export async function notionUpdatePage(
  pageId: string,
  properties?: Record<string, unknown>,
  archived?: boolean,
  icon?: { emoji: string } | { external: { url: string } } | null,
  cover?: { external: { url: string } } | null,
): Promise<NotionPage> {
  const body: Record<string, unknown> = {};

  if (properties) {
    body.properties = properties;
  }

  if (archived !== undefined) {
    body.archived = archived;
  }

  if (icon !== undefined) {
    body.icon = icon;
  }

  if (cover !== undefined) {
    body.cover = cover;
  }

  const response = await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

  return (await response.json()) as NotionPage;
}

// ============================================================================
// Block API
// ============================================================================

export async function notionGetBlocks(
  blockId: string,
  pageSize: number = 100,
): Promise<{ results: NotionBlock[]; has_more: boolean; next_cursor: string | null }> {
  const response = await notionFetch(
    `/blocks/${blockId}/children?page_size=${Math.min(pageSize, 100)}`,
  );

  return (await response.json()) as {
    results: NotionBlock[];
    has_more: boolean;
    next_cursor: string | null;
  };
}

export async function notionAddBlocks(
  blockId: string,
  children: NotionBlockInput[],
): Promise<{ results: NotionBlock[] }> {
  const response = await notionFetch(`/blocks/${blockId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children }),
  });

  return (await response.json()) as { results: NotionBlock[] };
}

export async function notionDeleteBlock(blockId: string): Promise<NotionBlock> {
  const response = await notionFetch(`/blocks/${blockId}`, {
    method: "DELETE",
  });

  return (await response.json()) as NotionBlock;
}

// ============================================================================
// Database/Data Source API
// ============================================================================

export async function notionGetDatabase(
  databaseId: string,
): Promise<NotionDataSource> {
  const response = await notionFetch(`/databases/${databaseId}`);
  return (await response.json()) as NotionDataSource;
}

export async function notionQueryDatabase(
  databaseId: string,
  filter?: NotionFilter,
  sorts?: NotionSort[],
  pageSize: number = 100,
): Promise<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }> {
  const body: Record<string, unknown> = {
    page_size: Math.min(pageSize, 100),
  };

  if (filter) {
    body.filter = filter;
  }

  if (sorts && sorts.length > 0) {
    body.sorts = sorts;
  }

  const response = await notionFetch(`/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (await response.json()) as {
    results: NotionPage[];
    has_more: boolean;
    next_cursor: string | null;
  };
}

export async function notionCreateDatabase(
  parent: { page_id: string },
  title: string,
  properties: Record<string, unknown>,
  isInline: boolean = false,
): Promise<NotionDataSource> {
  const body: Record<string, unknown> = {
    parent,
    title: [{ text: { content: title } }],
    properties,
    is_inline: isInline,
  };

  const response = await notionFetch("/databases", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return (await response.json()) as NotionDataSource;
}

// ============================================================================
// Helper: Extract plain text from rich text array
// ============================================================================

export function extractPlainText(
  richText: Array<{ plain_text?: string }> | undefined,
): string {
  if (!richText) return "";
  return richText.map((t) => t.plain_text || "").join("");
}

// ============================================================================
// Helper: Format property value for display
// ============================================================================

export function formatPropertyValue(prop: NotionPropertyValue): string {
  switch (prop.type) {
    case "title":
      return extractPlainText(prop.title as Array<{ plain_text?: string }>);
    case "rich_text":
      return extractPlainText(prop.rich_text as Array<{ plain_text?: string }>);
    case "number":
      return prop.number != null ? String(prop.number) : "";
    case "select":
      return (prop.select as { name?: string })?.name || "";
    case "multi_select":
      return (prop.multi_select as Array<{ name: string }>)
        ?.map((s) => s.name)
        .join(", ") || "";
    case "date":
      const date = prop.date as { start?: string; end?: string } | null;
      if (!date) return "";
      return date.end ? `${date.start} - ${date.end}` : date.start || "";
    case "checkbox":
      return prop.checkbox ? "Yes" : "No";
    case "url":
      return (prop.url as string) || "";
    case "email":
      return (prop.email as string) || "";
    case "phone_number":
      return (prop.phone_number as string) || "";
    case "status":
      return (prop.status as { name?: string })?.name || "";
    case "people":
      return (prop.people as Array<{ name?: string }>)
        ?.map((p) => p.name)
        .join(", ") || "";
    case "relation":
      return (prop.relation as Array<{ id: string }>)
        ?.map((r) => r.id)
        .join(", ") || "";
    case "formula":
      const formula = prop.formula as { type: string; [key: string]: unknown };
      if (formula.type === "string") return formula.string as string || "";
      if (formula.type === "number") return String(formula.number ?? "");
      if (formula.type === "boolean") return formula.boolean ? "Yes" : "No";
      if (formula.type === "date") {
        const fDate = formula.date as { start?: string } | null;
        return fDate?.start || "";
      }
      return "";
    case "created_time":
      return (prop.created_time as string) || "";
    case "last_edited_time":
      return (prop.last_edited_time as string) || "";
    default:
      return JSON.stringify(prop[prop.type]);
  }
}

// ============================================================================
// Helper: Format block content for display
// ============================================================================

export function formatBlockContent(block: NotionBlock): string {
  const type = block.type;
  const content = block[type] as Record<string, unknown> | undefined;

  if (!content) return `[${type}]`;

  switch (type) {
    case "paragraph":
    case "heading_1":
    case "heading_2":
    case "heading_3":
    case "bulleted_list_item":
    case "numbered_list_item":
    case "toggle":
    case "quote":
    case "callout":
      return extractPlainText(content.rich_text as Array<{ plain_text?: string }>);
    case "to_do":
      const checked = content.checked ? "[x]" : "[ ]";
      return `${checked} ${extractPlainText(content.rich_text as Array<{ plain_text?: string }>)}`;
    case "code":
      const lang = content.language || "text";
      return `\`\`\`${lang}\n${extractPlainText(content.rich_text as Array<{ plain_text?: string }>)}\n\`\`\``;
    case "image":
    case "video":
    case "file":
    case "pdf":
      const fileContent = content as { type: string; external?: { url: string }; file?: { url: string } };
      const url = fileContent.type === "external"
        ? fileContent.external?.url
        : fileContent.file?.url;
      return `[${type}: ${url || "no url"}]`;
    case "bookmark":
      return `[bookmark: ${(content as { url?: string }).url || "no url"}]`;
    case "link_preview":
      return `[link: ${(content as { url?: string }).url || "no url"}]`;
    case "divider":
      return "---";
    case "table_of_contents":
      return "[Table of Contents]";
    case "breadcrumb":
      return "[Breadcrumb]";
    case "equation":
      return `$${(content as { expression?: string }).expression || ""}$`;
    default:
      return `[${type}]`;
  }
}
