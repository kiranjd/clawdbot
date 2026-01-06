import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRememberTool } from "./remember-tool.js";

describe("remember tool", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "remember-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function getResultDetails(result: { details?: unknown }): Record<string, unknown> {
    return result.details as Record<string, unknown>;
  }

  it("writes memory fragment to inbox", async () => {
    const tool = createRememberTool({
      sessionKey: "main",
      memoryWorkspace: tempDir,
    });

    const result = await tool.execute("call1", {
      content: "User prefers dark mode",
      type: "fact",
      importance: "persistent",
    });

    const details = getResultDetails(result);
    expect(details.success).toBe(true);
    expect(details.type).toBe("fact");
    expect(details.importance).toBe("persistent");
    expect(details.filename).toMatch(/^\d+_[a-f0-9]+\.md$/);

    // Verify file was created
    const inboxDir = path.join(tempDir, "memory", "inbox");
    const files = await fs.readdir(inboxDir);
    expect(files).toHaveLength(1);

    // Verify file content
    const fileContent = await fs.readFile(
      path.join(inboxDir, files[0]),
      "utf-8",
    );
    expect(fileContent).toContain("type: fact");
    expect(fileContent).toContain("importance: persistent");
    expect(fileContent).toContain("session: main");
    expect(fileContent).toContain("User prefers dark mode");
  });

  it("defaults to fact type and ephemeral importance", async () => {
    const tool = createRememberTool({
      sessionKey: "telegram:group:-123456",
      sessionDisplayName: "Deep Work",
      memoryWorkspace: tempDir,
    });

    const result = await tool.execute("call1", {
      content: "Discussed API design",
    });

    const details = getResultDetails(result);
    expect(details.success).toBe(true);
    expect(details.type).toBe("fact");
    expect(details.importance).toBe("ephemeral");

    // Verify sessionName is included
    const inboxDir = path.join(tempDir, "memory", "inbox");
    const files = await fs.readdir(inboxDir);
    const fileContent = await fs.readFile(
      path.join(inboxDir, files[0]),
      "utf-8",
    );
    expect(fileContent).toContain('sessionName: "Deep Work"');
  });

  it("creates inbox directory if missing", async () => {
    const tool = createRememberTool({
      sessionKey: "main",
      memoryWorkspace: path.join(tempDir, "new-workspace"),
    });

    await tool.execute("call1", { content: "Test content" });

    const inboxPath = path.join(tempDir, "new-workspace", "memory", "inbox");
    const stat = await fs.stat(inboxPath);
    expect(stat.isDirectory()).toBe(true);
  });

  it("handles all memory types", async () => {
    const tool = createRememberTool({
      sessionKey: "main",
      memoryWorkspace: tempDir,
    });

    const types = ["fact", "decision", "task", "insight"] as const;
    for (const type of types) {
      const result = await tool.execute(`call-${type}`, {
        content: `Test ${type}`,
        type,
      });
      const details = getResultDetails(result);
      expect(details.type).toBe(type);
    }

    const inboxDir = path.join(tempDir, "memory", "inbox");
    const files = await fs.readdir(inboxDir);
    expect(files).toHaveLength(4);
  });

  it("truncates long content in message preview", async () => {
    const tool = createRememberTool({
      sessionKey: "main",
      memoryWorkspace: tempDir,
    });

    const longContent = "A".repeat(100);
    const result = await tool.execute("call1", { content: longContent });

    const details = getResultDetails(result);
    expect(details.message).toContain("...");
    expect(details.message).not.toContain(longContent);
  });

  it("expands tilde in workspace path", async () => {
    // Mock homedir to use our temp dir
    vi.spyOn(os, "homedir").mockReturnValue(tempDir);

    try {
      const tool = createRememberTool({
        sessionKey: "main",
        memoryWorkspace: "~/test-memory",
      });

      await tool.execute("call1", { content: "Test" });

      const inboxPath = path.join(tempDir, "test-memory", "memory", "inbox");
      const files = await fs.readdir(inboxPath);
      expect(files).toHaveLength(1);
    } finally {
      vi.mocked(os.homedir).mockRestore();
    }
  });

  it("returns error on write failure", async () => {
    const tool = createRememberTool({
      sessionKey: "main",
      memoryWorkspace: "/nonexistent/path/that/should/fail",
    });

    const result = await tool.execute("call1", { content: "Test" });
    const details = getResultDetails(result);
    expect(details.success).toBe(false);
    expect(details.error).toContain("Failed to write memory");
  });

  it("throws on empty content", async () => {
    const tool = createRememberTool({
      sessionKey: "main",
      memoryWorkspace: tempDir,
    });

    await expect(tool.execute("call1", { content: "" })).rejects.toThrow();
  });
});
