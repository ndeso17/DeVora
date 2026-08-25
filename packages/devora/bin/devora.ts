// DeVora standalone CLI — headless voice mode for `opencode serve`.
//
// Spawns `opencode serve`, connects via the SDK bridge, and runs the same
// voice engine (mic → VAD → STT → OpenCode → narration → TTS) with an ANSI
// voice screen. Keyboard fallback: type a line + Enter to submit, Esc to exit,
// Ctrl+C to stop.
//
// Usage:
//   bun run bin/devora.ts [--project DIR] [--stt vosk|whisper] [--lang id|en]
//                         [--keyboard]

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer } from "node:net"
import { resolve } from "node:path"
import { createAudioCapture } from "../src/audio/capture.ts"
import { WhisperRecognizer } from "../src/stt/whisper.ts"
import { VoskRecognizer } from "../src/stt/vosk.ts"
import { PiperSynthesizer } from "../src/tts/piper.ts"
import { Narrator } from "../src/narration/narrator.ts"
import { SdkBridge } from "../src/opencode/bridge.ts"
import { VoiceController } from "../src/conversation/controller.ts"
import type { SpeechRecognizer } from "../src/stt/client.ts"
import type { VoiceControllerState } from "../src/types.ts"

type CliArgs = {
  project: string
  stt: "vosk" | "whisper"
  lang: string
  keyboard: boolean
}

function resolveHome(path: string): string {
  if (path === "~") return process.env.HOME ?? path
  if (path.startsWith("~/")) return resolve(process.env.HOME ?? "/", path.slice(2))
  return path
}

function findOpencodeBin(): string {
  const env = process.env.OPENCODE_BIN
  if (env) return resolveHome(env)
  const candidates = [
    "opencode",
    resolveHome("~/.opencode/bin/opencode"),
    "/usr/local/bin/opencode",
    "/opt/opencode/bin/opencode",
  ]
  for (const c of candidates) {
    try {
      const res = spawnSync("bash", ["-lc", `command -v "${c}"`], { encoding: "utf8" })
      if (res.status === 0 && res.stdout.trim()) return res.stdout.trim()
    } catch {
      /* keep looking */
    }
  }
  return "opencode"
}

function findPiperModel(): { modelPath: string; configPath: string } {
  const modelEnv = process.env.DEVORA_PIPER_MODEL
  if (modelEnv) {
    return {
      modelPath: resolveHome(modelEnv),
      configPath: resolveHome(process.env.DEVORA_PIPER_CONFIG ?? `${modelEnv}.json`),
    }
  }
  const candidates = [
    resolveHome("~/.local/share/piper/models/id/id_ID-news_tts-medium.onnx"),
    "/home/ndeso17/.local/share/piper/models/id/id_ID-news_tts-medium.onnx",
    "/opt/piper-models/id/id_ID-news_tts-medium.onnx",
    "/usr/share/piper-voices/id/id_ID-news_tts-medium.onnx",
  ]
  for (const c of candidates) {
    try {
      if (existsSync(c)) return { modelPath: c, configPath: `${c}.json` }
    } catch {
      /* keep looking */
    }
  }
  // last resort — still attempt piper with this path so the error surfaces
  return { modelPath: candidates[0]!, configPath: `${candidates[0]}.json` }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { project: process.cwd(), stt: "whisper", lang: "id", keyboard: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--project") args.project = resolve(resolveHome(argv[++i] ?? "."))
    else if (a === "--stt") args.stt = (argv[++i] ?? "whisper") as CliArgs["stt"]
    else if (a === "--lang") args.lang = argv[++i] ?? "id"
    else if (a === "--keyboard") args.keyboard = true
  }
  return args
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

async function spawnServe(project: string): Promise<{ proc: ChildProcess; baseUrl: string }> {
  const opencodeBin = findOpencodeBin()
  if (opencodeBin === "opencode") {
    const probe = spawnSync("bash", ["-lc", "command -v opencode"], { encoding: "utf8" })
    if (probe.status !== 0 || !probe.stdout.trim()) {
      throw new Error(
        "opencode binary tidak ditemukan. Set OPENCODE_BIN=/path/ke/opencode atau tambahkan ke PATH.",
      )
    }
  }
  const port = await freePort()
  const proc = spawn(opencodeBin, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: project,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const baseUrl = await new Promise<string>((resolveUrl, reject) => {
    let out = ""
    const timer = setTimeout(() => reject(new Error(`opencode serve did not respond. stdout:\n${out}`)), 20_000)
    proc.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString()
      const m = out.match(/https?:\/\/127\.0\.0\.1:\d+/)
      if (m) {
        clearTimeout(timer)
        resolveUrl(m[0])
      }
    })
    proc.on("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`opencode serve exited early with code ${code}`))
    })
  })
  return { proc, baseUrl }
}

