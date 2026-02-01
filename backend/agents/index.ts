/**
 * Agents Module
 *
 * This module contains the core agentic loop and context management for the AI agent.
 */

// Agent Loop exports
export {
  runAgentLoopStreaming,
  DEFAULT_CONFIG,
  type AgentLoopConfig,
  type StreamEvent,
  type EventEmitter,
} from "./agent-loop.js";

// Context Management exports
export {
  ContextManager,
  loadSkills,
  selectSkills,
  parseFrontmatter,
  loadBaseSystemPrompt,
  buildToolsMessage,
  buildMessages,
  type Skill,
  type SkillMeta,
  type ContextConfig,
} from "./context.js";
