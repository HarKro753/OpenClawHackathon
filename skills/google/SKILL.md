---
name: google
description: Google Workspace integration for Gmail, Calendar, Sheets, and Docs.
---

# Google Workspace Tools

Native tools for Gmail, Calendar, Sheets, and Docs. Requires OAuth setup via the Integrations page.

## Gmail

### google_gmail_list

Search and list Gmail emails. Returns a list of emails matching the query with subject, from, date, and snippet.

**Parameters:**

- `query` (optional): Gmail search query. Examples:
  - `from:someone@example.com` - emails from a specific sender
  - `newer_than:7d` - emails from the last 7 days
  - `is:unread` - unread emails
  - `subject:meeting` - emails with "meeting" in subject
  - `has:attachment` - emails with attachments
  - `in:inbox` - emails in inbox
  - Combine: `from:boss@company.com newer_than:3d is:unread`
- `maxResults` (optional): Maximum number of emails to return (default: 10, max: 50)

### google_gmail_get

Get the full content of a specific email by its message ID. Use this after listing emails to read the full body.

**Parameters:**

- `messageId` (required): The email message ID (obtained from google_gmail_list)

### google_gmail_send

Send an email. Supports plain text or HTML body. Can also reply to an existing email thread.

**Parameters:**

- `to` (required): Recipient email address
- `subject` (required): Email subject line
- `body` (required): Email body content (plain text or HTML if html=true)
- `html` (optional): If true, body is treated as HTML content (default: false)
- `replyToMessageId` (optional): Message ID to reply to (for threading)

**Email Formatting Tips:**

- Prefer plain text for simple messages
- Use HTML for rich formatting: `<p>` for paragraphs, `<br>` for line breaks, `<strong>` for bold, `<em>` for italic, `<a href="url">` for links, `<ul>`/`<li>` for lists
- Example HTML: `<p>Hi,</p><p>Thanks for your email.</p><ul><li>Item one</li><li>Item two</li></ul>`

### google_gmail_draft_create

Create a draft email without sending it. The user can review and send it later.

**Parameters:**

- `to` (required): Recipient email address
- `subject` (required): Email subject line
- `body` (required): Email body content
- `html` (optional): If true, body is treated as HTML (default: false)

### google_gmail_draft_send

Send an existing draft email by its draft ID.

**Parameters:**

- `draftId` (required): The draft ID (obtained from google_gmail_draft_create)

---

## Calendar

### google_calendar_list

List calendar events within a date range. Returns events with title, time, location, and description.

**Parameters:**

