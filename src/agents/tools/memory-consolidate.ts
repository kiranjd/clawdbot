import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { Type } from "@sinclair/typebox";

import type {
  MemoryFragmentImportance,
  MemoryFragmentType,
} from "../../config/types.js";
import { type AnyAgentTool, jsonResult } from "./common.js";

/**
 * Calculate max bytes for memory.md based on context percentage.
 * 200K tokens ≈ 800KB characters (4 chars/token avg).
 * Default 10% = ~80KB.
 */
const CONTEXT_WINDOW_BYTES = 800 * 1024; // ~200K tokens

export function calculateMemoryMaxBytes(contextPercent: number = 10): number {
  const clamped = Math.max(1, Math.min(50, contextPercent));
  return Math.floor((clamped / 100) * CONTEXT_WINDOW_BYTES);
}

/** Default max size for memory.md (10% of context = ~80KB) */
export const MEMORY_MD_MAX_BYTES = calculateMemoryMaxBytes(10);

export interface MemoryFragment {
  filename: string;
  content: string;
  type: MemoryFragmentType;
  importance: MemoryFragmentImportance;
  session: string;
  sessionName?: string;
  timestamp: string;
}

export interface ConsolidationResult {
  processed: number;
  archived: number;
  ephemeral: number;
  persistent: number;
  errors: string[];
  /** Number of old entries evicted from memory.md to stay under 50KB cap */
  evicted?: number;
}

/**
 * Resolves the memory workspace path.
 */
function resolveMemoryWorkspace(explicit?: string): string {
  if (explicit) {
    return explicit.startsWith("~")
      ? path.join(os.homedir(), explicit.slice(1))
      : explicit;
  }
  return path.join(os.homedir(), "clawd");
}

/**
 * Parses YAML frontmatter from a memory fragment file.
 */
function parseMemoryFragment(
  filename: string,
  content: string,
): MemoryFragment | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const [, frontmatter, body] = match;
  const lines = frontmatter.split("\n");

  let type: MemoryFragmentType = "fact";
  let importance: MemoryFragmentImportance = "ephemeral";
  let session = "unknown";
  let sessionName: string | undefined;
  let timestamp = new Date().toISOString();

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

    switch (key) {
      case "type":
        if (["fact", "decision", "task", "insight"].includes(value)) {
          type = value as MemoryFragmentType;
        }
        break;
      case "importance":
        if (["ephemeral", "persistent"].includes(value)) {
          importance = value as MemoryFragmentImportance;
        }
        break;
      case "session":
        session = value;
        break;
      case "sessionName":
        sessionName = value;
        break;
      case "timestamp":
        timestamp = value;
        break;
    }
  }

  return {
    filename,
    content: body.trim(),
    type,
    importance,
    session,
    sessionName,
    timestamp,
  };
}

/**
 * Formats a memory fragment for the daily log.
 */
function formatForDailyLog(fragment: MemoryFragment): string {
  const time = new Date(fragment.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const sessionLabel = fragment.sessionName || fragment.session;
  const typeEmoji = {
    fact: "📝",
    decision: "✅",
    task: "📋",
    insight: "💡",
  }[fragment.type];

  return `- ${typeEmoji} **${time}** [${sessionLabel}] ${fragment.content}`;
}

/**
 * Formats a memory fragment for memory.md (persistent storage).
 */
function formatForMemoryMd(fragment: MemoryFragment): string {
  const date = new Date(fragment.timestamp).toISOString().split("T")[0];
  const sessionLabel = fragment.sessionName || fragment.session;

  return `- [${date}] [${sessionLabel}] ${fragment.content}`;
}

/**
 * Ensures a file exists with optional initial content.
 */
async function ensureFile(
  filePath: string,
  initialContent = "",
): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, initialContent, "utf-8");
  }
}

/**
 * Appends content to a file, creating it if necessary.
 */
async function appendToFile(filePath: string, content: string): Promise<void> {
  await ensureFile(filePath);
  const existing = await fs.readFile(filePath, "utf-8");
  const separator = existing.trim() ? "\n" : "";
  await fs.writeFile(filePath, existing + separator + content, "utf-8");
}

/**
 * Truncates memory.md to stay under the size cap.
 * Uses oldest-first eviction: removes oldest entries (bottom of file) until under cap.
 * Returns number of lines removed.
 */
