import { readFileSync } from "fs";
import { join } from "path";
import { getGoogleTokens, setGoogleTokens } from "./integrations.js";

// ============================================================================
// Types
// ============================================================================

export interface GmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  body?: string;
  labels?: string[];
}

export interface GmailDraft {
  id: string;
  message?: GmailMessage;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string; responseStatus?: string }>;
  colorId?: string;
  htmlLink?: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{ email: string }>;
  colorId?: string;
}

export interface SheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    index: number;
    rowCount: number;
    columnCount: number;
  }>;
}

export interface DocsDocument {
  documentId: string;
  title: string;
  body?: string;
}

// ============================================================================
// Token Management
// ============================================================================

async function getValidAccessToken(): Promise<string> {
  const tokens = getGoogleTokens();
  if (!tokens?.access_token) {
    throw new Error(
      "Google not connected. Please connect Google in the integrations page.",
    );
  }

  // Check if token is expired (with 5 minute buffer)
  const expiresAt = tokens.created_at + (tokens.expires_in || 3600) * 1000;
  const isExpired = Date.now() > expiresAt - 5 * 60 * 1000;

  if (!isExpired) {
    return tokens.access_token;
  }

  // Token expired, refresh it
  if (!tokens.refresh_token) {
    throw new Error(
      "Google token expired and no refresh token available. Please reconnect Google.",
    );
  }

  // Load client credentials
  const clientSecretPath = join(
    import.meta.dir,
    "..",
    "skills",
    "google",
    "client_secret.json",
  );
  let clientId: string;
  let clientSecret: string;

  try {
    const clientSecretFile = JSON.parse(
      readFileSync(clientSecretPath, "utf-8"),
    );
    const credentials = clientSecretFile.installed || clientSecretFile.web;
    clientId = credentials.client_id;
    clientSecret = credentials.client_secret;
  } catch {
    throw new Error("Failed to load Google OAuth credentials.");
  }

  // Refresh the token
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Google token: ${errorText}`);
  }

  const newTokenData = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  };

  // Update stored tokens
  setGoogleTokens({
    ...tokens,
    access_token: newTokenData.access_token,
    expires_in: newTokenData.expires_in || 3600,
    token_type: newTokenData.token_type || "Bearer",
    scope: newTokenData.scope || tokens.scope,
    created_at: Date.now(),
  });

  console.log("Google access token refreshed successfully");
  return newTokenData.access_token;
}

async function googleFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const accessToken = await getValidAccessToken();
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google API error (${response.status}): ${errorText}`);
  }

  return response;
}

// ============================================================================
// Gmail API
// ============================================================================

export async function gmailList(
  query?: string,
  maxResults: number = 10,
): Promise<GmailMessage[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
  });
  if (query) {
    params.set("q", query);
  }

  const response = await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
  );
  const data = (await response.json()) as {
    messages?: Array<{ id: string; threadId: string }>;
  };

  if (!data.messages || data.messages.length === 0) {
    return [];
  }

  // Fetch full details for each message
  const messages: GmailMessage[] = [];
  for (const msg of data.messages.slice(0, maxResults)) {
    try {
      const fullMessage = await gmailGet(msg.id);
      messages.push(fullMessage);
    } catch (error) {
      // Include partial info if full fetch fails
      messages.push({
        id: msg.id,
        threadId: msg.threadId,
        snippet: "(failed to load details)",
      });
    }
  }

  return messages;
}

export async function gmailGet(messageId: string): Promise<GmailMessage> {
  const response = await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
  );
  const data = (await response.json()) as {
    id: string;
    threadId: string;
    snippet: string;
    labelIds?: string[];
    payload?: {
      headers?: Array<{ name: string; value: string }>;
      body?: { data?: string };
      parts?: Array<{
        mimeType: string;
        body?: { data?: string };
      }>;
    };
  };

  const headers = data.payload?.headers || [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

  // Decode body
  let body = "";
  if (data.payload?.body?.data) {
    body = Buffer.from(data.payload.body.data, "base64url").toString("utf-8");
  } else if (data.payload?.parts) {
    const textPart = data.payload.parts.find(
      (p) => p.mimeType === "text/plain",
    );
    if (textPart?.body?.data) {
      body = Buffer.from(textPart.body.data, "base64url").toString("utf-8");
    }
  }

  return {
    id: data.id,
    threadId: data.threadId,
    snippet: data.snippet,
    subject: getHeader("Subject"),
    from: getHeader("From"),
    to: getHeader("To"),
    date: getHeader("Date"),
    body: body || undefined,
    labels: data.labelIds,
  };
}

export async function gmailSend(
  to: string,
  subject: string,
  body: string,
  options?: { html?: boolean; replyToMessageId?: string },
): Promise<{ id: string; threadId: string }> {
  const boundary = "boundary_" + Date.now();
  let rawMessage = "";

  const headers = [`To: ${to}`, `Subject: ${subject}`, `MIME-Version: 1.0`];

  if (options?.replyToMessageId) {
    headers.push(`In-Reply-To: ${options.replyToMessageId}`);
    headers.push(`References: ${options.replyToMessageId}`);
  }

  if (options?.html) {
    headers.push(`Content-Type: text/html; charset=UTF-8`);
  } else {
    headers.push(`Content-Type: text/plain; charset=UTF-8`);
  }

  rawMessage = headers.join("\r\n") + "\r\n\r\n" + body;

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      body: JSON.stringify({ raw: encodedMessage }),
    },
  );

  const data = (await response.json()) as { id: string; threadId: string };
  return data;
}

