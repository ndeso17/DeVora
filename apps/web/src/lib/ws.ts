export type Snapshot = {
  state: string
  transcript: string
  partialTranscript: string
  conversation: Array<{ role: "user" | "assistant"; text: string }>
  activity: string[]
  error: string | null
  opencodeSessionId: string | null
}

export type BridgeContext = {
  directory: string | null
  mcp: Array<{ name: string; status: string }>
  skills: string[]
  models: Array<{ id: string; provider: string }>
}

export type SessionInfo = {
  id: string
  title: string
  directory: string
  created: number
  updated: number
}

export type ModelOption = { providerID: string; modelID: string }

export type DirList = {
  path: string
  parent: string
  dirs: string[]
}

export type WsHandlers = {
  onState: (snapshot: Snapshot) => void
  onAudio: (wavB64: string) => void
  onError: (message: string) => void
  onContext: (context: BridgeContext) => void
  onSessions: (sessions: SessionInfo[]) => void
  onSessionSelected: (id: string) => void
  onConnectionChange: (connected: boolean) => void
  onDirList?: (dirList: DirList) => void
  onModel?: (model: ModelOption | null) => void
}

export class WsClient {
  private ws: WebSocket | null = null
  private handlers: WsHandlers
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closed = false

  constructor(handlers: WsHandlers) {
    this.handlers = handlers
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return
    if (this.reconnectTimer) return
    const proto = location.protocol === "https:" ? "wss" : "ws"
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    this.ws = ws
    ws.onopen = () => {
      this.handlers.onConnectionChange(true)
      this.handlers.onState({
        state: "idle",
        transcript: "",
        partialTranscript: "",
        conversation: [],
        activity: [],
        error: null,
        opencodeSessionId: null,
      })
    }
    ws.onclose = () => {
      this.handlers.onConnectionChange(false)
      this.ws = null
      if (!this.closed) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null
          this.connect()
        }, 2000)
      }
    }
    ws.onerror = () => {
      /* onclose handles reconnect */
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as {
          type: string
          snapshot?: Snapshot
          wav?: string
          message?: string
          context?: BridgeContext
          sessions?: SessionInfo[]
          sessionId?: string
          model?: ModelOption | null
        }
        if (msg.type === "state" && msg.snapshot) this.handlers.onState(msg.snapshot)
        if (msg.type === "audio" && msg.wav) this.handlers.onAudio(msg.wav)
        if (msg.type === "error" && msg.message) this.handlers.onError(msg.message)
        if (msg.type === "context" && msg.context) this.handlers.onContext(msg.context)
        if (msg.type === "sessions" && msg.sessions) this.handlers.onSessions(msg.sessions)
        if (msg.type === "session-selected" && msg.sessionId) this.handlers.onSessionSelected(msg.sessionId)
        if (
          msg.type === "dir_list" &&
          typeof (msg as { path?: string }).path === "string" &&
          Array.isArray((msg as { dirs?: unknown }).dirs)
        ) {
          this.handlers.onDirList?.(msg as unknown as DirList)
        }
        if (msg.type === "model") {
          const model = msg.model as ModelOption | null | undefined
          this.handlers.onModel?.(model ?? null)
        }
      } catch {
        /* ignore malformed */
      }
    }
  }

  send(obj: unknown) {
    this.ws?.send(JSON.stringify(obj))
  }

  start() {
    this.send({ type: "start" })
  }

  stop() {
    this.send({ type: "stop" })
  }

  feedAudio(b64: string) {
    this.send({ type: "audio", data: b64 })
  }

  interrupt() {
    this.send({ type: "interrupt" })
  }

  submit(text: string) {
    this.send({ type: "submit", text })
  }

  createSession(directory: string, title: string | undefined, model?: ModelOption) {
    this.send({ type: "create_session", directory, title, model })
  }

  setModel(model: ModelOption) {
    this.send({ type: "set_model", providerID: model.providerID, modelID: model.modelID })
  }

  selectSession(id: string, model?: ModelOption) {
    this.send({ type: "select_session", id, model })
  }

  listDir(path?: string) {
    this.send({ type: "list_dir", path })
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}
