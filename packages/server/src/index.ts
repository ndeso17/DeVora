// DeVora Web Server — satu proses: HTTP (static web) + WebSocket (voice).
//
// Browser mic → WS audio → VoiceController → SdkBridge → opencode serve
// opencode events → narrator → PiperSynthesizer(buffer) → WS wav → browser play

import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { resolve } from "node:path"
import { existsSync, readdirSync } from "node:fs"
import { homedir } from "node:os"

import { VoiceController } from "../../devora/src/conversation/controller.ts"
import { SdkBridge } from "../../devora/src/opencode/bridge.ts"
import type { BridgeModelOption } from "../../devora/src/opencode/bridge.ts"
import { StreamingRecognizer } from "../../devora/src/stt/stream.ts"
import { PiperSynthesizer } from "../../devora/src/tts/piper.ts"
import { Narrator } from "../../devora/src/narration/narrator.ts"
import type { VoiceControllerState } from "../../devora/src/types.ts"

const PROJECT = resolve(process.env.PROJECT ?? process.cwd())
const PORT = parseInt(process.env.PORT ?? "3000", 10)
const STATIC_DIR = resolve(import.meta.dir, "../../../apps/web/dist")
const MODELS_DIR = resolve(import.meta.dir, "../../../models")

function resolveHome(p: string): string {
  if (p === "~") return process.env.HOME ?? p
  if (p.startsWith("~/")) return resolve(process.env.HOME ?? "/", p.slice(2))
  return p
}

function piperModelPath(): string {
  const candidates = [
    resolveHome("~/.local/share/piper/models/id/id_ID-news_tts-medium.onnx"),
    "/opt/piper-models/id/id_ID-news_tts-medium.onnx",
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return candidates[0]!
}

function findOpencodeBin(): string {
  const env = process.env.OPENCODE_BIN
  if (env) return resolveHome(env)
  const candidates = [
    "opencode",
    resolveHome("~/.opencode/bin/opencode"),
    "/usr/local/bin/opencode",
  ]
  for (const c of candidates) {
    try {
      const res = Bun.spawnSync({ cmd: ["bash", "-lc", `command -v "${c}"`], stdout: "pipe" })
      const out = new TextDecoder().decode(res.stdout).trim()
      if (res.exitCode === 0 && out) return out
    } catch {
      /* keep looking */
    }
  }
  return "opencode"
}

async function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port
      srv.close(() => res(port))
    })
    srv.on("error", rej)
  })
}

