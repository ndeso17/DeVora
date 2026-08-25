// Intelligent narration filter (doc §10, §15). Classifies OpenCode events
// into narration priority. Trivial events (file reads, ls, pwd, git status,
// simple greps, small commands, internal/debug data) are dropped; important
// events (task start, findings, changes, tests, errors, approval, completion)
// produce concise narration text.

import type { NarrationEvent, NarrationPriority } from "../types.ts"

export type OpencodeEventLike = {
  type: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

const TRIVIAL_TOOLS = new Set([
  "read_file",
  "glob",
  "grep",
  "ls",
  "pwd",
  "cat",
  "file_read",
  "list",
  "view",
])

const TRIVIAL_COMMAND_RE =
  /^(ls|pwd|cat|head|tail|echo|grep|rg|find|git status|git diff --stat|git log --oneline|whoami|uname|date)\b/

const TEST_COMMAND_RE = /(^|\s)(bun test|npm test|pnpm test|yarn test|pytest|go test|jest|vitest|flutter test|gradle test|mvn test)(\s|$)/

const BUILD_COMMAND_RE = /(^|\s)(bun build|npm run build|tsc|bun run build|go build|cargo build)(\s|$)/

export const PRIORITY_ORDER: NarrationPriority[] = [
  "critical",
  "approval",
  "error",
  "important_progress",
  "completion",
  "trivial",
]

const PRIORITY_RANK: Record<NarrationPriority, number> = {
  critical: 0,
  approval: 1,
  error: 2,
  important_progress: 3,
  completion: 4,
  trivial: 5,
}

export function priorityRank(p: NarrationPriority): number {
  return PRIORITY_RANK[p]
}

function toolNameOf(data?: Record<string, unknown>): string | undefined {
  if (!data) return undefined
  const tool = data.tool ?? data.name ?? data.tool_name
  if (typeof tool === "string") return tool
  if (tool && typeof tool === "object") {
    const t = tool as Record<string, unknown>
    if (typeof t.name === "string") return t.name
    if (typeof t.tool === "string") return t.tool
  }
  return undefined
}

function commandOf(data?: Record<string, unknown>): string | undefined {
  if (!data) return undefined
  const input = data.input ?? data.command ?? data.cmd
  if (typeof input === "string") return input
  if (input && typeof input === "object") {
    const i = input as Record<string, unknown>
    if (typeof i.command === "string") return i.command
    if (typeof i.input === "string") return i.input
  }
  return undefined
}

function concise(text: string, max = 140): string {
  const one = text.replace(/\s+/g, " ").trim()
  return one.length > max ? `${one.slice(0, max)}…` : one
}

/** Returns a narration item to speak, or null when the event is trivial. */
export function classifyNarration(event: OpencodeEventLike): NarrationEvent | null {
  const type = event.type
  const data = (event.data ?? {}) as Record<string, unknown>
  const tool = toolNameOf(data)
  const command = commandOf(data)
  const timestamp = Date.now()

  // --- approval / permission ---
  if (
    type === "session.permission.updated" ||
    type === "message.part.updated" ||
    type === "permission.requested"
  ) {
    if ((data?.partType as string ?? "") === "permission" || data?.permission !== undefined) {
      return { text: "Izin diperlukan untuk melanjutkan.", priority: "approval", timestamp }
    }
  }

  // --- errors ---
  if (
    type === "session.next.step.failed" ||
    type === "session.next.tool.failed" ||
    type === "message.updated" ||
    type === "error"
  ) {
    const errorText = concise(String(data?.error ?? data?.message ?? "Terjadi kesalahan."))
    return { text: `Error: ${errorText}`, priority: "error", timestamp, dedupKey: `error:${errorText}` }
  }

  // --- tool events ---
  if (type === "session.next.tool.called" || type === "session.next.tool.input.ended") {
    if (!tool) return null
    if (TRIVIAL_TOOLS.has(tool)) return null
    if (tool === "bash" || tool === "shell") {
      if (!command) return null
      if (TRIVIAL_COMMAND_RE.test(command.trim())) return null
      if (TEST_COMMAND_RE.test(command.trim())) {
        return { text: "Menjalankan test.", priority: "important_progress", timestamp }
      }
      if (BUILD_COMMAND_RE.test(command.trim())) {
        return { text: "Membangun project.", priority: "important_progress", timestamp }
      }
      return { text: `Menjalankan: ${concise(command)}`, priority: "important_progress", timestamp }
    }
    return { text: `Menggunakan ${tool}.`, priority: "important_progress", timestamp }
  }

  if (type === "session.next.tool.success") {
    if (!tool) return null
    if (TRIVIAL_TOOLS.has(tool)) return null
    if (tool === "bash" || tool === "shell") {
      if (command && TEST_COMMAND_RE.test(command.trim())) {
        return { text: "Test berhasil.", priority: "completion", timestamp, dedupKey: "test:success" }
      }
      if (command && BUILD_COMMAND_RE.test(command.trim())) {
        return { text: "Build berhasil.", priority: "completion", timestamp, dedupKey: "build:success" }
      }
    }
    if (tool.includes("edit") || tool === "apply_patch" || tool === "write_file") {
      return { text: "Perubahan diterapkan.", priority: "important_progress", timestamp, dedupKey: "edit:applied" }
    }
    return null
  }

  // --- text / response ---
  if (type === "session.next.text.ended") {
    const text = String(data?.text ?? "").trim()
    if (!text) return null
    return { text: concise(text), priority: "important_progress", timestamp }
  }

  // --- step lifecycle ---
  if (type === "session.next.step.started") {
    return null // avoid narrating every step start
  }

  // --- shell ---
  if (type === "session.next.shell.started") {
    const cmd = String(data?.cmd ?? data?.command ?? "").trim()
    if (!cmd || TRIVIAL_COMMAND_RE.test(cmd)) return null
    return { text: `Menjalankan: ${concise(cmd)}`, priority: "important_progress", timestamp }
  }
  if (type === "session.next.shell.ended") {
    const exit = data?.exit ?? data?.code
    if (typeof exit === "number" && exit !== 0) {
      return { text: `Perintah selesai dengan kode ${exit}.`, priority: "error", timestamp }
    }
    return null
  }

  // --- session completion ---
  if (type === "session.idle" || (type === "session.updated" && data?.status === "idle")) {
    return { text: "Selesai.", priority: "completion", timestamp, dedupKey: "session:idle" }
  }

  return null
}