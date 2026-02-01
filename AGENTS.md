# AGENTS.md - AI Coding Agent Guidelines

## Project Overview

OpenClaw Hackathon monorepo:

- **backend/**: Bun-based TypeScript server with AI agent capabilities
- **frontend/**: Next.js 16 with React 19 and Tailwind CSS 4
- **skills/**: Skill definitions (markdown with YAML frontmatter)

Runtime: **Bun** | Language: **TypeScript 5** | Module System: **ESM**

## Build, Lint, and Test Commands

```bash
# Installation
bun install                  # Install all workspace dependencies

# Development
bun run dev                  # Run both frontend and backend
bun run dev:frontend         # Frontend only (Next.js with Turbopack)
bun run dev:backend          # Backend only (with hot reload)

# Production
bun run build                # Build both frontend and backend
bun run start                # Start both services

# Linting (frontend only - no backend linter configured)
cd frontend && bun run lint  # Runs ESLint with Next.js config

# Testing - No formal test framework configured
bun run test-browser.ts      # Browser automation test (from backend/)

# Running a single test: Create a test file and run directly
bun run my-test.ts

# Docker
docker-compose up --build    # Build and start services
```

## Code Style Guidelines

### File Naming & Imports

- Use **kebab-case** for files: `agent-loop.ts`, `google-api.ts`
- Use `.js` extension in imports for ESM compatibility

**Import order:**

```typescript
// 1. Third-party packages
import OpenAI from "openai";
import { join } from "path";

// 2. Type imports
import type { ToolDefinition, ToolResult } from "./tools.js";

// 3. Local modules (always use .js extension)
import { ContextManager } from "./context.js";
```

### Naming Conventions

| Element                  | Convention       | Example               |
| ------------------------ | ---------------- | --------------------- |
| Files                    | kebab-case       | `agent-loop.ts`       |
| Functions/Variables      | camelCase        | `getValidAccessToken` |
| Constants                | UPPER_SNAKE_CASE | `DEFAULT_CONFIG`      |
| Interfaces/Types/Classes | PascalCase       | `ToolDefinition`      |
| Tool names               | snake_case       | `run_bash_command`    |

### Type Annotations

```typescript
export interface ToolDefinition {
  name: string;
  tool: OpenAI.Chat.ChatCompletionTool;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

// Type casting for API responses
const data = (await response.json()) as { messages?: Array<{ id: string }> };
```

### Error Handling

```typescript
// Pattern 1: try-catch with type narrowing
try {
  const result = await someAsyncOperation();
  return { success: true, output: result };
} catch (error) {
  return {
    success: false,
    output: "",
    error: error instanceof Error ? error.message : String(error),
  };
}

// Pattern 2: Graceful degradation
const title = await page.title().catch(() => "");

// Pattern 3: Descriptive error messages
if (!tokens?.access_token) {
  throw new Error("Google not connected. Please connect in integrations.");
}
```

### File Organization

```typescript
import OpenAI from "openai";
import { someFunction } from "./module.js";

// ============================================================================
// Types
// ============================================================================

export interface MyInterface { ... }

// ============================================================================
// [Feature Name]
// ============================================================================

export function myFunction(): void { ... }
```

### Async/Await & Module Patterns

- Always use `async/await` (no raw Promises or callbacks)
- Use `for await` for streaming operations

```typescript
// Singleton pattern for services
const telegramService = new TelegramService();
export function startTelegramPolling(...): Promise<void> {
  return telegramService.start(...);
}

// Registry pattern for tools
const toolRegistry: Map<string, ToolDefinition> = new Map();
toolRegistry.set(bashCommandTool.name, bashCommandTool);
```

## TypeScript Configuration

Backend uses strict TypeScript:

- `strict: true`, `noUncheckedIndexedAccess: true`
- `verbatimModuleSyntax: true`, `moduleResolution: "bundler"`

## Environment Variables

```bash
OPENAI_API_KEY=              # Required
HUME_API_KEY=                # Optional - Hume TTS
```

**Note:** Integration credentials (Notion, LinkedIn, Telegram, Google) are stored locally in `backend/.integrations.json` and `backend/.google-tokens.json`, and can be configured via the UI at `/integrations`.

## Project-Specific Patterns

### Tool Definitions (in `tools.ts`)

```typescript
const myTool: ToolDefinition = {
  name: "tool_name",  // snake_case
  tool: {
    type: "function",
    function: {
      name: "tool_name",
      description: "What the tool does",
      parameters: { type: "object", properties: {...}, required: [...] },
    },
  },
  execute: async (args) => { return { success: true, output: "..." }; },
};
```

### Ports

- Backend: `localhost:3001`
- Frontend: `localhost:3000`

## Common Tasks

**Adding a New Tool:**

1. Create tool definition in `tools.ts` following `ToolDefinition` interface
2. Register in `toolRegistry` map - auto-loads via `getToolDefinitions()`

**Adding a New Skill:**

1. Create `skills/<name>/SKILL.md` with YAML frontmatter
2. Add folder name to `skillFolders` array in `index.ts`

**Adding an Integration:**

1. Add token storage functions in `integrations.ts`
2. Add OAuth flow endpoints in `index.ts`
3. Create tool wrappers in dedicated `<name>-tools.ts`
