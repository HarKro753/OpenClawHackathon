// ============================================================================
// Tool Display Metadata
// ============================================================================
// Provides icon names, labels, and URL extraction for tool calls.
// This centralizes all display logic on the server so iOS client is simple.

export interface ToolDisplayInfo {
  icon: string;
  labelInProgress: string;
  labelComplete: string;
}

const TOOL_DISPLAY_MAP: Record<string, ToolDisplayInfo> = {
  // Google Docs
  google_docs_create: {
    icon: "google.docs",
    labelInProgress: "Creating document...",
    labelComplete: "Document created",
  },
  google_docs_get: {
    icon: "google.docs",
    labelInProgress: "Reading document...",
    labelComplete: "Document read",
  },
  google_docs_export: {
    icon: "google.docs",
    labelInProgress: "Exporting document...",
    labelComplete: "Document exported",
  },

  // Gmail
  google_gmail_list: {
    icon: "google.gmail",
    labelInProgress: "Fetching emails...",
    labelComplete: "Emails fetched",
  },
  google_gmail_get: {
    icon: "google.gmail",
    labelInProgress: "Reading email...",
    labelComplete: "Email read",
  },
  google_gmail_send: {
    icon: "google.gmail",
    labelInProgress: "Sending email...",
    labelComplete: "Email sent",
  },
  google_gmail_draft_create: {
    icon: "google.gmail",
    labelInProgress: "Creating draft...",
    labelComplete: "Draft created",
  },
  google_gmail_draft_send: {
    icon: "google.gmail",
    labelInProgress: "Sending draft...",
    labelComplete: "Draft sent",
  },

  // Calendar
  google_calendar_list: {
    icon: "google.calendar",
    labelInProgress: "Fetching events...",
    labelComplete: "Events fetched",
  },
  google_calendar_get: {
    icon: "google.calendar",
    labelInProgress: "Reading event...",
    labelComplete: "Event read",
  },
  google_calendar_create: {
    icon: "google.calendar",
    labelInProgress: "Creating event...",
    labelComplete: "Event created",
  },
  google_calendar_update: {
    icon: "google.calendar",
    labelInProgress: "Updating event...",
    labelComplete: "Event updated",
  },
  google_calendar_delete: {
    icon: "google.calendar",
    labelInProgress: "Deleting event...",
    labelComplete: "Event deleted",
  },

  // Sheets
  google_sheets_get: {
    icon: "google.sheets",
    labelInProgress: "Reading sheet...",
    labelComplete: "Sheet read",
  },
  google_sheets_update: {
    icon: "google.sheets",
    labelInProgress: "Updating sheet...",
    labelComplete: "Sheet updated",
  },
  google_sheets_append: {
    icon: "google.sheets",
    labelInProgress: "Adding rows...",
    labelComplete: "Rows added",
  },
  google_sheets_clear: {
    icon: "google.sheets",
    labelInProgress: "Clearing sheet...",
    labelComplete: "Sheet cleared",
  },
  google_sheets_metadata: {
    icon: "google.sheets",
    labelInProgress: "Fetching metadata...",
    labelComplete: "Metadata fetched",
  },

  // Browser
  browser: {
    icon: "safari",
    labelInProgress: "Browsing...",
    labelComplete: "Page loaded",
  },

  // Bash
  run_bash_command: {
    icon: "terminal",
    labelInProgress: "Running command...",
    labelComplete: "Command complete",
  },

  // GitHub (future)
  github_create_issue: {
    icon: "github",
    labelInProgress: "Creating issue...",
    labelComplete: "Issue created",
  },
  github_create_pr: {
    icon: "github",
    labelInProgress: "Creating PR...",
    labelComplete: "PR created",
  },

  // LinkedIn (future)
  linkedin_post: {
    icon: "linkedin",
    labelInProgress: "Posting...",
    labelComplete: "Posted",
  },

  // Notion (future)
  notion_create_page: {
    icon: "notion",
    labelInProgress: "Creating page...",
    labelComplete: "Page created",
  },
};

const DEFAULT_DISPLAY: ToolDisplayInfo = {
  icon: "gearshape",
  labelInProgress: "Working...",
  labelComplete: "Done",
};

/**
 * Get the icon name for a tool (SF Symbol or custom asset name)
 */
export function getToolIcon(toolName: string): string {
  return TOOL_DISPLAY_MAP[toolName]?.icon ?? DEFAULT_DISPLAY.icon;
}

/**
 * Get the user-friendly label for a tool action
 */
export function getToolLabel(toolName: string, isComplete: boolean): string {
  const info = TOOL_DISPLAY_MAP[toolName] ?? DEFAULT_DISPLAY;
  return isComplete ? info.labelComplete : info.labelInProgress;
}

/**
 * Extract a clickable URL from tool output
 */
export function extractResultUrl(output: string): string | undefined {
  // URL patterns to extract from tool outputs
  const patterns = [
    /URL: (https?:\/\/[^\s]+)/i,
    /Link: (https?:\/\/[^\s]+)/i,
    /(https:\/\/docs\.google\.com\/document\/d\/[^\s]+)/,
    /(https:\/\/docs\.google\.com\/spreadsheets\/d\/[^\s]+)/,
    /(https:\/\/calendar\.google\.com\/[^\s]+)/,
    /(https:\/\/mail\.google\.com\/[^\s]+)/,
    /(https:\/\/github\.com\/[^\s\/]+\/[^\s\/]+\/(?:issues|pull)\/\d+)/,
    /(https:\/\/(?:www\.)?linkedin\.com\/[^\s]+)/,
    /(https:\/\/(?:www\.)?notion\.so\/[^\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1]) {
      // Clean up trailing punctuation
      return match[1].replace(/[.,;:!?)]+$/, "");
    }
  }

  return undefined;
}

// Tools whose verbose output should NOT be sent to the client
// (e.g., browser snapshots contain huge HTML)
const SUPPRESS_OUTPUT_TOOLS = new Set(["browser"]);

/**
 * Check if a tool's output should be suppressed (not sent to client)
 */
export function shouldSuppressOutput(toolName: string): boolean {
  return SUPPRESS_OUTPUT_TOOLS.has(toolName);
}
