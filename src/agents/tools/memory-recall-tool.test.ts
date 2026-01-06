import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecallTool } from "./memory-recall-tool.js";

describe("memory recall tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "recall-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function getResultDetails(result: { details?: unknown }): Record<string, unknown> {
    return result.details as Record<string, unknown>;
  }

  async function writeMemoryMd(content: string) {
    const memoryMdPath = path.join(tempDir, "memory.md");
    await fs.writeFile(memoryMdPath, content);
  }

  async function writeDailyLog(date: string, content: string) {
    const memoryDir = path.join(tempDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });
    await fs.writeFile(path.join(memoryDir, `${date}.md`), content);
  }

  it("returns empty results when no memories exist", async () => {
    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", { query: "test" });

    const details = getResultDetails(result);
    expect(details.success).toBe(true);
    expect(details.matches).toHaveLength(0);
    expect(details.message).toContain("No memories found");
  });

  it("searches memory.md for persistent scope", async () => {
    await writeMemoryMd(`# Long-Term Memory

- [2026-01-01] [main] User prefers dark mode
- [2026-01-02] [main] Favorite color is blue
`);

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", {
      query: "dark mode",
      scope: "persistent",
    });

    const details = getResultDetails(result);
    expect(details.success).toBe(true);
    expect(details.count).toBe(1);
    const matches = details.matches as Array<{ content: string; source: string }>;
    expect(matches[0].content).toContain("dark mode");
    expect(matches[0].source).toBe("memory.md");
  });

  it("searches daily logs for daily scope", async () => {
    const today = new Date().toISOString().split("T")[0];
    await writeDailyLog(
      today,
      `# ${today}

## Memory Consolidation

- 📝 **10:30** [main] Discussed API design
- ✅ **14:00** [main] Decided to use JWT tokens
`,
    );

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", {
      query: "JWT",
      scope: "daily",
    });

    const details = getResultDetails(result);
    expect(details.success).toBe(true);
    expect(details.count).toBe(1);
    const matches = details.matches as Array<{ content: string; source: string }>;
    expect(matches[0].content).toContain("JWT");
    expect(matches[0].source).toBe(`${today}.md`);
  });

  it("searches both scopes for all (default)", async () => {
    const today = new Date().toISOString().split("T")[0];

    await writeMemoryMd(`# Long-Term Memory

- [2026-01-01] [main] Authentication uses JWT tokens
`);

    await writeDailyLog(
      today,
      `# ${today}

- 📝 **10:30** [main] Updated JWT refresh flow
`,
    );

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", { query: "JWT" });

    const details = getResultDetails(result);
    expect(details.success).toBe(true);
    expect(details.count).toBe(2);

    const matches = details.matches as Array<{ source: string }>;
    const sources = matches.map((m) => m.source);
    expect(sources).toContain("memory.md");
    expect(sources).toContain(`${today}.md`);
  });

  it("performs case-insensitive search", async () => {
    await writeMemoryMd(`# Long-Term Memory

- [2026-01-01] [main] Prefers DARK MODE
`);

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", { query: "dark mode" });

    const details = getResultDetails(result);
    expect(details.count).toBe(1);
  });

  it("respects limit parameter", async () => {
    await writeMemoryMd(`# Long-Term Memory

- [2026-01-01] [main] Memory one test
- [2026-01-02] [main] Memory two test
- [2026-01-03] [main] Memory three test
- [2026-01-04] [main] Memory four test
- [2026-01-05] [main] Memory five test
`);

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", { query: "test", limit: 2 });

    const details = getResultDetails(result);
    expect(details.count).toBe(5);
    expect(details.showing).toBe(2);
    const matches = details.matches as Array<unknown>;
    expect(matches).toHaveLength(2);
    expect(details.message).toContain("showing 2");
  });

  it("clamps limit to maximum 50", async () => {
    await writeMemoryMd(`# Long-Term Memory

- [2026-01-01] [main] Test entry
`);

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", { query: "test", limit: 100 });

    const details = getResultDetails(result);
    // Should not error, limit is clamped internally
    expect(details.success).toBe(true);
  });

  it("includes context lines in results", async () => {
    await writeMemoryMd(`# Long-Term Memory

Line before the match
- [2026-01-01] [main] Target line with keyword
Line after the match
`);

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", { query: "keyword" });

    const details = getResultDetails(result);
    const matches = details.matches as Array<{ context?: string }>;
    expect(matches[0].context).toBeDefined();
    expect(matches[0].context).toContain("Line before");
    expect(matches[0].context).toContain("Line after");
  });

  it("only searches last 7 daily log files", async () => {
    // Create 8 daily log files (the 8th oldest should not be searched)
    for (let i = 0; i < 8; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const content =
        i === 7
          ? `# ${dateStr}\n\n- 📝 **10:30** [main] Old entry with unique-keyword-xyz\n`
          : `# ${dateStr}\n\n- 📝 **10:30** [main] Recent entry ${i}\n`;
      await writeDailyLog(dateStr, content);
    }

    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });
    const result = await tool.execute("call1", {
      query: "unique-keyword-xyz",
      scope: "daily",
    });

    const details = getResultDetails(result);
    // The 8th file (oldest) should not be searched
    expect(details.count).toBe(0);
  });

  it("expands tilde in workspace path", async () => {
    vi.spyOn(os, "homedir").mockReturnValue(tempDir);

    try {
      const memoryMdPath = path.join(tempDir, "test-memory", "memory.md");
      await fs.mkdir(path.dirname(memoryMdPath), { recursive: true });
      await fs.writeFile(memoryMdPath, "- [2026-01-01] [main] Test content\n");

      const tool = createMemoryRecallTool({ memoryWorkspace: "~/test-memory" });
      const result = await tool.execute("call1", { query: "Test" });

      const details = getResultDetails(result);
      expect(details.count).toBe(1);
    } finally {
      vi.mocked(os.homedir).mockRestore();
    }
  });

  it("handles missing memory directory gracefully", async () => {
    const tool = createMemoryRecallTool({
      memoryWorkspace: path.join(tempDir, "nonexistent"),
    });
    const result = await tool.execute("call1", { query: "test" });

    const details = getResultDetails(result);
    expect(details.success).toBe(true);
    expect(details.count).toBe(0);
  });

  it("throws on empty query", async () => {
    const tool = createMemoryRecallTool({ memoryWorkspace: tempDir });

    await expect(tool.execute("call1", { query: "" })).rejects.toThrow();
  });
});