// ---------------------------------------------------------------------------
// ANSI voice screen
// ---------------------------------------------------------------------------

const STATE_ICON: Record<string, string> = {
  idle: "·",
  listening: "🎙",
  transcribing: "…",
  submitting: "→",
  working: "⚙",
  speaking: "🔊",
  interrupting: "⏹",
  error: "!",
}

function render(snap: VoiceControllerState, input: string): string {
  const lines: string[] = []
  lines.push("\x1b[2J\x1b[H")
  lines.push(`\x1b[1mDeVora Voice\x1b[0m  Session: ${snap.opencodeSessionId ?? "—"}`)
  lines.push("─".repeat(60))
  lines.push(`${STATE_ICON[snap.state] ?? "·"} \x1b[1m${snap.state.toUpperCase()}\x1b[0m`)
  if (snap.error) lines.push(`\x1b[31m! ${snap.error}\x1b[0m`)
  if (snap.partialTranscript) lines.push(`\x1b[2m"${snap.partialTranscript}…"\x1b[0m`)
  lines.push("─".repeat(60))
  for (const msg of snap.conversation.slice(-8)) {
    lines.push(`\x1b[1m${msg.role === "user" ? "You" : "DeVora"}\x1b[0m`)
    lines.push(`  "${msg.text}"`)
  }
  lines.push("─".repeat(60))
  for (const act of snap.activity.slice(-6)) lines.push(`\x1b[2m${act}\x1b[0m`)
  lines.push("─".repeat(60))
  lines.push(`\x1b[2mType: \x1b[0m${input || ""}█`)
  lines.push(`\x1b[2mEnter submit · Esc exit · Ctrl+C stop\x1b[0m`)
  return lines.join("\n")
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))

  console.error(`[devora] starting opencode serve in ${args.project} …`)
  const { proc: serveProc, baseUrl } = await spawnServe(args.project)
  console.error(`[devora] opencode serve: ${baseUrl}`)

  const bridge = new SdkBridge(baseUrl)
  const narrator = new Narrator()

  const recognizer: SpeechRecognizer =
    args.stt === "vosk"
      ? new VoskRecognizer({ provider: "vosk", language: "en" })
      : new WhisperRecognizer({ provider: "whisper", language: args.lang })

  const piperModel = findPiperModel()
  const synthesizer = new PiperSynthesizer({
    provider: "piper",
    voice: "id_ID-news_tts-medium",
    modelPath: piperModel.modelPath,
    configPath: piperModel.configPath,
    sampleRate: 22050,
  })

  let snap: VoiceControllerState = {
    state: "idle",
    transcript: "",
    partialTranscript: "",
    conversation: [],
    activity: [],
    error: null,
    opencodeSessionId: null,
  }
  let input = ""

  const controller = new VoiceController({
    bridge,
    recognizer,
    synthesizer,
    narrator,
    capture: args.keyboard ? undefined : createAudioCapture({ onData: (chunk) => controller.feedAudio(chunk) }),
    onStateChange: (s) => {
      snap = s
      process.stdout.write(render(s, input))
    },
  })

  // keyboard fallback: raw-mode input (skip when stdin is not a TTY — e.g.
  // piped/headless runs used for testing the pipeline)
  const isTty = Boolean(process.stdin.isTTY)
  if (isTty) process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding("utf8")
  process.stdin.on("data", (chunk: string) => {
    for (const ch of chunk) {
      if (ch === "\x1b") {
        void shutdown()
        return
      }
      if (ch === "\x03") {
        void controller.interrupt()
        continue
      }
      if (ch === "\r" || ch === "\n") {
        if (input.trim()) {
          const line = input
          input = ""
          void controller.keyboardSubmit(line)
        }
        continue
      }
      if (ch === "\x7f" || ch === "\b") {
        input = input.slice(0, -1)
        continue
      }
      if (ch >= " ") {
        input += ch
      }
    }
    process.stdout.write(render(snap, input))
  })

  let shuttingDown = false
  async function shutdown() {
    if (shuttingDown) return
    shuttingDown = true
    if (isTty) process.stdin.setRawMode(false)
    await controller.dispose()
    serveProc.kill("SIGTERM")
    process.exit(0)
  }
  process.on("SIGINT", () => void shutdown())
  process.on("SIGTERM", () => void shutdown())

  await controller.open()
  process.stdout.write(render(snap, input))
  await controller.startListening()
}

main().catch((err) => {
  console.error(`[devora] fatal: ${err.message}`)
  process.exit(1)
})