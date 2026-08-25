// OpenCode integration boundary (doc §8, §12). DeVora sits ON TOP of
// OpenCode via the SDK / supported TUI APIs. Two bridge implementations:
//
//   - SdkBridge  — standalone mode: talks to a `opencode serve` instance via
//                  @opencode-ai/sdk (create/ prompt/ abort/ event stream).
//   - TuiBridge  — TUI plugin mode: wraps the host-provided `api.client` +
//                  `api.event` so the same controller logic runs inside the
//                  OpenCode TUI process.
//
// Neither duplicates session state: OpenCode stays the single source of truth.

import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk/v2/client"
import { existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { homedir } from "node:os"

export type BridgeEvent = {
  type: string
  properties?: Record<string, unknown>
}

export type BridgeEventHandler = (event: BridgeEvent) => void

export type BridgeModelOption = { providerID: string; modelID: string }

export type BridgeSessionInfo = {
  id: string
  title: string
  directory: string
  created: number
  updated: number
}

export type BridgeContext = {
  directory: string | null
  mcp: Array<{ name: string; status: string }>
  skills: string[]
  models: Array<{ id: string; provider: string }>
}

export interface OpencodeBridge {
  readonly sessionId: string | null
  /** Ensure a session exists; returns the active session id. */
  connect(title?: string): Promise<string>
  /** Send a user message (text part) to the existing session; streamed. */
  sendMessage(text: string, model?: BridgeModelOption): Promise<void>
  /** Fetch latest messages (with parts) — used to recover non-streamed replies. */
  getMessages(limit?: number): Promise<Array<{ role: string; parts: Array<{ type: string; text?: string }> }>>
  /** Cancel the active OpenCode operation (POST /session/{id}/abort). */
  abort(): Promise<void>
  /** Subscribe to normalized OpenCode events. Returns unsubscribe. */
  onEvent(cb: BridgeEventHandler): () => void
  /** List all sessions for the current project directory. */
  listSessions(): Promise<BridgeSessionInfo[]>
  /** Create a session bound to a project directory; returns its id. */
  createSession(opts: { directory: string; title?: string }): Promise<string>
  /** Switch the active session without reconnecting. */
  setSession(id: string): void
  /** Fetch project context: directory, MCP status, skills, models. */
  getContext(sessionId: string, directory: string): Promise<BridgeContext>
  close(): Promise<void>
}

function scanSkillDirs(...roots: Array<string | undefined>): string[] {
  const names = new Set<string>()
  for (const root of roots) {
    if (!root) continue
    try {
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory() && existsSync(resolve(root, entry.name, "SKILL.md"))) {
          names.add(entry.name)
        }
      }
    } catch {
      /* skill root may not exist */
    }
  }
  return [...names].sort()
}

// ---------------------------------------------------------------------------
// Standalone bridge — talks HTTP to `opencode serve`
// ---------------------------------------------------------------------------

export class SdkBridge implements OpencodeBridge {
  private client: OpencodeClient | null = null
  private handlers: BridgeEventHandler[] = []
  private closed = false
  private _sessionId: string | null = null

  constructor(private readonly baseUrl: string) {}

  get sessionId() {
    return this._sessionId
  }

  async connect(title = "DeVora Voice"): Promise<string> {
    if (this.client) return this._sessionId!
    const client = createOpencodeClient({ baseUrl: this.baseUrl })
    this.client = client
    const created = await client.session.create({ title })
    const id = created.data?.id
    if (!id) throw new Error("Failed to create OpenCode session")
    this._sessionId = id
    this.startEventLoop(client).catch(() => {})
    return id
  }

  private async startEventLoop(client: OpencodeClient) {
    try {
      // No AbortSignal here: bun >= 1.4 surfaces the aborted internal hey-api
      // fetch as an unhandled rejection. Closing is driven by `this.closed`.
      const events = await client.event.subscribe()
      for await (const event of events.stream) {
        if (this.closed) break
        const { type, properties } = event as { type: string; properties?: Record<string, unknown> }
        this.handlers.forEach((cb) => cb({ type, properties }))
      }
    } catch (err) {
      if (!this.closed) {
        this.handlers.forEach((cb) => cb({ type: "bridge.error", properties: { message: String(err) } }))
      }
    }
  }

  async sendMessage(text: string, model?: BridgeModelOption): Promise<void> {
    if (!this.client || !this._sessionId) throw new Error("Bridge not connected")
    const result = await this.client.session.prompt({
      sessionID: this._sessionId,
      parts: [{ type: "text", text }],
      ...(model ? { model } : {}),
    })
    if (result.error) throw new Error(String((result.error as { message?: unknown })?.message ?? "Prompt failed"))
  }