async function spawnOpencode(): Promise<{ proc: ChildProcess; baseUrl: string }> {
  const port = await freePort()
  const bin = findOpencodeBin()
  const proc = spawn(bin, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: PROJECT,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const baseUrl = await new Promise<string>((resolveUrl, reject) => {
    let out = ""
    const t = setTimeout(() => reject(new Error(`opencode serve timeout. stdout:\n${out}`)), 30_000)
    proc.stdout.on("data", (c: Buffer) => {
      out += c.toString()
      const m = out.match(/https?:\/\/127\.0\.0\.1:\d+/)
      if (m) {
        clearTimeout(t)
        resolveUrl(m[0])
      }
    })
    proc.on("exit", (code) => {
      clearTimeout(t)
      reject(new Error(`opencode serve exited with ${code}`))
    })
  })
  console.error(`[devora] opencode serve: ${baseUrl}`)
  return { proc, baseUrl }
}

async function main() {
  // ensure piper/opencode are resolvable regardless of shell PATH
  const homeBin = resolveHome("~/.local/bin")
  const localBin = "/usr/local/bin"
  if (!process.env.PATH?.includes(homeBin)) {
    process.env.PATH = `${homeBin}:${localBin}:${process.env.PATH ?? ""}`
  }
  const { proc: serveProc, baseUrl } = await spawnOpencode()
  const bridge = new SdkBridge(baseUrl)
  const narrator = new Narrator()

  let ws: import("bun").ServerWebSocket<unknown> | null = null
  let currentModel: BridgeModelOption | null = null
  let currentDirectory: string | null = null

  function wsSend(obj: unknown) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj))
  }

  async function sendContext() {
    const sid = bridge.sessionId
    if (!sid) return
    const dir = currentDirectory ?? PROJECT
    try {
      const context = await bridge.getContext(sid, dir)
      wsSend({ type: "context", context })
    } catch (err) {
      console.error(`[devora] context error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function sendSessions() {
    try {
      const sessions = await bridge.listSessions()
      wsSend({ type: "sessions", sessions })
    } catch (err) {
      console.error(`[devora] sessions error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function applyModel(model: unknown) {
    if (typeof model !== "object" || model === null) return
    const m = model as Record<string, unknown>
    if (typeof m.providerID === "string" && typeof m.modelID === "string") {
      currentModel = { providerID: m.providerID, modelID: m.modelID }
      controller.setDefaultModel(currentModel)
    }
  }

  const synth = new PiperSynthesizer({
    provider: "piper",
    voice: "id_ID-news_tts-medium",
    modelPath: resolveHome(
      process.env.DEVORA_PIPER_MODEL ?? piperModelPath(),
    ),
    configPath: resolveHome(
      process.env.DEVORA_PIPER_CONFIG ?? `${piperModelPath()}.json`,
    ),
    output: "buffer",
    onBuffer: (wav) => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "audio", wav: wav.toString("base64") }))
    },
  })

  const recognizer = new StreamingRecognizer({
    provider: "stream",
    language: process.env.WHISPER_LANG ?? "id",
    modelPath: resolveHome(process.env.DEVORA_STT_MODEL ?? resolve(MODELS_DIR, "faster-whisper-base")),
    trailingMs: parseInt(process.env.STT_TRAILING_MS ?? "2000", 10),
  })

  const controller = new VoiceController({
    bridge,
    recognizer,
    synthesizer: synth,
    narrator,
    vadConfig: { maxSilenceMs: 3000 },
    onStateChange: (snapshot: VoiceControllerState) => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "state", snapshot }))
    },
  })

  bridge.onEvent((ev) => {
    const t = ev.type
    if (t === "message.updated" || t === "message.part.updated" || t === "session.idle" || t === "session.updated" || t === "session.next.text.ended") {
      const p = ev.properties as Record<string, unknown>
      console.error(`[devora] evt ${t}:`, JSON.stringify({
        role: (p.info as { role?: string } | undefined)?.role,
        partType: (p.part as { type?: string } | undefined)?.type,
        partText: (p.part as { text?: string } | undefined)?.text?.slice(0, 40),
        partEnd: (p.part as { time?: { end?: unknown } } | undefined)?.time?.end !== undefined,
        status: (p.info as { status?: string } | undefined)?.status,
      }).slice(0, 200))
    }
  })

  await controller.open()

  async function handleMessage(msg: Record<string, unknown>) {
    console.error(`[devora] ws msg: ${JSON.stringify({ type: msg.type, text: typeof msg.text === "string" ? msg.text.slice(0, 40) : undefined })}`)
    switch (msg.type) {
      case "start":
        await controller.startListening()
        break
      case "stop":
        await controller.stopListening()
        break
      case "audio":
        if (typeof msg.data === "string") controller.feedAudio(Buffer.from(msg.data, "base64"))
        break
      case "interrupt":
        await controller.interrupt()
        break
      case "submit":
        if (typeof msg.text === "string") {
          try {
            await controller.keyboardSubmit(msg.text)
          } catch (err) {
            console.error(`[devora] submit error: ${err instanceof Error ? err.stack : String(err)}`)
          }
        }
        break
      case "create_session": {
        const dir = typeof msg.directory === "string" ? msg.directory : PROJECT
        try {
          const id = await bridge.createSession({
            directory: dir,
            title: typeof msg.title === "string" ? msg.title : undefined,
          })
          bridge.setSession(id)
          currentDirectory = dir
          applyModel(msg.model)
          wsSend({ type: "session-selected", sessionId: id })
          await sendContext()
          await sendSessions()
        } catch (err) {
          console.error(`[devora] create_session error: ${err instanceof Error ? err.stack : String(err)}`)
          wsSend({ type: "error", message: `Gagal buat sesi: ${err instanceof Error ? err.message : String(err)}` })
        }
        break
      }
      case "select_session":
        if (typeof msg.id === "string") {
          bridge.setSession(msg.id)
          applyModel(msg.model)
          wsSend({ type: "session-selected", sessionId: msg.id })
          await sendContext()
        }
        break
      case "set_model":
        applyModel(msg)
        wsSend({ type: "model", model: currentModel })
        break
      case "list_dir": {
        const base = typeof msg.path === "string" && msg.path ? msg.path : homedir()
        try {
          const entries = readdirSync(base, { withFileTypes: true })
          const dirs = entries
            .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
            .map((e) => resolve(base, e.name))
            .sort((a, b) => a.localeCompare(b))
          wsSend({ type: "dir_list", path: base, parent: resolve(base, ".."), dirs })
        } catch (err) {
          wsSend({ type: "error", message: `Tidak bisa baca folder: ${err instanceof Error ? err.message : String(err)}` })
        }
        break
      }
    }
  }

  const tlsCert = process.env.DEVORA_TLS_CERT
  const tlsKey = process.env.DEVORA_TLS_KEY
  const tls = tlsCert && tlsKey ? { cert: Bun.file(resolveHome(tlsCert)), key: Bun.file(resolveHome(tlsKey)) } : undefined

  Bun.serve<{ ws: import("bun").ServerWebSocket<unknown> | null }>({
    port: PORT,
    hostname: "0.0.0.0",
    ...(tls ? { tls } : {}),
    async fetch(req, server) {
      const url = new URL(req.url)

      if (url.pathname === "/ws") {
        const ok = server.upgrade(req)
        if (ok) return undefined
        return new Response("WS upgrade failed", { status: 400 })
      }

      let filePath = resolve(STATIC_DIR, url.pathname === "/" ? "index.html" : url.pathname.slice(1))
      if (!existsSync(filePath)) filePath = resolve(STATIC_DIR, "index.html")
      const file = Bun.file(filePath)
      if (await file.exists()) return new Response(file)
      return new Response("Not found", { status: 404 })
    },
    websocket: {
      open(ws_) {
        ws = ws_
        ws.send(JSON.stringify({ type: "state", snapshot: controller.getSnapshot() }))
        wsSend({ type: "model", model: currentModel })
        void sendContext()
        void sendSessions()
      },
      message(ws_, raw) {
        try {
          const msg = JSON.parse(String(raw)) as Record<string, unknown>
          void handleMessage(msg)
        } catch (err) {
          ws_.send(JSON.stringify({ type: "error", message: String(err) }))
        }
      },
      close() {
        if (ws) ws = null
        void controller.stopListening()
      },
    },
  })

  console.error(`[devora] web: http://127.0.0.1:${PORT}  ws: /ws`)

  const shutdown = async () => {
    await controller.dispose().catch(() => {})
    serveProc.kill("SIGTERM")
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())
}

main().catch((err) => {
  console.error(`[devora] fatal: ${err.message}`)
  process.exit(1)
})