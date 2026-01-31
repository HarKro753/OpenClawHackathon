import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";

// ============================================================================
// Types
// ============================================================================

export interface SkillMeta {
  name: string;
  description: string;
  homepage?: string;
  metadata?: Record<string, unknown>;
}

export interface Skill {
  folderName: string;
  meta: SkillMeta;
  content: string;
}

export interface ContextConfig {
  openaiApiKey: string;
  skillsDir: string;
  skillFolders: string[];
  systemPromptPath: string;
}

// ============================================================================
// Frontmatter Parser
// ============================================================================

export function parseFrontmatter(
  content: string,
): { meta: SkillMeta; body: string } | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const yamlContent = match[1];
  const body = match[2];

  const nameMatch = yamlContent.match(/^name:\s*(.+)$/m);
  const descriptionMatch = yamlContent.match(/^description:\s*(.+)$/m);
  const homepageMatch = yamlContent.match(/^homepage:\s*(.+)$/m);

  if (!nameMatch?.[1] || !descriptionMatch?.[1]) {
    return null;
  }

  return {
    meta: {
      name: nameMatch[1].trim(),
      description: descriptionMatch[1].trim(),
      homepage: homepageMatch?.[1]?.trim(),
    },
    body: body.trim(),
  };
}

// ============================================================================
// Skill Loader
// ============================================================================

export function loadSkills(skillsDir: string, skillFolders: string[]): Skill[] {
  const skills: Skill[] = [];

  for (const folderName of skillFolders) {
    const skillPath = join(skillsDir, folderName, "SKILL.md");
    try {
      const content = readFileSync(skillPath, "utf-8");
      const parsed = parseFrontmatter(content);

      if (parsed) {
        skills.push({
          folderName,
          meta: parsed.meta,
          content,
        });
        console.log(`Loaded skill: ${parsed.meta.name} (${folderName})`);
      } else {
        skills.push({
          folderName,
          meta: {
            name: folderName,
            description: `${folderName} skill`,
          },
          content,
        });
        console.log(`Loaded skill without frontmatter: ${folderName}`);
      }
    } catch (error) {
      console.error(`Failed to load ${folderName} skill:`, error);
    }
  }

  return skills;
}

// ============================================================================
// Skill Router
// ============================================================================

export async function selectSkills(
  openai: OpenAI,
  userMessages: Array<{ role: string; content: string }>,
  availableSkills: Skill[],
): Promise<Skill[]> {
  if (availableSkills.length === 0) {
    return [];
  }

  const skillSummaries = availableSkills
    .map((s) => `- ${s.meta.name}: ${s.meta.description}`)
    .join("\n");

  const recentMessages = userMessages
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content)
    .join("\n");

  const routerPrompt = `You are a skill router. Based on the user's request, determine which skills (if any) are needed to help them.

Available skills:
${skillSummaries}

Respond with ONLY a JSON array of skill names that are relevant to help with this request.
- Return [] (empty array) if no skills are needed (e.g., for general questions, greetings, or topics not covered by any skill)
- Return one or more skill names if they are needed
- Only include skills that are directly relevant to the user's request

Examples of valid responses:
["gog"]
["linkedin-cli", "notion"]
[]

User's request:
${recentMessages}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: routerPrompt }],
      temperature: 0,
      max_tokens: 100,
    });

    const content = response.choices[0]?.message?.content?.trim() || "[]";

    let selectedNames: string[];
    try {
      selectedNames = JSON.parse(content);
      if (!Array.isArray(selectedNames)) {
        selectedNames = [];
      }
    } catch {
      console.error("Failed to parse router response:", content);
      selectedNames = [];
    }

    const selected = availableSkills.filter(
      (s) =>
        selectedNames.includes(s.meta.name) ||
        selectedNames.includes(s.folderName),
    );

    console.log(
      `Router selected skills: ${
        selected.length > 0
          ? selected.map((s) => s.meta.name).join(", ")
          : "(none)"
      }`,
    );
    return selected;
  } catch (error) {
    console.error("Router error, falling back to all skills:", error);
    return availableSkills;
  }
}

// ============================================================================
// System Prompt Builder
// ============================================================================

export function loadBaseSystemPrompt(systemPromptPath: string): string {
  return readFileSync(systemPromptPath, "utf-8");
}

export function buildToolsMessage(selectedSkills: Skill[]): string | null {
  if (selectedSkills.length === 0) {
    return null;
  }

  const skillDocs = selectedSkills
    .map((s) => `## ${s.meta.name.toUpperCase()}\n\n${s.content}`)
    .join("\n\n---\n\n");

  return `# Available Tools\n\nYou now have access to the following tools. Use them to help the user with their request:\n\n${skillDocs}`;
}

export function buildMessages(
  baseSystemPrompt: string,
  toolsMessage: string | null,
  conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: baseSystemPrompt },
  ];

  if (toolsMessage) {
    messages.push({
      role: "system",
      content: toolsMessage,
    });
  }

  messages.push(...conversationHistory);

  return messages;
}

// ============================================================================
// Context Manager (Singleton-like for the app)
// ============================================================================

export class ContextManager {
  private skills: Skill[] = [];
  private baseSystemPrompt: string = "";
  private openai: OpenAI;

  constructor(config: ContextConfig) {
    this.openai = new OpenAI({ apiKey: config.openaiApiKey });
    this.baseSystemPrompt = loadBaseSystemPrompt(config.systemPromptPath);
    this.skills = loadSkills(config.skillsDir, config.skillFolders);
  }

  getSkills(): Skill[] {
    return this.skills;
  }

  getSkillNames(): string[] {
    return this.skills.map((s) => s.meta.name);
  }

  getBaseSystemPrompt(): string {
    return this.baseSystemPrompt;
  }

  async selectSkillsForMessages(
    messages: Array<{ role: string; content: string }>,
  ): Promise<Skill[]> {
    return selectSkills(this.openai, messages, this.skills);
  }

  buildContextMessages(
    selectedSkills: Skill[],
    conversationHistory: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const toolsMessage = buildToolsMessage(selectedSkills);

    if (toolsMessage) {
      console.log(
        `Loading tools into context: ${selectedSkills
          .map((s) => s.meta.name)
          .join(", ")}`,
      );
    } else {
      console.log("No tools needed for this request");
    }

    return buildMessages(
      this.baseSystemPrompt,
      toolsMessage,
      conversationHistory,
    );
  }
}