async function enforceMemoryMdSizeCap(
  filePath: string,
  maxBytes: number = MEMORY_MD_MAX_BYTES,
): Promise<{ removed: number; sizeBefore: number; sizeAfter: number }> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf-8");
  } catch {
    return { removed: 0, sizeBefore: 0, sizeAfter: 0 };
  }

  const sizeBefore = Buffer.byteLength(content, "utf-8");
  if (sizeBefore <= maxBytes) {
    return { removed: 0, sizeBefore, sizeAfter: sizeBefore };
  }

  // Split into header (everything before first "- [") and entries
  const firstEntryIdx = content.indexOf("\n- [");
  if (firstEntryIdx === -1) {
    // No entries found, can't truncate
    return { removed: 0, sizeBefore, sizeAfter: sizeBefore };
  }

  const header = content.slice(0, firstEntryIdx + 1);
  const entriesSection = content.slice(firstEntryIdx + 1);
  const entries = entriesSection.split("\n").filter((line) => line.startsWith("- ["));

  // Remove oldest entries (from start) until under cap
  let removed = 0;
  let newEntries = [...entries];

  while (newEntries.length > 0) {
    const newContent = header + newEntries.join("\n") + "\n";
    const newSize = Buffer.byteLength(newContent, "utf-8");
    if (newSize <= maxBytes) {
      break;
    }
    // Remove oldest (first entry)
    newEntries.shift();
    removed++;
  }

  if (removed > 0) {
    const finalContent = header + newEntries.join("\n") + "\n";
    await fs.writeFile(filePath, finalContent, "utf-8");
    const sizeAfter = Buffer.byteLength(finalContent, "utf-8");
    return { removed, sizeBefore, sizeAfter };
  }

  return { removed: 0, sizeBefore, sizeAfter: sizeBefore };
}

/**
 * Consolidates memory fragments from the inbox.
 *
 * - Scans ~/clawd/memory/inbox/ for .md files
 * - Parses YAML frontmatter
 * - Appends ephemeral items to daily log
 * - Appends persistent items to daily log AND memory.md
 * - Moves processed files to archive
 * - Enforces size cap on memory.md
 */
