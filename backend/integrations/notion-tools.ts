import type OpenAI from "openai";
import type { ToolDefinition, ToolResult } from "../tools.js";
import {
  notionSearch,
  notionGetPage,
  notionCreatePage,
  notionUpdatePage,
  notionGetBlocks,
  notionAddBlocks,
  notionGetDatabase,
  notionQueryDatabase,
  notionCreateDatabase,
  extractPlainText,
  formatPropertyValue,
  formatBlockContent,
  type NotionPage,
  type NotionDataSource,
} from "./notion-api.js";

// ============================================================================
// Helper: Format page for display
// ============================================================================

function formatPageSummary(page: NotionPage, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : "";
  const title = getPageTitle(page);
  const parentInfo = page.parent.database_id
    ? `(in database)`
    : page.parent.page_id
      ? `(subpage)`
      : `(workspace)`;

  return `${prefix}[${page.id}] ${title} ${parentInfo}\n   URL: ${page.url}\n   Last edited: ${page.last_edited_time}`;
}

function getPageTitle(page: NotionPage): string {
  for (const prop of Object.values(page.properties)) {
    if (prop.type === "title") {
      return extractPlainText(prop.title as Array<{ plain_text?: string }>) || "(Untitled)";
    }
  }
  return "(Untitled)";
}

function formatDatabaseSummary(db: NotionDataSource, index?: number): string {
  const prefix = index !== undefined ? `${index + 1}. ` : "";
  const title = extractPlainText(db.title) || "(Untitled Database)";
  const propCount = Object.keys(db.properties).length;

  return `${prefix}[${db.id}] ${title}\n   Properties: ${propCount}\n   URL: ${db.url}`;
}

// ============================================================================
// Search Tool
// ============================================================================

