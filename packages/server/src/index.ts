// DeVora Web Server — satu proses: HTTP (static web) + WebSocket (voice).
//
// Browser mic → WS audio → VoiceController → SdkBridge → opencode serve
// opencode events → narrator → PiperSynthesizer(buffer) → WS wav → browser play

import { spawn, type ChildProcess } from "node:child_process"
import { createServer } from "node:net"
import { resolve } from "node:path"
import { existsSync } from "node:fs"

import { VoiceController } from "../../devora/src/conversation/controller.ts"
import { SdkBridge } from "../../devora/src/opencode/bridge.ts"
import { WhisperRecognizer } from "../../devora/src/stt/whisper.ts"
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
  const { proc: serveProc, baseUrl } = await spawnOpencode()
  const bridge = new SdkBridge(baseUrl)
  const narrator = new Narrator()

  let ws: import("bun").ServerWebSocket<unknown> | null = null

  const synth = new PiperSynthesizer({
    provider: "piper",
    voice: "id_ID-news_tts-medium",
    modelPath: resolveHome(
      process.env.DEVORA_PIPER_MODEL ?? "~/.local/share/piper/models/id/id_ID-news_tts-medium.onnx",
    ),
    configPath: resolveHome(
      process.env.DEVORA_PIPER_CONFIG ??
        "~/.local/share/piper/models/id/id_ID-news_tts-medium.onnx.json",
    ),
    output: "buffer",
    onBuffer: (wav) => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "audio", wav: wav.toString("base64") }))
    },
  })

  const recognizer = new WhisperRecognizer({
    provider: "whisper",
    language: process.env.WHISPER_LANG ?? "id",
    modelPath: resolveHome(process.env.DEVORA_WHISPER_MODEL ?? resolve(MODELS_DIR, "base.pt")),
  })

  const controller = new VoiceController({
    bridge,
    recognizer,
    synthesizer: synth,
    narrator,
    onStateChange: (snapshot: VoiceControllerState) => {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "state", snapshot }))
    },
  })

  await controller.open()

  async function handleMessage(msg: Record<string, unknown>) {
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
        if (typeof msg.text === "string") await controller.keyboardSubmit(msg.text)
        break
    }
  }

  Bun.serve<{ ws: import("bun").ServerWebSocket<unknown> | null }>({
    port: PORT,
    hostname: "0.0.0.0",
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