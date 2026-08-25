import { describe, expect, test } from "bun:test"
import { classifyNarration } from "../src/narration/filter.ts"

describe("classifyNarration — doc §10 rules", () => {
  test("file reads are silent (trivial)", () => {
    expect(classifyNarration({ type: "session.next.tool.called", data: { tool: "read_file", input: {} } })).toBeNull()
    expect(classifyNarration({ type: "session.next.tool.called", data: { tool: "grep", input: {} } })).toBeNull()
    expect(classifyNarration({ type: "session.next.tool.called", data: { tool: "glob", input: {} } })).toBeNull()
  })

  test("ls / pwd / git status shell commands are silent", () => {
    for (const cmd of ["ls -la", "pwd", "git status"]) {
      expect(
        classifyNarration({ type: "session.next.tool.called", data: { tool: "bash", input: { command: cmd } } }),
      ).toBeNull()
      expect(classifyNarration({ type: "session.next.shell.started", data: { cmd } })).toBeNull()
    }
  })

  test("running tests is narrated as progress", () => {
    const item = classifyNarration({
      type: "session.next.tool.called",
      data: { tool: "bash", input: { command: "bun test packages/devora" } },
    })
    expect(item?.priority).toBe("important_progress")
    expect(item?.text.toLowerCase()).toContain("test")
  })

  test("test success narrated as completion", () => {
    const item = classifyNarration({
      type: "session.next.tool.success",
      data: { tool: "bash", input: { command: "npm test" } },
    })
    expect(item?.priority).toBe("completion")
  })

  test("build commands narrated", () => {
    const item = classifyNarration({
      type: "session.next.tool.called",
      data: { tool: "bash", input: { command: "tsc --noEmit" } },
    })
    expect(item?.priority).toBe("important_progress")
  })

  test("tool failure → error priority", () => {
    const item = classifyNarration({ type: "session.next.tool.failed", data: { error: "boom" } })
    expect(item?.priority).toBe("error")
  })

  test("step failed → error priority", () => {
    const item = classifyNarration({ type: "session.next.step.failed", data: {} })
    expect(item?.priority).toBe("error")
  })

  test("permission request → approval", () => {
    const item = classifyNarration({ type: "session.permission.updated", data: { permission: {} } })
    expect(item?.priority).toBe("approval")
  })

  test("session idle → completion 'Selesai.' with dedup key", () => {
    const item = classifyNarration({ type: "session.idle", data: {} })
    expect(item?.priority).toBe("completion")
    expect(item?.dedupKey).toBe("session:idle")
  })

  test("final assistant text is narrated concisely", () => {
    const long = "a".repeat(300)
    const item = classifyNarration({ type: "session.next.text.ended", data: { text: long } })
    expect(item).not.toBeNull()
    expect((item?.text.length ?? 0)).toBeLessThanOrEqual(141)
  })

  test("unknown/internal events default to null (silent)", () => {
    expect(classifyNarration({ type: "session.next.context.updated", data: {} })).toBeNull()
    expect(classifyNarration({ type: "session.next.compaction.delta", data: {} })).toBeNull()
    expect(classifyNarration({ type: "message.updated", data: {} })).not.toBeNull() // treated as error info
  })
})
