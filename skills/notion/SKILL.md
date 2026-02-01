---
name: notion
description: Notion integration for managing pages, databases, and content blocks.
---

# Notion Tools

Native tools for Notion pages, databases, and blocks. Requires API key setup via the Integrations page.

## Search

### notion_search

Search for pages and databases in Notion. Returns matching pages and databases with their IDs, titles, and URLs.

**Parameters:**

- `query` (optional): Search query text. Leave empty to list recent items.
- `filter` (optional): Filter results by type: `'page'` for pages only, `'database'` for databases only. Omit for both.
- `maxResults` (optional): Maximum results to return (default: 20, max: 100)

**Examples:**

- Search for pages containing "project": `query: "project"`
- List only databases: `filter: "database"`
- Find recent pages: leave all parameters empty

---

## Pages

### notion_get_page

Get a Notion page's properties and metadata by its page ID. Returns the page title, properties, and URL.

**Parameters:**

- `pageId` (required): The page ID (UUID format, with or without dashes)

**Note:** Use `notion_get_blocks` to get the actual content/body of the page.

### notion_get_blocks

Get the content blocks of a Notion page. Returns the text and structure of the page body.

**Parameters:**

- `pageId` (required): The page ID to get content from

**Block Types Returned:**

- Text blocks: paragraph, heading_1/2/3, quote, callout
- List items: bulleted_list_item, numbered_list_item, to_do
- Media: image, video, file, bookmark
- Code blocks with language
- Dividers and more

### notion_create_page

Create a new page in Notion. Can create a page in a database (with properties) or as a child of another page.

**Parameters:**

- `parentDatabaseId` (optional): Database ID to create the page in. Use this when adding an item to a database.
- `parentPageId` (optional): Parent page ID to create a subpage under. Use this for nested pages.
- `title` (required): The page title
- `properties` (optional): Additional properties for database pages (see Property Formats below)
- `content` (optional): Initial text content for the page body
- `emoji` (optional): Emoji icon for the page (e.g., `'...'`)

**Note:** Either `parentDatabaseId` OR `parentPageId` is required (but not both).

**Example - Create database item:**

```json
{
  "parentDatabaseId": "abc123...",
  "title": "New Task",
  "properties": {
    "Status": { "select": { "name": "Todo" } },
    "Due Date": { "date": { "start": "2024-01-15" } }
  },
  "emoji": "..."
}
```

**Example - Create subpage:**

```json
{
  "parentPageId": "xyz789...",
  "title": "Meeting Notes",
  "content": "Notes from today's meeting...",
  "emoji": "..."
}
```

### notion_update_page

Update a Notion page's properties. Can update any property value or archive/unarchive the page.

**Parameters:**

- `pageId` (required): The page ID to update
- `properties` (optional): Properties to update (see Property Formats below)
- `archived` (optional): Set to `true` to archive (delete) the page, `false` to unarchive
- `emoji` (optional): New emoji icon (use `null` to remove)

**Example:**

```json
{
  "pageId": "abc123...",
  "properties": {
    "Status": { "select": { "name": "Done" } }
  }
}
```

### notion_add_blocks

Add content blocks to a Notion page. Appends new blocks at the end of the page.

**Parameters:**

- `pageId` (required): The page ID to add blocks to
- `blocks` (required): Array of blocks to add

**Block Format:**

Each block needs a `type` and optional `content`:

```json
{
  "blocks": [
    { "type": "heading_1", "content": "Section Title" },
    { "type": "paragraph", "content": "Regular paragraph text." },
    { "type": "bulleted_list_item", "content": "List item" },
    { "type": "to_do", "content": "Task item", "checked": false },
    { "type": "code", "content": "console.log('hello')", "language": "javascript" },
    { "type": "divider" }
  ]
}
```

**Supported Block Types:**