- `calendarId` (optional): Calendar ID (default: 'primary' for the user's main calendar)
- `timeMin` (optional): Start of time range in ISO 8601 format (e.g., '2024-01-15T00:00:00Z'). Defaults to now.
- `timeMax` (optional): End of time range in ISO 8601 format (e.g., '2024-01-22T23:59:59Z')
- `maxResults` (optional): Maximum number of events to return (default: 10, max: 50)

**Date Format Examples:**

- UTC: `2024-01-15T10:00:00Z`
- With timezone offset: `2024-01-15T10:00:00-05:00` (EST)
- Full day events use date only: `2024-01-15`

### google_calendar_get

Get details of a specific calendar event by its event ID.

**Parameters:**

- `eventId` (required): The event ID (obtained from google_calendar_list)
- `calendarId` (optional): Calendar ID (default: 'primary')

### google_calendar_create

Create a new calendar event. Supports setting title, time, location, description, attendees, and color.

**Parameters:**

- `summary` (required): Event title/summary
- `startDateTime` (required): Event start time in ISO 8601 format
- `endDateTime` (required): Event end time in ISO 8601 format
- `description` (optional): Event description
- `location` (optional): Event location
- `attendees` (optional): Array of attendee email addresses
- `colorId` (optional): Event color ID (1-11)
- `calendarId` (optional): Calendar ID (default: 'primary')
- `timeZone` (optional): Time zone (e.g., 'America/New_York')

**Event Color IDs:**

- 1: Lavender (#a4bdfc)
- 2: Sage (#7ae7bf)
- 3: Grape (#dbadff)
- 4: Flamingo (#ff887c)
- 5: Banana (#fbd75b)
- 6: Tangerine (#ffb878)
- 7: Peacock (#46d6db)
- 8: Graphite (#e1e1e1)
- 9: Blueberry (#5484ed)
- 10: Basil (#51b749)
- 11: Tomato (#dc2127)

### google_calendar_update

Update an existing calendar event. Only specify the fields you want to change.

**Parameters:**

- `eventId` (required): The event ID to update
- `summary` (optional): New event title
- `startDateTime` (optional): New start time in ISO 8601 format
- `endDateTime` (optional): New end time in ISO 8601 format
- `description` (optional): New description
- `location` (optional): New location
- `colorId` (optional): New color ID 1-11
- `calendarId` (optional): Calendar ID (default: 'primary')

### google_calendar_delete

Delete a calendar event.

**Parameters:**

- `eventId` (required): The event ID to delete
- `calendarId` (optional): Calendar ID (default: 'primary')

---

## Sheets

### google_sheets_get

Read data from a Google Sheets range. Returns cell values as a 2D array.

**Parameters:**

- `spreadsheetId` (required): The spreadsheet ID (from the URL: docs.google.com/spreadsheets/d/{spreadsheetId}/...)
- `range` (required): The A1 notation range to read (e.g., 'Sheet1!A1:D10' or just 'A1:D10')

**Range Examples:**

- `Sheet1!A1:D10` - Cells A1 to D10 on Sheet1
- `A1:D10` - Cells A1 to D10 on the first sheet
- `Sheet1!A:C` - All of columns A, B, C on Sheet1
- `Sheet1!1:5` - Rows 1 through 5 on Sheet1

### google_sheets_update

Update cells in a Google Sheets range. Overwrites existing data.

**Parameters:**

- `spreadsheetId` (required): The spreadsheet ID
- `range` (required): The A1 notation range to update (e.g., 'Sheet1!A1:B2')
- `values` (required): 2D array of values to write (e.g., [['A1','B1'],['A2','B2']])

### google_sheets_append

Append rows to a Google Sheets range. Adds data after the last row with content.

**Parameters:**

- `spreadsheetId` (required): The spreadsheet ID
- `range` (required): The A1 notation range indicating where to append (e.g., 'Sheet1!A:C')
- `values` (required): 2D array of rows to append (e.g., [['val1','val2','val3']])

### google_sheets_clear

Clear all values from a Google Sheets range.

**Parameters:**

- `spreadsheetId` (required): The spreadsheet ID
- `range` (required): The A1 notation range to clear (e.g., 'Sheet1!A2:Z')

### google_sheets_metadata

Get spreadsheet metadata including title and list of sheets with their names and sizes.

**Parameters:**

- `spreadsheetId` (required): The spreadsheet ID

---

## Docs

### google_docs_get

Get the content of a Google Doc as plain text. Returns the document title and body text.

**Parameters:**

- `documentId` (required): The document ID (from the URL: docs.google.com/document/d/{documentId}/...)

### google_docs_export

Export a Google Doc in a specific format (plain text, HTML, or PDF as base64).

**Parameters:**

- `documentId` (required): The document ID
- `format` (optional): Export format: 'txt' (plain text, default), 'html', or 'pdf' (base64 encoded)

---

## Notes

- **Authentication**: Connect Google via the Integrations page. Tokens auto-refresh when expired.
- **Rate Limits**: Google APIs have rate limits. If you hit them, wait a moment and retry.
- **Confirmations**: Always confirm with the user before sending emails, creating events, or modifying data.
- **IDs**: Many operations return IDs (messageId, eventId, draftId) that you can use for follow-up actions.
- **Time Zones**: When creating events, include timezone offset in the datetime or set the timeZone parameter.