export const notionSearchTool: ToolDefinition = {
  name: "notion_search",
  tool: {
    type: "function",
    function: {
      name: "notion_search",
      description:
        "Search for pages and databases in Notion. Returns matching pages and databases with their IDs, titles, and URLs.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query text. Leave empty to list recent items.",
          },
          filter: {
            type: "string",
            enum: ["page", "database"],
            description:
              "Filter results by type: 'page' for pages only, 'database' for databases only. Omit for both.",
          },
          maxResults: {
            type: "number",
            description: "Maximum results to return (default: 20, max: 100)",
          },
        },
        required: [],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const query = args.query as string | undefined;
      const filterType = args.filter as "page" | "database" | undefined;
      const maxResults = Math.min(Number(args.maxResults) || 20, 100);

      const filter = filterType
        ? { property: "object" as const, value: filterType }
        : undefined;

      const result = await notionSearch(query, filter, maxResults);

      if (result.results.length === 0) {
        return {
          success: true,
          output: "No results found.",
        };
      }

      const formatted = result.results
        .map((item, i) => {
          if (item.object === "page") {
            return formatPageSummary(item as NotionPage, i);
          } else {
            return formatDatabaseSummary(item as NotionDataSource, i);
          }
        })
        .join("\n\n");

      return {
        success: true,
        output: `Found ${result.results.length} result(s)${result.has_more ? " (more available)" : ""}:\n\n${formatted}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Get Page Tool
// ============================================================================

export const notionGetPageTool: ToolDefinition = {
  name: "notion_get_page",
  tool: {
    type: "function",
    function: {
      name: "notion_get_page",
      description:
        "Get a Notion page's properties and metadata by its page ID. Returns the page title, properties, and URL.",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "The page ID (UUID format, with or without dashes)",
          },
        },
        required: ["pageId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const pageId = args.pageId as string;
      if (!pageId) {
        return { success: false, output: "", error: "pageId is required" };
      }

      const page = await notionGetPage(pageId);

      const propsFormatted = Object.entries(page.properties)
        .map(([name, prop]) => `  ${name}: ${formatPropertyValue(prop)}`)
        .join("\n");

      const output = [
        `Page: ${getPageTitle(page)}`,
        `ID: ${page.id}`,
        `URL: ${page.url}`,
        `Created: ${page.created_time}`,
        `Last edited: ${page.last_edited_time}`,
        "",
        "Properties:",
        propsFormatted,
      ].join("\n");

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Get Page Content (Blocks) Tool
// ============================================================================

export const notionGetBlocksTool: ToolDefinition = {
  name: "notion_get_blocks",
  tool: {
    type: "function",
    function: {
      name: "notion_get_blocks",
      description:
        "Get the content blocks of a Notion page. Returns the text and structure of the page body.",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "The page ID to get content from",
          },
        },
        required: ["pageId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const pageId = args.pageId as string;
      if (!pageId) {
        return { success: false, output: "", error: "pageId is required" };
      }

      const result = await notionGetBlocks(pageId);

      if (result.results.length === 0) {
        return {
          success: true,
          output: "Page has no content blocks.",
        };
      }

      const formatted = result.results
        .map((block, i) => {
          const content = formatBlockContent(block);
          const indent = block.type.startsWith("heading") ? "" : "  ";
          return `${i + 1}. [${block.type}] ${indent}${content}`;
        })
        .join("\n");

      return {
        success: true,
        output: `Found ${result.results.length} block(s)${result.has_more ? " (more available)" : ""}:\n\n${formatted}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Create Page Tool
// ============================================================================

export const notionCreatePageTool: ToolDefinition = {
  name: "notion_create_page",
  tool: {
    type: "function",
    function: {
      name: "notion_create_page",
      description:
        "Create a new page in Notion. Can create a page in a database (with properties) or as a child of another page.",
      parameters: {
        type: "object",
        properties: {
          parentDatabaseId: {
            type: "string",
            description:
              "Database ID to create the page in. Use this when adding an item to a database.",
          },
          parentPageId: {
            type: "string",
            description:
              "Parent page ID to create a subpage under. Use this for nested pages.",
          },
          title: {
            type: "string",
            description: "The page title (required)",
          },
          properties: {
            type: "object",
            description:
              "Additional properties for database pages. Format: {\"PropertyName\": {\"type\": value}}. Common types: select ({\"select\": {\"name\": \"Option\"}}), date ({\"date\": {\"start\": \"2024-01-15\"}}), checkbox ({\"checkbox\": true}), number ({\"number\": 42}), url ({\"url\": \"https://...\"}), rich_text ({\"rich_text\": [{\"text\": {\"content\": \"text\"}}]})",
          },
          content: {
            type: "string",
            description:
              "Initial text content for the page body (will be added as a paragraph block)",
          },
          emoji: {
            type: "string",
            description: "Emoji icon for the page (e.g., '📝')",
          },
        },
        required: ["title"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const parentDatabaseId = args.parentDatabaseId as string | undefined;
      const parentPageId = args.parentPageId as string | undefined;
      const title = args.title as string;
      const additionalProps = args.properties as Record<string, unknown> | undefined;
      const content = args.content as string | undefined;
      const emoji = args.emoji as string | undefined;

      if (!title) {
        return { success: false, output: "", error: "title is required" };
      }

      if (!parentDatabaseId && !parentPageId) {
        return {
          success: false,
          output: "",
          error: "Either parentDatabaseId or parentPageId is required",
        };
      }

      const parent = parentDatabaseId
        ? { database_id: parentDatabaseId }
        : { page_id: parentPageId! };

      // Build properties with title
      const properties: Record<string, unknown> = {
        ...(additionalProps || {}),
      };

      // For database pages, find or use "Name" or "Title" as the title property
      if (parentDatabaseId) {
        // Common title property names
        const titleKey =
          Object.keys(properties).find(
            (k) =>
              k.toLowerCase() === "name" ||
              k.toLowerCase() === "title",
          ) || "Name";

        properties[titleKey] = {
          title: [{ text: { content: title } }],
        };
      } else {
        // For regular pages, use "title" as the property
        properties.title = {
          title: [{ text: { content: title } }],
        };
      }

      // Build children blocks if content provided
      const children = content
        ? [
            {
              object: "block" as const,
              type: "paragraph",
              paragraph: {
                rich_text: [{ text: { content } }],
              },
            },
          ]
        : undefined;

      const icon = emoji ? { emoji } : undefined;

      const page = await notionCreatePage(parent, properties, children, icon);

      return {
        success: true,
        output: `Page created successfully!\nTitle: ${title}\nID: ${page.id}\nURL: ${page.url}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Update Page Tool
// ============================================================================

export const notionUpdatePageTool: ToolDefinition = {
  name: "notion_update_page",
  tool: {
    type: "function",
    function: {
      name: "notion_update_page",
      description:
        "Update a Notion page's properties. Can update any property value or archive/unarchive the page.",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "The page ID to update",
          },
          properties: {
            type: "object",
            description:
              "Properties to update. Format: {\"PropertyName\": {\"type\": value}}. See notion_create_page for type examples.",
          },
          archived: {
            type: "boolean",
            description: "Set to true to archive (delete) the page, false to unarchive",
          },
          emoji: {
            type: "string",
            description: "New emoji icon (use null to remove)",
          },
        },
        required: ["pageId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const pageId = args.pageId as string;
      const properties = args.properties as Record<string, unknown> | undefined;
      const archived = args.archived as boolean | undefined;
      const emoji = args.emoji as string | undefined;

      if (!pageId) {
        return { success: false, output: "", error: "pageId is required" };
      }

      const icon = emoji !== undefined ? (emoji ? { emoji } : null) : undefined;

      const page = await notionUpdatePage(pageId, properties, archived, icon);

      return {
        success: true,
        output: `Page updated successfully!\nID: ${page.id}\nURL: ${page.url}${archived !== undefined ? `\nArchived: ${archived}` : ""}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Add Blocks Tool
// ============================================================================

export const notionAddBlocksTool: ToolDefinition = {
  name: "notion_add_blocks",
  tool: {
    type: "function",
    function: {
      name: "notion_add_blocks",
      description:
        "Add content blocks to a Notion page. Appends new blocks at the end of the page.",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "The page ID to add blocks to",
          },
          blocks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "paragraph",
                    "heading_1",
                    "heading_2",
                    "heading_3",
                    "bulleted_list_item",
                    "numbered_list_item",
                    "to_do",
                    "toggle",
                    "quote",
                    "callout",
                    "divider",
                    "code",
                  ],
                  description: "Block type",
                },
                content: {
                  type: "string",
                  description: "Text content for the block",
                },
                checked: {
                  type: "boolean",
                  description: "For to_do blocks: whether checked",
                },
                language: {
                  type: "string",
                  description:
                    "For code blocks: programming language (e.g., 'javascript', 'python')",
                },
              },
              required: ["type"],
            },
            description:
              "Array of blocks to add. Each block needs a type and optional content.",
          },
        },
        required: ["pageId", "blocks"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const pageId = args.pageId as string;
      const blocksInput = args.blocks as Array<{
        type: string;
        content?: string;
        checked?: boolean;
        language?: string;
      }>;

      if (!pageId) {
        return { success: false, output: "", error: "pageId is required" };
      }

      if (!blocksInput || blocksInput.length === 0) {
        return { success: false, output: "", error: "blocks array is required" };
      }

      // Convert simple block format to Notion API format
      const children = blocksInput.map((block) => {
        const richText = block.content
          ? [{ text: { content: block.content } }]
          : [];

        if (block.type === "divider") {
          return { object: "block" as const, type: "divider", divider: {} };
        }

        if (block.type === "to_do") {
          return {
            object: "block" as const,
            type: "to_do",
            to_do: {
              rich_text: richText,
              checked: block.checked || false,
            },
          };
        }

        if (block.type === "code") {
          return {
            object: "block" as const,
            type: "code",
            code: {
              rich_text: richText,
              language: block.language || "plain text",
            },
          };
        }

        // Standard text blocks
        return {
          object: "block" as const,
          type: block.type,
          [block.type]: {
            rich_text: richText,
          },
        };
      });

      const result = await notionAddBlocks(pageId, children);

      return {
        success: true,
        output: `Added ${result.results.length} block(s) to page.`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Get Database Tool
// ============================================================================

export const notionGetDatabaseTool: ToolDefinition = {
  name: "notion_get_database",
  tool: {
    type: "function",
    function: {
      name: "notion_get_database",
      description:
        "Get a Notion database's schema and properties. Returns the database structure including all property definitions.",
      parameters: {
        type: "object",
        properties: {
          databaseId: {
            type: "string",
            description: "The database ID",
          },
        },
        required: ["databaseId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const databaseId = args.databaseId as string;
      if (!databaseId) {
        return { success: false, output: "", error: "databaseId is required" };
      }

      const db = await notionGetDatabase(databaseId);

      const propsFormatted = Object.entries(db.properties)
        .map(([name, prop]) => `  - ${name} (${prop.type})`)
        .join("\n");

      const output = [
        `Database: ${extractPlainText(db.title) || "(Untitled)"}`,
        `ID: ${db.id}`,
        `URL: ${db.url}`,
        "",
        "Properties:",
        propsFormatted,
      ].join("\n");

      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Query Database Tool
// ============================================================================

export const notionQueryDatabaseTool: ToolDefinition = {
  name: "notion_query_database",
  tool: {
    type: "function",
    function: {
      name: "notion_query_database",
      description:
        "Query a Notion database with optional filters and sorting. Returns matching pages/items.",
      parameters: {
        type: "object",
        properties: {
          databaseId: {
            type: "string",
            description: "The database ID to query",
          },
          filter: {
            type: "object",
            description:
              "Filter object. Examples: {\"property\": \"Status\", \"select\": {\"equals\": \"Done\"}}, {\"property\": \"Date\", \"date\": {\"after\": \"2024-01-01\"}}, {\"property\": \"Checkbox\", \"checkbox\": {\"equals\": true}}. Can use 'and'/'or' for compound filters.",
          },
          sorts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                property: { type: "string" },
                direction: { type: "string", enum: ["ascending", "descending"] },
              },
            },
            description:
              "Sort order. Example: [{\"property\": \"Date\", \"direction\": \"descending\"}]",
          },
          maxResults: {
            type: "number",
            description: "Maximum results (default: 50, max: 100)",
          },
        },
        required: ["databaseId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const databaseId = args.databaseId as string;
      const filter = args.filter as Record<string, unknown> | undefined;
      const sorts = args.sorts as Array<{ property?: string; direction: "ascending" | "descending" }> | undefined;
      const maxResults = Math.min(Number(args.maxResults) || 50, 100);

      if (!databaseId) {
        return { success: false, output: "", error: "databaseId is required" };
      }

      const result = await notionQueryDatabase(databaseId, filter, sorts, maxResults);

      if (result.results.length === 0) {
        return {
          success: true,
          output: "No items found matching the query.",
        };
      }

      const formatted = result.results
        .map((page, i) => {
          const title = getPageTitle(page);
          const props = Object.entries(page.properties)
            .filter(([, prop]) => prop.type !== "title")
            .slice(0, 5) // Limit displayed properties
            .map(([name, prop]) => `${name}: ${formatPropertyValue(prop)}`)
            .join(" | ");

          return `${i + 1}. [${page.id}] ${title}\n   ${props}`;
        })
        .join("\n\n");

      return {
        success: true,
        output: `Found ${result.results.length} item(s)${result.has_more ? " (more available)" : ""}:\n\n${formatted}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Create Database Tool
// ============================================================================

export const notionCreateDatabaseTool: ToolDefinition = {
  name: "notion_create_database",
  tool: {
    type: "function",
    function: {
      name: "notion_create_database",
      description:
        "Create a new database in Notion as a child of a page.",
      parameters: {
        type: "object",
        properties: {
          parentPageId: {
            type: "string",
            description: "The parent page ID where the database will be created",
          },
          title: {
            type: "string",
            description: "Title of the database",
          },
          properties: {
            type: "object",
            description:
              "Database property definitions. Always include a title property. Examples: {\"Name\": {\"title\": {}}, \"Status\": {\"select\": {\"options\": [{\"name\": \"Todo\"}, {\"name\": \"Done\"}]}}, \"Date\": {\"date\": {}}, \"Tags\": {\"multi_select\": {\"options\": [{\"name\": \"Tag1\"}, {\"name\": \"Tag2\"}]}}, \"Done\": {\"checkbox\": {}}, \"Count\": {\"number\": {}}, \"URL\": {\"url\": {}}}",
          },
          isInline: {
            type: "boolean",
            description:
              "If true, creates an inline database (embedded in the page). Default: false (full-page database)",
          },
        },
        required: ["parentPageId", "title", "properties"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const parentPageId = args.parentPageId as string;
      const title = args.title as string;
      const properties = args.properties as Record<string, unknown>;
      const isInline = args.isInline as boolean | undefined;

      if (!parentPageId) {
        return { success: false, output: "", error: "parentPageId is required" };
      }
      if (!title) {
        return { success: false, output: "", error: "title is required" };
      }
      if (!properties) {
        return { success: false, output: "", error: "properties are required" };
      }

      const db = await notionCreateDatabase(
        { page_id: parentPageId },
        title,
        properties,
        isInline || false,
      );

      const propCount = Object.keys(db.properties).length;

      return {
        success: true,
        output: `Database created successfully!\nTitle: ${extractPlainText(db.title)}\nID: ${db.id}\nURL: ${db.url}\nProperties: ${propCount}`,
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const notionTools: ToolDefinition[] = [
  notionSearchTool,
  notionGetPageTool,
  notionGetBlocksTool,
  notionCreatePageTool,
  notionUpdatePageTool,
  notionAddBlocksTool,
  notionGetDatabaseTool,
  notionQueryDatabaseTool,
  notionCreateDatabaseTool,
];
