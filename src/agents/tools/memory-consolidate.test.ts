import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildMemoryConsolidateCronJob,
  calculateMemoryMaxBytes,
  consolidateMemory,
  createMemoryConsolidateTool,
  MEMORY_CONSOLIDATE_CRON_ID,
  parseDurationMs,
} from "./memory-consolidate.js";

describe("memory consolidation", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "consolidate-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function getResultDetails(result: { details?: unknown }): Record<string, unknown> {
    return result.details as Record<string, unknown>;
  }

  describe("calculateMemoryMaxBytes", () => {
    it("returns ~80KB for 10% (default)", () => {
      const result = calculateMemoryMaxBytes(10);
      expect(result).toBe(Math.floor((10 / 100) * 800 * 1024));
    });

    it("clamps to minimum 1%", () => {
      const result = calculateMemoryMaxBytes(0);
      expect(result).toBe(Math.floor((1 / 100) * 800 * 1024));
    });

    it("clamps to maximum 50%", () => {
      const result = calculateMemoryMaxBytes(100);
      expect(result).toBe(Math.floor((50 / 100) * 800 * 1024));
    });

    it("uses default 10% when not provided", () => {
      const result = calculateMemoryMaxBytes();
      expect(result).toBe(Math.floor((10 / 100) * 800 * 1024));
    });
  });

  describe("parseDurationMs", () => {
    it("parses minutes", () => {
      expect(parseDurationMs("30m")).toBe(30 * 60 * 1000);
    });

    it("parses hours", () => {
      expect(parseDurationMs("2h")).toBe(2 * 60 * 60 * 1000);
    });

    it("parses seconds", () => {
      expect(parseDurationMs("45s")).toBe(45 * 1000);
    });

    it("parses combined durations", () => {
      expect(parseDurationMs("1h30m")).toBe(90 * 60 * 1000);
    });

    it("parses bare number as minutes", () => {
      expect(parseDurationMs("30")).toBe(30 * 60 * 1000);
    });

    it("returns null for empty string", () => {
      expect(parseDurationMs("")).toBeNull();
    });

    it("returns null for invalid string", () => {
      expect(parseDurationMs("abc")).toBeNull();
    });

    it("is case insensitive", () => {
      expect(parseDurationMs("30M")).toBe(30 * 60 * 1000);
      expect(parseDurationMs("2H")).toBe(2 * 60 * 60 * 1000);
    });
  });

  describe("buildMemoryConsolidateCronJob", () => {
    it("returns job spec for valid duration", () => {
      const job = buildMemoryConsolidateCronJob("30m");
      expect(job).not.toBeNull();
      expect(job?.id).toBe(MEMORY_CONSOLIDATE_CRON_ID);
      expect(job?.name).toBe("Memory consolidation");
      expect(job?.schedule).toEqual({ kind: "every", everyMs: 30 * 60 * 1000 });
      expect(job?.sessionTarget).toBe("isolated");
      expect(job?.wakeMode).toBe("next-heartbeat");
      expect(job?.payload.kind).toBe("agentTurn");
    });

    it("returns null for invalid duration", () => {
      expect(buildMemoryConsolidateCronJob("invalid")).toBeNull();
      expect(buildMemoryConsolidateCronJob("")).toBeNull();
    });
  });

  describe("MEMORY_CONSOLIDATE_CRON_ID", () => {
    it("is a valid string constant", () => {
      expect(typeof MEMORY_CONSOLIDATE_CRON_ID).toBe("string");
      expect(MEMORY_CONSOLIDATE_CRON_ID).toBe("memory-consolidate");
    });
  });

  describe("consolidateMemory", () => {
    async function writeFragment(
      inboxDir: string,
      filename: string,
      content: string,
      opts: {
        type?: string;
        importance?: string;
        session?: string;
        timestamp?: string;
      } = {},
    ) {
      const {
        type = "fact",
        importance = "ephemeral",
        session = "main",
        timestamp = new Date().toISOString(),
      } = opts;

      const frontmatter = [
        "---",
        `type: ${type}`,
        `importance: ${importance}`,
        `session: ${session}`,
        `timestamp: ${timestamp}`,
        "---",
      ].join("\n");

      await fs.mkdir(inboxDir, { recursive: true });
      await fs.writeFile(
        path.join(inboxDir, filename),
        `${frontmatter}\n${content}`,
      );
    }

    it("returns empty result when inbox is empty", async () => {
      const result = await consolidateMemory({ memoryWorkspace: tempDir });
      expect(result.processed).toBe(0);
      expect(result.archived).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("processes ephemeral fragments to daily log only", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");
      const today = new Date().toISOString().split("T")[0];

      await writeFragment(inboxDir, "test.md", "Ephemeral note", {
        importance: "ephemeral",
        timestamp: new Date().toISOString(),
      });

      const result = await consolidateMemory({ memoryWorkspace: tempDir });

      expect(result.processed).toBe(1);
      expect(result.ephemeral).toBe(1);
      expect(result.persistent).toBe(0);
      expect(result.archived).toBe(1);

      // Check daily log was created
      const dailyLogPath = path.join(tempDir, "memory", `${today}.md`);
      const dailyLog = await fs.readFile(dailyLogPath, "utf-8");
      expect(dailyLog).toContain("Ephemeral note");
      expect(dailyLog).toContain("## Memory Consolidation");

      // Check memory.md was NOT updated
      const memoryMdPath = path.join(tempDir, "memory.md");
      await expect(fs.access(memoryMdPath)).rejects.toThrow();
    });

    it("processes persistent fragments to both daily log and memory.md", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");
      const today = new Date().toISOString().split("T")[0];

      await writeFragment(inboxDir, "persistent.md", "Important decision", {
        type: "decision",
        importance: "persistent",
        timestamp: new Date().toISOString(),
      });

      const result = await consolidateMemory({ memoryWorkspace: tempDir });

      expect(result.processed).toBe(1);
      expect(result.ephemeral).toBe(0);
      expect(result.persistent).toBe(1);

      // Check daily log
      const dailyLogPath = path.join(tempDir, "memory", `${today}.md`);
      const dailyLog = await fs.readFile(dailyLogPath, "utf-8");
      expect(dailyLog).toContain("Important decision");

      // Check memory.md
      const memoryMdPath = path.join(tempDir, "memory.md");
      const memoryMd = await fs.readFile(memoryMdPath, "utf-8");
      expect(memoryMd).toContain("Important decision");
      expect(memoryMd).toContain("# Long-Term Memory");
    });

    it("archives processed files", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");
      const today = new Date().toISOString().split("T")[0];

      await writeFragment(inboxDir, "test.md", "Test content");

      await consolidateMemory({ memoryWorkspace: tempDir });

      // Inbox should be empty
      const inboxFiles = await fs.readdir(inboxDir);
      expect(inboxFiles).toHaveLength(0);

      // Archive should have the file
      const archiveDir = path.join(tempDir, "memory", "archive", today);
      const archiveFiles = await fs.readdir(archiveDir);
      expect(archiveFiles).toHaveLength(1);
      expect(archiveFiles[0]).toBe("test.md");
    });

    it("handles multiple fragments from different dates", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");

      await writeFragment(inboxDir, "today.md", "Today's note", {
        timestamp: new Date().toISOString(),
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await writeFragment(inboxDir, "yesterday.md", "Yesterday's note", {
        timestamp: yesterday.toISOString(),
      });

      const result = await consolidateMemory({ memoryWorkspace: tempDir });

      expect(result.processed).toBe(2);

      // Check both daily logs exist
      const memoryDir = path.join(tempDir, "memory");
      const files = await fs.readdir(memoryDir);
      const dailyLogs = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
      expect(dailyLogs).toHaveLength(2);
    });

    it("enforces memory.md size cap", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");
      const memoryMdPath = path.join(tempDir, "memory.md");

      // Pre-populate memory.md with old entries that exceed 1% of context (~8KB)
      const header = "# Long-Term Memory\n\nPersistent facts.\n\n";
      // Create entries that are large enough to exceed 1% cap (~8KB)
      const oldEntries = Array.from({ length: 200 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - 200 + i);
        // Make each entry ~100 bytes to ensure we exceed the cap
        return `- [${date.toISOString().split("T")[0]}] [main] Old entry ${i} with some additional padding text to make it larger`;
      }).join("\n");
      await fs.mkdir(path.dirname(memoryMdPath), { recursive: true });
      await fs.writeFile(memoryMdPath, header + oldEntries + "\n");

      // Verify initial size exceeds the 1% cap
      const initialContent = await fs.readFile(memoryMdPath, "utf-8");
      const initialSize = Buffer.byteLength(initialContent, "utf-8");
      const maxBytes = Math.floor((1 / 100) * 800 * 1024); // 1% of context = ~8KB
      expect(initialSize).toBeGreaterThan(maxBytes);

      // Add a new persistent fragment
      await writeFragment(inboxDir, "new.md", "New important thing", {
        importance: "persistent",
      });

      // Use 1% max size to force eviction
      const result = await consolidateMemory({
        memoryWorkspace: tempDir,
        maxContextPercent: 1,
      });

      expect(result.processed).toBe(1);
      expect(result.evicted).toBeGreaterThan(0);

      // Verify memory.md is under the cap
      const finalContent = await fs.readFile(memoryMdPath, "utf-8");
      const finalSize = Buffer.byteLength(finalContent, "utf-8");
      expect(finalSize).toBeLessThanOrEqual(maxBytes);
    });

    it("parses all memory types correctly", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");
      const types = ["fact", "decision", "task", "insight"] as const;

      for (const type of types) {
        await writeFragment(inboxDir, `${type}.md`, `${type} content`, {
          type,
        });
      }

      const result = await consolidateMemory({ memoryWorkspace: tempDir });
      expect(result.processed).toBe(4);
    });

    it("handles parse errors gracefully", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");
      await fs.mkdir(inboxDir, { recursive: true });

      // Write a malformed file (no frontmatter)
      await fs.writeFile(path.join(inboxDir, "bad.md"), "No frontmatter here");

      // Write a valid file
      await writeFragment(inboxDir, "good.md", "Valid content");

      const result = await consolidateMemory({ memoryWorkspace: tempDir });

      expect(result.processed).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Failed to parse bad.md");
    });
  });

  describe("createMemoryConsolidateTool", () => {
    it("returns empty inbox message when nothing to process", async () => {
      const tool = createMemoryConsolidateTool({ memoryWorkspace: tempDir });
      const result = await tool.execute("call1", {});

      const details = getResultDetails(result);
      expect(details.success).toBe(true);
      expect(details.message).toContain("inbox empty");
    });

    it("returns summary after consolidation", async () => {
      const inboxDir = path.join(tempDir, "memory", "inbox");
      await fs.mkdir(inboxDir, { recursive: true });

      // Write a valid fragment
      const frontmatter = [
        "---",
        "type: fact",
        "importance: persistent",
        "session: main",
        `timestamp: ${new Date().toISOString()}`,
        "---",
      ].join("\n");
      await fs.writeFile(
        path.join(inboxDir, "test.md"),
        `${frontmatter}\nTest content`,
      );

      const tool = createMemoryConsolidateTool({ memoryWorkspace: tempDir });
      const result = await tool.execute("call1", {});

      const details = getResultDetails(result);
      expect(details.success).toBe(true);
      expect(details.message).toContain("Consolidated 1 memories");
      expect(details.processed).toBe(1);
    });
  });
});