export async function consolidateMemory(options?: {
  memoryWorkspace?: string;
  /** Max memory.md size as % of context (1-50). Default: 10. */
  maxContextPercent?: number;
}): Promise<ConsolidationResult> {
  const workspace = resolveMemoryWorkspace(options?.memoryWorkspace);
  const maxBytes = calculateMemoryMaxBytes(options?.maxContextPercent ?? 10);
  const inboxDir = path.join(workspace, "memory", "inbox");
  const memoryDir = path.join(workspace, "memory");

  const result: ConsolidationResult = {
    processed: 0,
    archived: 0,
    ephemeral: 0,
    persistent: 0,
    errors: [],
  };

  // Ensure directories exist
  try {
    await fs.mkdir(inboxDir, { recursive: true });
  } catch {
    // Directory exists
  }

  // List inbox files
  let files: string[];
  try {
    const entries = await fs.readdir(inboxDir);
    files = entries.filter((f) => f.endsWith(".md")).sort();
  } catch {
    return result; // Empty inbox or doesn't exist
  }

  if (files.length === 0) {
    return result;
  }

  // Parse all fragments
  const fragments: MemoryFragment[] = [];
  for (const filename of files) {
    try {
      const filePath = path.join(inboxDir, filename);
      const content = await fs.readFile(filePath, "utf-8");
      const fragment = parseMemoryFragment(filename, content);
      if (fragment) {
        fragments.push(fragment);
      } else {
        result.errors.push(`Failed to parse ${filename}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Error reading ${filename}: ${message}`);
    }
  }

  // Group by date for daily logs
  const byDate = new Map<string, MemoryFragment[]>();
  for (const fragment of fragments) {
    const date = fragment.timestamp.split("T")[0];
    const existing = byDate.get(date) || [];
    existing.push(fragment);
    byDate.set(date, existing);
  }

  // Process each date's fragments
  for (const [date, dateFragments] of byDate) {
    const dailyLogPath = path.join(memoryDir, `${date}.md`);

    // Build daily log entries
    const dailyEntries = dateFragments.map(formatForDailyLog).join("\n");

    // Append to daily log
    try {
      const header = `## Memory Consolidation\n\n`;
      await ensureFile(dailyLogPath, `# ${date}\n\n`);
      const existing = await fs.readFile(dailyLogPath, "utf-8");

      // Only add header if not already present
      if (!existing.includes("## Memory Consolidation")) {
        await appendToFile(dailyLogPath, `\n${header}${dailyEntries}\n`);
      } else {
        await appendToFile(dailyLogPath, `\n${dailyEntries}\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Error updating daily log ${date}: ${message}`);
    }
  }

  // Process persistent fragments to memory.md
  const persistentFragments = fragments.filter(
    (f) => f.importance === "persistent",
  );
  const memoryMdPath = path.join(workspace, "memory.md");

  if (persistentFragments.length > 0) {
    const persistentEntries = persistentFragments
      .map(formatForMemoryMd)
      .join("\n");

    try {
      await ensureFile(
        memoryMdPath,
        `# Long-Term Memory\n\nPersistent facts, decisions, and preferences.\n\n`,
      );
      await appendToFile(memoryMdPath, `\n${persistentEntries}\n`);
      result.persistent = persistentFragments.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Error updating memory.md: ${message}`);
    }
  }

  // Enforce size cap on memory.md (oldest-first eviction)
  try {
    const capResult = await enforceMemoryMdSizeCap(memoryMdPath, maxBytes);
    if (capResult.removed > 0) {
      result.evicted = capResult.removed;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`Error enforcing memory.md cap: ${message}`);
  }

  result.ephemeral = fragments.length - persistentFragments.length;

  // Archive processed files
  const today = new Date().toISOString().split("T")[0];
  const archiveDir = path.join(memoryDir, "archive", today);

  try {
    await fs.mkdir(archiveDir, { recursive: true });

    for (const fragment of fragments) {
      try {
        const srcPath = path.join(inboxDir, fragment.filename);
        const dstPath = path.join(archiveDir, fragment.filename);
        await fs.rename(srcPath, dstPath);
        result.archived++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`Error archiving ${fragment.filename}: ${message}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`Error creating archive directory: ${message}`);
  }

  result.processed = fragments.length;
  return result;
}

const MemoryConsolidateToolSchema = Type.Object({});

export type MemoryConsolidateToolContext = {
  /** Memory workspace path (default: ~/clawd) */
  memoryWorkspace?: string;
  /** Max memory.md size as % of context (1-50). Default: 10. */
  maxContextPercent?: number;
};

/**
 * Creates the memory consolidation tool for processing the inbox.
 *
 * This tool processes memory fragments from ~/clawd/memory/inbox/:
 * - Parses YAML frontmatter from each fragment
 * - Appends ephemeral items to daily logs (memory/YYYY-MM-DD.md)
 * - Appends persistent items to daily logs AND memory.md
 * - Archives processed files to memory/archive/YYYY-MM-DD/
 */
export function createMemoryConsolidateTool(
  context: MemoryConsolidateToolContext,
): AnyAgentTool {
  return {
    label: "Consolidate Memory",
    name: "memory_consolidate",
    description: `Process memory fragments from the inbox. This tool scans ~/clawd/memory/inbox/ for pending memories, consolidates them into daily logs and long-term memory.md, then archives processed files. Run this periodically (every 30 min via cron) to keep memories organized.

What it does:
- Ephemeral memories → daily log only
- Persistent memories → daily log + memory.md
- All processed files → archived by date`,
    parameters: MemoryConsolidateToolSchema,
    execute: async () => {
      const maxPct = context.maxContextPercent ?? 10;
      try {
        const result = await consolidateMemory({
          memoryWorkspace: context.memoryWorkspace,
          maxContextPercent: maxPct,
        });

        if (result.processed === 0) {
          return jsonResult({
            success: true,
            message: "📭 Memory inbox empty - nothing to consolidate",
            ...result,
          });
        }

        // Build user-friendly summary
        const parts: string[] = [];
        if (result.ephemeral > 0) {
          parts.push(`${result.ephemeral} → daily log`);
        }
        if (result.persistent > 0) {
          parts.push(`${result.persistent} → long-term memory`);
        }

        const summary = `📚 Consolidated ${result.processed} memories (${parts.join(", ")})`;

        const details = [
          summary,
          result.evicted && result.evicted > 0
            ? `🗑️ Evicted ${result.evicted} old entries (${maxPct}% cap)`
            : null,
          result.errors.length > 0
            ? `⚠️ ${result.errors.length} errors during processing`
            : null,
        ]
          .filter(Boolean)
          .join("\n");

        return jsonResult({
          success: result.errors.length === 0,
          message: details,
          ...result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          success: false,
          error: `Failed to consolidate memory: ${message}`,
        });
      }
    },
  };
}

/**
 * Parses a duration string (e.g., "30m", "1h", "2h30m") into milliseconds.
 * Returns null if unparseable.
 */
export function parseDurationMs(duration: string): number | null {
  const trimmed = duration.trim().toLowerCase();
  if (!trimmed) return null;

  let totalMs = 0;
  const patterns = [
    { regex: /(\d+)h/, multiplier: 60 * 60 * 1000 },
    { regex: /(\d+)m/, multiplier: 60 * 1000 },
    { regex: /(\d+)s/, multiplier: 1000 },
  ];

  for (const { regex, multiplier } of patterns) {
    const match = trimmed.match(regex);
    if (match) {
      totalMs += parseInt(match[1], 10) * multiplier;
    }
  }

  // If no patterns matched, try parsing as minutes (bare number)
  if (totalMs === 0 && /^\d+$/.test(trimmed)) {
    totalMs = parseInt(trimmed, 10) * 60 * 1000;
  }

  return totalMs > 0 ? totalMs : null;
}

/** ID for the memory consolidation cron job */
export const MEMORY_CONSOLIDATE_CRON_ID = "memory-consolidate";

/**
 * Returns the cron job spec for memory consolidation.
 */
export function buildMemoryConsolidateCronJob(consolidateEvery: string): {
  id: string;
  name: string;
  schedule: { kind: "every"; everyMs: number };
  sessionTarget: "isolated";
  wakeMode: "next-heartbeat";
  payload: { kind: "agentTurn"; message: string };
  isolation: { postToMainPrefix: string };
} | null {
  const everyMs = parseDurationMs(consolidateEvery);
  if (!everyMs) return null;

  return {
    id: MEMORY_CONSOLIDATE_CRON_ID,
    name: "Memory consolidation",
    schedule: { kind: "every", everyMs },
    sessionTarget: "isolated",
    wakeMode: "next-heartbeat",
    payload: {
      kind: "agentTurn",
      message:
        "Run memory consolidation. Process inbox, update daily log, integrate persistent memories.",
    },
    isolation: { postToMainPrefix: "Memory" },
  };
}
