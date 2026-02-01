import type OpenAI from "openai";
import type { ToolDefinition, ToolResult } from "./tools.js";
import {
  gmailList,
  gmailGet,
  gmailSend,
  gmailDraftCreate,
  gmailDraftSend,
  calendarList,
  calendarGet,
  calendarCreate,
  calendarUpdate,
  calendarDelete,
  sheetsGet,
  sheetsUpdate,
  sheetsAppend,
  sheetsClear,
  sheetsMetadata,
  docsCreate,
  docsGet,
  docsExport,
} from "./google-api.js";

// ============================================================================
// Gmail Tools
// ============================================================================

export const googleGmailListTool: ToolDefinition = {
  name: "google_gmail_list",
  tool: {
    type: "function",
    function: {
      name: "google_gmail_list",
      description:
        "Search and list Gmail emails. Returns a list of emails matching the query with subject, from, date, and snippet.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Gmail search query (e.g., 'from:someone@example.com', 'newer_than:7d', 'is:unread', 'subject:meeting'). Leave empty to list recent emails.",
          },
          maxResults: {
            type: "number",
            description:
              "Maximum number of emails to return (default: 10, max: 50)",
          },
        },
        required: [],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const query = args.query as string | undefined;
      const maxResults = Math.min(Number(args.maxResults) || 10, 50);

      const messages = await gmailList(query, maxResults);

      if (messages.length === 0) {
        return {
          success: true,
          output: "No emails found matching the query.",
        };
      }

      const formatted = messages
        .map(
          (m, i) =>
            `${i + 1}. [${m.id}]\n   From: ${m.from || "Unknown"}\n   Subject: ${m.subject || "(no subject)"}\n   Date: ${m.date || "Unknown"}\n   Snippet: ${m.snippet}`,
        )
        .join("\n\n");

      return {
        success: true,
        output: `Found ${messages.length} email(s):\n\n${formatted}`,
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

export const googleGmailGetTool: ToolDefinition = {
  name: "google_gmail_get",
  tool: {
    type: "function",
    function: {
      name: "google_gmail_get",
      description:
        "Get the full content of a specific email by its message ID. Use this after listing emails to read the full body.",
      parameters: {
        type: "object",
        properties: {
          messageId: {
            type: "string",
            description:
              "The email message ID (obtained from google_gmail_list)",
          },
        },
        required: ["messageId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const messageId = args.messageId as string;
      if (!messageId) {
        return { success: false, output: "", error: "messageId is required" };
      }

      const message = await gmailGet(messageId);

      const output = [
        `ID: ${message.id}`,
        `Thread ID: ${message.threadId}`,
        `From: ${message.from || "Unknown"}`,
        `To: ${message.to || "Unknown"}`,
        `Subject: ${message.subject || "(no subject)"}`,
        `Date: ${message.date || "Unknown"}`,
        `Labels: ${message.labels?.join(", ") || "None"}`,
        "",
        "--- Body ---",
        message.body || "(no body content)",
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

export const googleGmailSendTool: ToolDefinition = {
  name: "google_gmail_send",
  tool: {
    type: "function",
    function: {
      name: "google_gmail_send",
      description:
        "Send an email. Supports plain text or HTML body. Can also reply to an existing email thread.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content (plain text or HTML if html=true)",
          },
          html: {
            type: "boolean",
            description:
              "If true, body is treated as HTML content (default: false)",
          },
          replyToMessageId: {
            type: "string",
            description:
              "Message ID to reply to (for threading). Get this from google_gmail_get.",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const to = args.to as string;
      const subject = args.subject as string;
      const body = args.body as string;
      const html = args.html as boolean | undefined;
      const replyToMessageId = args.replyToMessageId as string | undefined;

      if (!to || !subject || !body) {
        return {
          success: false,
          output: "",
          error: "to, subject, and body are required",
        };
      }

      const result = await gmailSend(to, subject, body, {
        html,
        replyToMessageId,
      });

      return {
        success: true,
        output: `Email sent successfully!\nMessage ID: ${result.id}\nThread ID: ${result.threadId}`,
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

export const googleGmailDraftCreateTool: ToolDefinition = {
  name: "google_gmail_draft_create",
  tool: {
    type: "function",
    function: {
      name: "google_gmail_draft_create",
      description:
        "Create a draft email without sending it. The user can review and send it later.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Recipient email address",
          },
          subject: {
            type: "string",
            description: "Email subject line",
          },
          body: {
            type: "string",
            description: "Email body content",
          },
          html: {
            type: "boolean",
            description: "If true, body is treated as HTML (default: false)",
          },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const to = args.to as string;
      const subject = args.subject as string;
      const body = args.body as string;
      const html = args.html as boolean | undefined;

      if (!to || !subject || !body) {
        return {
          success: false,
          output: "",
          error: "to, subject, and body are required",
        };
      }

      const result = await gmailDraftCreate(to, subject, body, { html });

      return {
        success: true,
        output: `Draft created successfully!\nDraft ID: ${result.id}\nMessage ID: ${result.message.id}`,
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

export const googleGmailDraftSendTool: ToolDefinition = {
  name: "google_gmail_draft_send",
  tool: {
    type: "function",
    function: {
      name: "google_gmail_draft_send",
      description: "Send an existing draft email by its draft ID.",
      parameters: {
        type: "object",
        properties: {
          draftId: {
            type: "string",
            description:
              "The draft ID (obtained from google_gmail_draft_create)",
          },
        },
        required: ["draftId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const draftId = args.draftId as string;
      if (!draftId) {
        return { success: false, output: "", error: "draftId is required" };
      }

      const result = await gmailDraftSend(draftId);

      return {
        success: true,
        output: `Draft sent successfully!\nMessage ID: ${result.id}\nThread ID: ${result.threadId}`,
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
// Calendar Tools
// ============================================================================

export const googleCalendarListTool: ToolDefinition = {
  name: "google_calendar_list",
  tool: {
    type: "function",
    function: {
      name: "google_calendar_list",
      description:
        "List calendar events within a date range. Returns events with title, time, location, and description.",
      parameters: {
        type: "object",
        properties: {
          calendarId: {
            type: "string",
            description:
              "Calendar ID (default: 'primary' for the user's main calendar)",
          },
          timeMin: {
            type: "string",
            description:
              "Start of time range in ISO 8601 format (e.g., '2024-01-15T00:00:00Z'). Defaults to now.",
          },
          timeMax: {
            type: "string",
            description:
              "End of time range in ISO 8601 format (e.g., '2024-01-22T23:59:59Z')",
          },
          maxResults: {
            type: "number",
            description:
              "Maximum number of events to return (default: 10, max: 50)",
          },
        },
        required: [],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const calendarId = (args.calendarId as string) || "primary";
      const timeMin = args.timeMin as string | undefined;
      const timeMax = args.timeMax as string | undefined;
      const maxResults = Math.min(Number(args.maxResults) || 10, 50);

      const events = await calendarList(
        calendarId,
        timeMin,
        timeMax,
        maxResults,
      );

      if (events.length === 0) {
        return {
          success: true,
          output: "No events found in the specified time range.",
        };
      }

      const formatted = events
        .map((e, i) => {
          const start = e.start.dateTime || e.start.date || "Unknown";
          const end = e.end.dateTime || e.end.date || "Unknown";
          return `${i + 1}. [${e.id}] ${e.summary}\n   Start: ${start}\n   End: ${end}${e.location ? `\n   Location: ${e.location}` : ""}${e.description ? `\n   Description: ${e.description}` : ""}`;
        })
        .join("\n\n");

      return {
        success: true,
        output: `Found ${events.length} event(s):\n\n${formatted}`,
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

export const googleCalendarGetTool: ToolDefinition = {
  name: "google_calendar_get",
  tool: {
    type: "function",
    function: {
      name: "google_calendar_get",
      description: "Get details of a specific calendar event by its event ID.",
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "The event ID (obtained from google_calendar_list)",
          },
          calendarId: {
            type: "string",
            description: "Calendar ID (default: 'primary')",
          },
        },
        required: ["eventId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const eventId = args.eventId as string;
      const calendarId = (args.calendarId as string) || "primary";

      if (!eventId) {
        return { success: false, output: "", error: "eventId is required" };
      }

      const event = await calendarGet(calendarId, eventId);

      const output = [
        `ID: ${event.id}`,
        `Summary: ${event.summary}`,
        `Start: ${event.start.dateTime || event.start.date}`,
        `End: ${event.end.dateTime || event.end.date}`,
        event.location ? `Location: ${event.location}` : null,
        event.description ? `Description: ${event.description}` : null,
        event.attendees?.length
          ? `Attendees: ${event.attendees.map((a) => `${a.email} (${a.responseStatus || "unknown"})`).join(", ")}`
          : null,
        event.htmlLink ? `Link: ${event.htmlLink}` : null,
      ]
        .filter(Boolean)
        .join("\n");

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

export const googleCalendarCreateTool: ToolDefinition = {
  name: "google_calendar_create",
  tool: {
    type: "function",
    function: {
      name: "google_calendar_create",
      description:
        "Create a new calendar event. Supports setting title, time, location, description, attendees, and color.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "Event title/summary",
          },
          startDateTime: {
            type: "string",
            description:
              "Event start time in ISO 8601 format (e.g., '2024-01-15T10:00:00-05:00')",
          },
          endDateTime: {
            type: "string",
            description:
              "Event end time in ISO 8601 format (e.g., '2024-01-15T11:00:00-05:00')",
          },
          description: {
            type: "string",
            description: "Event description (optional)",
          },
          location: {
            type: "string",
            description: "Event location (optional)",
          },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "List of attendee email addresses (optional)",
          },
          colorId: {
            type: "string",
            description:
              "Event color ID (1-11): 1=lavender, 2=sage, 3=grape, 4=flamingo, 5=banana, 6=tangerine, 7=peacock, 8=graphite, 9=blueberry, 10=basil, 11=tomato",
          },
          calendarId: {
            type: "string",
            description: "Calendar ID (default: 'primary')",
          },
          timeZone: {
            type: "string",
            description:
              "Time zone (e.g., 'America/New_York'). If not specified, times should include offset.",
          },
        },
        required: ["summary", "startDateTime", "endDateTime"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const summary = args.summary as string;
      const startDateTime = args.startDateTime as string;
      const endDateTime = args.endDateTime as string;
      const calendarId = (args.calendarId as string) || "primary";
      const timeZone = args.timeZone as string | undefined;

      if (!summary || !startDateTime || !endDateTime) {
        return {
          success: false,
          output: "",
          error: "summary, startDateTime, and endDateTime are required",
        };
      }

      const event = await calendarCreate(calendarId, {
        summary,
        start: { dateTime: startDateTime, timeZone },
        end: { dateTime: endDateTime, timeZone },
        description: args.description as string | undefined,
        location: args.location as string | undefined,
        attendees: (args.attendees as string[] | undefined)?.map((email) => ({
          email,
        })),
        colorId: args.colorId as string | undefined,
      });

      return {
        success: true,
        output: `Event created successfully!\nID: ${event.id}\nSummary: ${event.summary}\nStart: ${event.start.dateTime || event.start.date}\nEnd: ${event.end.dateTime || event.end.date}${event.htmlLink ? `\nLink: ${event.htmlLink}` : ""}`,
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

export const googleCalendarUpdateTool: ToolDefinition = {
  name: "google_calendar_update",
  tool: {
    type: "function",
    function: {
      name: "google_calendar_update",
      description:
        "Update an existing calendar event. Only specify the fields you want to change.",
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "The event ID to update",
          },
          summary: {
            type: "string",
            description: "New event title (optional)",
          },
          startDateTime: {
            type: "string",
            description: "New start time in ISO 8601 format (optional)",
          },
          endDateTime: {
            type: "string",
            description: "New end time in ISO 8601 format (optional)",
          },
          description: {
            type: "string",
            description: "New description (optional)",
          },
          location: {
            type: "string",
            description: "New location (optional)",
          },
          colorId: {
            type: "string",
            description: "New color ID 1-11 (optional)",
          },
          calendarId: {
            type: "string",
            description: "Calendar ID (default: 'primary')",
          },
        },
        required: ["eventId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const eventId = args.eventId as string;
      const calendarId = (args.calendarId as string) || "primary";

      if (!eventId) {
        return { success: false, output: "", error: "eventId is required" };
      }

      const updates: Record<string, unknown> = {};
      if (args.summary) updates.summary = args.summary;
      if (args.description) updates.description = args.description;
      if (args.location) updates.location = args.location;
      if (args.colorId) updates.colorId = args.colorId;
      if (args.startDateTime) {
        updates.start = { dateTime: args.startDateTime };
      }
      if (args.endDateTime) {
        updates.end = { dateTime: args.endDateTime };
      }

      const event = await calendarUpdate(calendarId, eventId, updates as any);

      return {
        success: true,
        output: `Event updated successfully!\nID: ${event.id}\nSummary: ${event.summary}`,
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

export const googleCalendarDeleteTool: ToolDefinition = {
  name: "google_calendar_delete",
  tool: {
    type: "function",
    function: {
      name: "google_calendar_delete",
      description: "Delete a calendar event.",
      parameters: {
        type: "object",
        properties: {
          eventId: {
            type: "string",
            description: "The event ID to delete",
          },
          calendarId: {
            type: "string",
            description: "Calendar ID (default: 'primary')",
          },
        },
        required: ["eventId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const eventId = args.eventId as string;
      const calendarId = (args.calendarId as string) || "primary";

      if (!eventId) {
        return { success: false, output: "", error: "eventId is required" };
      }

      await calendarDelete(calendarId, eventId);

      return {
        success: true,
        output: `Event deleted successfully (ID: ${eventId})`,
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
// Sheets Tools
// ============================================================================

export const googleSheetsGetTool: ToolDefinition = {
  name: "google_sheets_get",
  tool: {
    type: "function",
    function: {
      name: "google_sheets_get",
      description:
        "Read data from a Google Sheets range. Returns cell values as a 2D array.",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: {
            type: "string",
            description:
              "The spreadsheet ID (from the URL: docs.google.com/spreadsheets/d/{spreadsheetId}/...)",
          },
          range: {
            type: "string",
            description:
              "The A1 notation range to read (e.g., 'Sheet1!A1:D10' or just 'A1:D10')",
          },
        },
        required: ["spreadsheetId", "range"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const spreadsheetId = args.spreadsheetId as string;
      const range = args.range as string;

      if (!spreadsheetId || !range) {
        return {
          success: false,
          output: "",
          error: "spreadsheetId and range are required",
        };
      }

      const values = await sheetsGet(spreadsheetId, range);

      if (values.length === 0) {
        return {
          success: true,
          output: "No data found in the specified range.",
        };
      }

      // Format as a table
      const formatted = values
        .map((row, i) => `Row ${i + 1}: ${row.join(" | ")}`)
        .join("\n");

      return {
        success: true,
        output: `Found ${values.length} row(s):\n\n${formatted}`,
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

export const googleSheetsUpdateTool: ToolDefinition = {
  name: "google_sheets_update",
  tool: {
    type: "function",
    function: {
      name: "google_sheets_update",
      description:
        "Update cells in a Google Sheets range. Overwrites existing data.",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: {
            type: "string",
            description: "The spreadsheet ID",
          },
          range: {
            type: "string",
            description:
              "The A1 notation range to update (e.g., 'Sheet1!A1:B2')",
          },
          values: {
            type: "array",
            items: {
              type: "array",
              items: { type: "string" },
            },
            description:
              "2D array of values to write (e.g., [['A1','B1'],['A2','B2']])",
          },
        },
        required: ["spreadsheetId", "range", "values"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const spreadsheetId = args.spreadsheetId as string;
      const range = args.range as string;
      const values = args.values as string[][];

      if (!spreadsheetId || !range || !values) {
        return {
          success: false,
          output: "",
          error: "spreadsheetId, range, and values are required",
        };
      }

      const result = await sheetsUpdate(spreadsheetId, range, values);

      return {
        success: true,
        output: `Updated ${result.updatedCells} cell(s) in ${result.updatedRows} row(s)`,
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

export const googleSheetsAppendTool: ToolDefinition = {
  name: "google_sheets_append",
  tool: {
    type: "function",
    function: {
      name: "google_sheets_append",
      description:
        "Append rows to a Google Sheets range. Adds data after the last row with content.",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: {
            type: "string",
            description: "The spreadsheet ID",
          },
          range: {
            type: "string",
            description:
              "The A1 notation range indicating where to append (e.g., 'Sheet1!A:C')",
          },
          values: {
            type: "array",
            items: {
              type: "array",
              items: { type: "string" },
            },
            description:
              "2D array of rows to append (e.g., [['val1','val2','val3']])",
          },
        },
        required: ["spreadsheetId", "range", "values"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const spreadsheetId = args.spreadsheetId as string;
      const range = args.range as string;
      const values = args.values as string[][];

      if (!spreadsheetId || !range || !values) {
        return {
          success: false,
          output: "",
          error: "spreadsheetId, range, and values are required",
        };
      }

      const result = await sheetsAppend(spreadsheetId, range, values);

      return {
        success: true,
        output: `Appended ${result.updatedRows} row(s) (${result.updatedCells} cells)`,
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

export const googleSheetsClearTool: ToolDefinition = {
  name: "google_sheets_clear",
  tool: {
    type: "function",
    function: {
      name: "google_sheets_clear",
      description: "Clear all values from a Google Sheets range.",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: {
            type: "string",
            description: "The spreadsheet ID",
          },
          range: {
            type: "string",
            description: "The A1 notation range to clear (e.g., 'Sheet1!A2:Z')",
          },
        },
        required: ["spreadsheetId", "range"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const spreadsheetId = args.spreadsheetId as string;
      const range = args.range as string;

      if (!spreadsheetId || !range) {
        return {
          success: false,
          output: "",
          error: "spreadsheetId and range are required",
        };
      }

      await sheetsClear(spreadsheetId, range);

      return {
        success: true,
        output: `Cleared range: ${range}`,
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

export const googleSheetsMetadataTool: ToolDefinition = {
  name: "google_sheets_metadata",
  tool: {
    type: "function",
    function: {
      name: "google_sheets_metadata",
      description:
        "Get spreadsheet metadata including title and list of sheets with their names and sizes.",
      parameters: {
        type: "object",
        properties: {
          spreadsheetId: {
            type: "string",
            description: "The spreadsheet ID",
          },
        },
        required: ["spreadsheetId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const spreadsheetId = args.spreadsheetId as string;

      if (!spreadsheetId) {
        return {
          success: false,
          output: "",
          error: "spreadsheetId is required",
        };
      }

      const metadata = await sheetsMetadata(spreadsheetId);

      const sheetsInfo = metadata.sheets
        .map(
          (s) =>
            `  - "${s.title}" (${s.rowCount} rows × ${s.columnCount} columns)`,
        )
        .join("\n");

      return {
        success: true,
        output: `Spreadsheet: ${metadata.title}\nID: ${metadata.spreadsheetId}\n\nSheets:\n${sheetsInfo}`,
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
// Docs Tools
// ============================================================================

export const googleDocsCreateTool: ToolDefinition = {
  name: "google_docs_create",
  tool: {
    type: "function",
    function: {
      name: "google_docs_create",
      description:
        "Create a new Google Doc with an optional initial content. Returns the document ID and URL.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The title of the new document",
          },
          content: {
            type: "string",
            description: "Optional initial text content for the document",
          },
        },
        required: ["title"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const title = args.title as string;
      const content = args.content as string | undefined;

      if (!title) {
        return { success: false, output: "", error: "title is required" };
      }

      const doc = await docsCreate(title, content);

      const docUrl = `https://docs.google.com/document/d/${doc.documentId}/edit`;

      return {
        success: true,
        output: `Document created successfully!\nTitle: ${doc.title}\nID: ${doc.documentId}\nURL: ${docUrl}${content ? `\n\nContent written: ${content.length} characters` : ""}`,
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

export const googleDocsGetTool: ToolDefinition = {
  name: "google_docs_get",
  tool: {
    type: "function",
    function: {
      name: "google_docs_get",
      description:
        "Get the content of a Google Doc as plain text. Returns the document title and body text.",
      parameters: {
        type: "object",
        properties: {
          documentId: {
            type: "string",
            description:
              "The document ID (from the URL: docs.google.com/document/d/{documentId}/...)",
          },
        },
        required: ["documentId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const documentId = args.documentId as string;

      if (!documentId) {
        return { success: false, output: "", error: "documentId is required" };
      }

      const doc = await docsGet(documentId);

      return {
        success: true,
        output: `Document: ${doc.title}\nID: ${doc.documentId}\n\n--- Content ---\n${doc.body || "(empty document)"}`,
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

export const googleDocsExportTool: ToolDefinition = {
  name: "google_docs_export",
  tool: {
    type: "function",
    function: {
      name: "google_docs_export",
      description:
        "Export a Google Doc in a specific format (plain text, HTML, or PDF as base64).",
      parameters: {
        type: "object",
        properties: {
          documentId: {
            type: "string",
            description: "The document ID",
          },
          format: {
            type: "string",
            enum: ["txt", "html", "pdf"],
            description:
              "Export format: 'txt' (plain text), 'html', or 'pdf' (base64)",
          },
        },
        required: ["documentId"],
      },
    },
  },
  execute: async (args): Promise<ToolResult> => {
    try {
      const documentId = args.documentId as string;
      const format = (args.format as "txt" | "html" | "pdf") || "txt";

      if (!documentId) {
        return { success: false, output: "", error: "documentId is required" };
      }

      const content = await docsExport(documentId, format);

      if (format === "pdf") {
        return {
          success: true,
          output: `PDF exported (base64, ${content.length} characters).\n\nBase64 content:\n${content.substring(0, 500)}...`,
        };
      }

      return {
        success: true,
        output: `Exported as ${format.toUpperCase()}:\n\n${content}`,
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

export const googleTools: ToolDefinition[] = [
  // Gmail
  googleGmailListTool,
  googleGmailGetTool,
  googleGmailSendTool,
  googleGmailDraftCreateTool,
  googleGmailDraftSendTool,
  // Calendar
  googleCalendarListTool,
  googleCalendarGetTool,
  googleCalendarCreateTool,
  googleCalendarUpdateTool,
  googleCalendarDeleteTool,
  // Sheets
  googleSheetsGetTool,
  googleSheetsUpdateTool,
  googleSheetsAppendTool,
  googleSheetsClearTool,
  googleSheetsMetadataTool,
  // Docs
  googleDocsCreateTool,
  googleDocsGetTool,
  googleDocsExportTool,
];