export async function gmailDraftCreate(
  to: string,
  subject: string,
  body: string,
  options?: { html?: boolean },
): Promise<{ id: string; message: { id: string; threadId: string } }> {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    options?.html
      ? `Content-Type: text/html; charset=UTF-8`
      : `Content-Type: text/plain; charset=UTF-8`,
  ];

  const rawMessage = headers.join("\r\n") + "\r\n\r\n" + body;
  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
    {
      method: "POST",
      body: JSON.stringify({
        message: { raw: encodedMessage },
      }),
    },
  );

  return (await response.json()) as {
    id: string;
    message: { id: string; threadId: string };
  };
}

export async function gmailDraftSend(
  draftId: string,
): Promise<{ id: string; threadId: string }> {
  const response = await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/drafts/send`,
    {
      method: "POST",
      body: JSON.stringify({ id: draftId }),
    },
  );

  return (await response.json()) as { id: string; threadId: string };
}

// ============================================================================
// Calendar API
// ============================================================================

export async function calendarList(
  calendarId: string = "primary",
  timeMin?: string,
  timeMax?: string,
  maxResults: number = 10,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });

  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);

  const response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events?${params}`,
  );

  const data = (await response.json()) as { items?: CalendarEvent[] };
  return data.items || [];
}

export async function calendarGet(
  calendarId: string = "primary",
  eventId: string,
): Promise<CalendarEvent> {
  const response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events/${encodeURIComponent(eventId)}`,
  );

  return (await response.json()) as CalendarEvent;
}

export async function calendarCreate(
  calendarId: string = "primary",
  event: CalendarEventInput,
): Promise<CalendarEvent> {
  const response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events`,
    {
      method: "POST",
      body: JSON.stringify(event),
    },
  );

  return (await response.json()) as CalendarEvent;
}

export async function calendarUpdate(
  calendarId: string = "primary",
  eventId: string,
  updates: Partial<CalendarEventInput>,
): Promise<CalendarEvent> {
  const response = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );

  return (await response.json()) as CalendarEvent;
}

export async function calendarDelete(
  calendarId: string = "primary",
  eventId: string,
): Promise<void> {
  await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

// ============================================================================
// Sheets API
// ============================================================================

export async function sheetsGet(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(range)}`,
  );

  const data = (await response.json()) as { values?: string[][] };
  return data.values || [];
}

export async function sheetsUpdate(
  spreadsheetId: string,
  range: string,
  values: string[][],
  valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
): Promise<{
  updatedCells: number;
  updatedRows: number;
  updatedColumns: number;
}> {
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
    {
      method: "PUT",
      body: JSON.stringify({ values }),
    },
  );

  const data = (await response.json()) as {
    updatedCells: number;
    updatedRows: number;
    updatedColumns: number;
  };
  return data;
}

export async function sheetsAppend(
  spreadsheetId: string,
  range: string,
  values: string[][],
  valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
  insertDataOption: "OVERWRITE" | "INSERT_ROWS" = "INSERT_ROWS",
): Promise<{ updatedCells: number; updatedRows: number }> {
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(
      range,
    )}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );

  const data = (await response.json()) as {
    updates?: { updatedCells: number; updatedRows: number };
  };
  return {
    updatedCells: data.updates?.updatedCells || 0,
    updatedRows: data.updates?.updatedRows || 0,
  };
}

export async function sheetsClear(
  spreadsheetId: string,
  range: string,
): Promise<void> {
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST" },
  );
}

export async function sheetsMetadata(
  spreadsheetId: string,
): Promise<SheetMetadata> {
  const response = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId,
    )}?fields=spreadsheetId,properties.title,sheets.properties`,
  );

  const data = (await response.json()) as {
    spreadsheetId: string;
    properties: { title: string };
    sheets: Array<{
      properties: {
        sheetId: number;
        title: string;
        index: number;
        gridProperties: { rowCount: number; columnCount: number };
      };
    }>;
  };

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties.title,
    sheets: data.sheets.map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index,
      rowCount: s.properties.gridProperties.rowCount,
      columnCount: s.properties.gridProperties.columnCount,
    })),
  };
}

// ============================================================================
// Docs API
// ============================================================================

export async function docsCreate(
  title: string,
  content?: string,
): Promise<DocsDocument> {
  // First, create an empty document
  const createResponse = await googleFetch(
    "https://docs.googleapis.com/v1/documents",
    {
      method: "POST",
      body: JSON.stringify({ title }),
    },
  );

  const doc = (await createResponse.json()) as {
    documentId: string;
    title: string;
  };

  // If content is provided, insert it into the document
  if (content) {
    await googleFetch(
      `https://docs.googleapis.com/v1/documents/${doc.documentId}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: content,
              },
            },
          ],
        }),
      },
    );
  }

  return {
    documentId: doc.documentId,
    title: doc.title,
    body: content,
  };
}

export async function docsGet(documentId: string): Promise<DocsDocument> {
  const response = await googleFetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
  );

  const data = (await response.json()) as {
    documentId: string;
    title: string;
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{
            textRun?: { content: string };
          }>;
        };
      }>;
    };
  };

  // Extract plain text from document structure
  let bodyText = "";
  if (data.body?.content) {
    for (const block of data.body.content) {
      if (block.paragraph?.elements) {
        for (const element of block.paragraph.elements) {
          if (element.textRun?.content) {
            bodyText += element.textRun.content;
          }
        }
      }
    }
  }

  return {
    documentId: data.documentId,
    title: data.title,
    body: bodyText || undefined,
  };
}

export async function docsExport(
  documentId: string,
  format: "txt" | "html" | "pdf" = "txt",
): Promise<string> {
  const mimeTypes: Record<string, string> = {
    txt: "text/plain",
    html: "text/html",
    pdf: "application/pdf",
  };

  const response = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
      documentId,
    )}/export?mimeType=${encodeURIComponent(mimeTypes[format])}`,
  );

  if (format === "pdf") {
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  return await response.text();
}