  async listSessions(): Promise<BridgeSessionInfo[]> {
    if (!this.client) throw new Error("Bridge not connected")
    const result = await this.client.session.list({})
    const sessions = result.data ?? []
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      directory: s.directory,
      created: s.time?.created ?? 0,
      updated: s.time?.updated ?? 0,
    }))
  }

  async createSession(opts: { directory: string; title?: string }): Promise<string> {
    if (!this.client) throw new Error("Bridge not connected")
    const result = await this.client.session.create({
      directory: opts.directory,
      title: opts.title ?? "DeVora Voice",
    })
    const id = result.data?.id
    if (!id) throw new Error("Failed to create OpenCode session")
    return id
  }

  setSession(id: string): void {
    this._sessionId = id
  }

  async getContext(sessionId: string, directory: string): Promise<BridgeContext> {
    if (!this.client) throw new Error("Bridge not connected")
    const [sess, mcpRes, providersRes, configRes] = await Promise.all([
      this.client.session.get({ sessionID: sessionId, directory }),
      this.client.mcp.status({}),
      this.client.config.providers({}),
      this.client.config.get({}),
    ])
    const skills = scanSkillDirs(
      resolve(homedir(), ".config/opencode/skills"),
      directory ? resolve(directory, ".opencode/skills") : undefined,
    )
    const agentKeys = Object.keys(configRes.data?.agent ?? {})
    for (const k of agentKeys) if (!skills.includes(k)) skills.push(k)
    const models: Array<{ id: string; provider: string }> = []
    for (const p of providersRes.data?.providers ?? []) {
      for (const m of Object.values(p.models ?? {})) models.push({ id: m.id, provider: p.id })
    }
    const mcp = Object.entries(mcpRes.data ?? {}).map(([name, st]) => ({
      name,
      status: (st as { status?: string })?.status ?? "unknown",
    }))
    return { directory: sess.data?.directory ?? directory, mcp, skills, models }
  }

  async getMessages(limit = 10): Promise<Array<{ role: string; parts: Array<{ type: string; text?: string }> }>> {
    if (!this.client || !this._sessionId) return []
    const res = await this.client.session.messages({ sessionID: this._sessionId, limit })
    const data = res.data
    if (!Array.isArray(data)) return []
    return data.map((m) => {
      const info = (m as { info?: { role?: string } }).info ?? (m as { role?: string })
      const role = String(info?.role ?? "")
      const parts = (m as { parts?: Array<{ type?: string; text?: string }> }).parts ?? []
      return { role, parts: parts.map((p) => ({ type: String(p.type ?? ""), text: p.text })) }
    })
  }

  async abort(): Promise<void> {
    if (!this.client || !this._sessionId) return
    try {
      await this.client.session.abort({ sessionID: this._sessionId })
    } catch {
      /* abort is best-effort */
    }
  }

  onEvent(cb: BridgeEventHandler) {
    this.handlers.push(cb)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== cb)
    }
  }

  async close() {
    this.closed = true
    this.handlers = []
  }
}

// ---------------------------------------------------------------------------
// TUI plugin bridge — host-provided client + event bus
// ---------------------------------------------------------------------------

export type TuiClientLike = {
  session: {
    create(input: { title?: string }): Promise<{ data?: { id?: string } | null; error?: unknown }>
    prompt(input: { sessionID: string; parts: Array<{ type: string; text: string }> }): Promise<{
      data?: unknown
      error?: { message?: string } | null
    }>
    abort(input: { sessionID: string }): Promise<unknown>
  }
}

export type TuiEventBusLike = {
  on(type: string, handler: (event: { type: string; properties?: Record<string, unknown> }) => void): () => void
}

export class TuiBridge implements OpencodeBridge {
  private handlers: BridgeEventHandler[] = []
  private unsub: (() => void) | null = null
  private _sessionId: string | null = null

  constructor(
    private readonly client: TuiClientLike,
    private readonly eventBus: TuiEventBusLike,
    private readonly initialSessionId?: string,
  ) {}

  get sessionId() {
    return this._sessionId
  }

  async connect(title = "DeVora Voice"): Promise<string> {
    if (this.initialSessionId) {
      this._sessionId = this.initialSessionId
      return this._sessionId
    }
    const created = await this.client.session.create({ title })
    const id = created.data?.id
    if (!id) throw new Error("Failed to create OpenCode session")
    this._sessionId = id
    return id
  }

  async start() {
    if (this.unsub) return
    this.unsub = this.eventBus.on("*" as never, (event) => {
      const { type, properties } = event as { type: string; properties?: Record<string, unknown> }
      this.handlers.forEach((cb) => cb({ type, properties }))
    })
  }

  async sendMessage(text: string, model?: BridgeModelOption): Promise<void> {
    if (!this._sessionId) throw new Error("Bridge not connected")
    const result = await this.client.session.prompt({
      sessionID: this._sessionId,
      parts: [{ type: "text", text }],
      ...(model ? { model } : {}),
    })
    if (result.error) throw new Error(String((result.error as { message?: string })?.message ?? "Prompt failed"))
  }

  async listSessions(): Promise<BridgeSessionInfo[]> {
    throw new Error("TuiBridge does not support listSessions")
  }

  async createSession(): Promise<string> {
    throw new Error("TuiBridge does not support createSession")
  }

  setSession(_id: string): void {
    /* TUI session id is owned by the host */
  }

  async getContext(): Promise<BridgeContext> {
    return { directory: null, mcp: [], skills: [], models: [] }
  }

  async getMessages(_limit = 10): Promise<Array<{ role: string; parts: Array<{ type: string; text?: string }> }>> {
    // host client may expose messages(); otherwise the TUI state store has them
    const m = (this.client.session as { messages?: (p: { sessionID: string }) => Promise<{ data?: unknown }> }).messages
    if (!m) return []
    const res = await m({ sessionID: this._sessionId! })
    const data = res.data
    if (!Array.isArray(data)) return []
    return data.map((msg) => {
      const info = (msg as { info?: { role?: string } }).info ?? (msg as { role?: string })
      const role = String(info?.role ?? "")
      const parts = (msg as { parts?: Array<{ type?: string; text?: string }> }).parts ?? []
      return { role, parts: parts.map((p) => ({ type: String(p.type ?? ""), text: p.text })) }
    })
  }

  async abort(): Promise<void> {
    if (!this._sessionId) return
    try {
      await this.client.session.abort({ sessionID: this._sessionId })
    } catch {
      /* best-effort */
    }
  }

  onEvent(cb: BridgeEventHandler) {
    this.handlers.push(cb)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== cb)
    }
  }

  async close() {
    this.unsub?.()
    this.handlers = []
  }
}