- `paragraph` - Regular text
- `heading_1`, `heading_2`, `heading_3` - Headings
- `bulleted_list_item`, `numbered_list_item` - List items
- `to_do` - Checkbox items (use `checked: true/false`)
- `toggle` - Collapsible content
- `quote` - Block quote
- `callout` - Highlighted callout box
- `code` - Code block (use `language` parameter)
- `divider` - Horizontal line

---

## Databases

### notion_get_database

Get a Notion database's schema and properties. Returns the database structure including all property definitions.

**Parameters:**

- `databaseId` (required): The database ID

**Returns:** Database title, URL, and list of properties with their types (title, select, multi_select, date, checkbox, etc.)

### notion_query_database

Query a Notion database with optional filters and sorting. Returns matching pages/items.

**Parameters:**

- `databaseId` (required): The database ID to query
- `filter` (optional): Filter object (see Filter Examples below)
- `sorts` (optional): Sort order array
- `maxResults` (optional): Maximum results (default: 50, max: 100)

**Filter Examples:**

```json
// Filter by select property
{ "property": "Status", "select": { "equals": "Done" } }

// Filter by date
{ "property": "Due Date", "date": { "after": "2024-01-01" } }

// Filter by checkbox
{ "property": "Completed", "checkbox": { "equals": true } }

// Filter by text contains
{ "property": "Name", "rich_text": { "contains": "meeting" } }

// Compound filter (AND)
{
  "and": [
    { "property": "Status", "select": { "equals": "Active" } },
    { "property": "Priority", "select": { "equals": "High" } }
  ]
}

// Compound filter (OR)
{
  "or": [
    { "property": "Status", "select": { "equals": "Todo" } },
    { "property": "Status", "select": { "equals": "In Progress" } }
  ]
}
```

**Sort Examples:**

```json
[{ "property": "Date", "direction": "descending" }]
[{ "property": "Name", "direction": "ascending" }]
```

### notion_create_database

Create a new database in Notion as a child of a page.

**Parameters:**

- `parentPageId` (required): The parent page ID where the database will be created
- `title` (required): Title of the database
- `properties` (required): Database property definitions (see below)
- `isInline` (optional): If `true`, creates an inline database. Default: `false` (full-page database)

**Property Definition Examples:**

```json
{
  "properties": {
    "Name": { "title": {} },
    "Status": {
      "select": {
        "options": [{ "name": "Todo" }, { "name": "In Progress" }, { "name": "Done" }]
      }
    },
    "Due Date": { "date": {} },
    "Tags": {
      "multi_select": {
        "options": [{ "name": "Work" }, { "name": "Personal" }]
      }
    },
    "Completed": { "checkbox": {} },
    "Priority": { "number": {} },
    "Link": { "url": {} }
  }
}
```

---

## Property Formats

When creating or updating pages, use these property value formats:

| Type | Format |
|------|--------|
| Title | `{"title": [{"text": {"content": "..."}}]}` |
| Rich text | `{"rich_text": [{"text": {"content": "..."}}]}` |
| Select | `{"select": {"name": "Option"}}` |
| Multi-select | `{"multi_select": [{"name": "A"}, {"name": "B"}]}` |
| Date | `{"date": {"start": "2024-01-15"}}` or `{"date": {"start": "2024-01-15", "end": "2024-01-16"}}` |
| Checkbox | `{"checkbox": true}` |
| Number | `{"number": 42}` |
| URL | `{"url": "https://..."}` |
| Email | `{"email": "user@example.com"}` |
| Phone | `{"phone_number": "+1234567890"}` |

---

## Notes

- **Authentication**: Connect Notion via the Integrations page with your API key.
- **Page IDs**: UUIDs with or without dashes (e.g., `abc123def456` or `abc123de-f456-...`)
- **Permissions**: The API key only has access to pages/databases explicitly shared with the integration.
- **Rate Limits**: Notion has rate limits (~3 requests/second). If you hit them, wait and retry.
- **Confirmations**: Always confirm with the user before creating pages, modifying databases, or updating content.
- **IDs in Results**: Most operations return IDs that can be used for follow-up actions.
