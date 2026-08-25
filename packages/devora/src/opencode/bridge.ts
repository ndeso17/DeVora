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

export type BridgeEvent = {
  type: string
  properties?: Record<string, unknown>
}

export type BridgeEventHandler = (event: BridgeEvent) => void

export interface OpencodeBridge {
  readonly sessionId: string | null
  /** Ensure a session exists; returns the active session id. */
  connect(title?: string): Promise<string>
  /** Send a user message (text part) to the existing session; streamed. */
  sendMessage(text: string): Promise<void>
  /** Cancel the active OpenCode operation (POST /session/{id}/abort). */
  abort(): Promise<void>
  /** Subscribe to normalized OpenCode events. Returns unsubscribe. */
  onEvent(cb: BridgeEventHandler): () => void
  close(): Promise<void>
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

  async sendMessage(text: string): Promise<void> {
    if (!this.client || !this._sessionId) throw new Error("Bridge not connected")
    const result = await this.client.session.prompt({
      sessionID: this._sessionId,
      parts: [{ type: "text", text }],
    })
    if (result.error) throw new Error(String((result.error as { message?: unknown })?.message ?? "Prompt failed"))
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

  async sendMessage(text: string): Promise<void> {
    if (!this._sessionId) throw new Error("Bridge not connected")
    const result = await this.client.session.prompt({
      sessionID: this._sessionId,
      parts: [{ type: "text", text }],
    })
    if (result.error) throw new Error(String((result.error as { message?: string })?.message ?? "Prompt failed"))
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