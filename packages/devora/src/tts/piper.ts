// Piper TTS — local neural TTS (Indonesian voice available:
// id_ID-news_tts-medium).
//
// Two output modes:
//   - "speaker": pipes piper raw PCM into aplay (terminal/CLI mode)
//   - "buffer":  captures the WAV and hands it to onBuffer (web mode)
//
// Interruption = kill the processes (target < 300 ms) or resolve the pending
// speak() immediately.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { readFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SpeechSynthesizer } from "./client.ts"
import type { SpeechSynthesizerConfig } from "../types.ts"

export class PiperSynthesizer implements SpeechSynthesizer {
  readonly available = true
  private piperProc: ChildProcessWithoutNullStreams | null = null
  private playProc: ChildProcessWithoutNullStreams | null = null
  private settle: (() => void) | null = null
  private errorCbs: ((message: string) => void)[] = []
  private stopped = false
  private readonly model: string
  private readonly config: string
  private readonly sampleRate: number
  private readonly output: "speaker" | "buffer"
  private readonly onBuffer?: (wav: Buffer) => void
  private bufferPath: string | null = null

  constructor(cfg: SpeechSynthesizerConfig) {
    this.model = cfg.modelPath
    this.config = cfg.configPath
    this.sampleRate = cfg.sampleRate ?? 22050
    this.output = cfg.output ?? "speaker"
    this.onBuffer = cfg.onBuffer
  }

  onError(cb: (message: string) => void) {
    this.errorCbs.push(cb)
  }

  speak(text: string): Promise<void> {
    if (!text.trim()) return Promise.resolve()
    this.stopped = false
    return new Promise((resolve) => {
      try {
        const piperArgs = ["--model", this.model, "--config", this.config]
        let aplay: ChildProcessWithoutNullStreams | null = null
        if (this.output === "speaker") {
          piperArgs.push("--output_raw")
          aplay = spawn("aplay", ["-q", "-t", "raw", "-f", "S16_LE", "-r", String(this.sampleRate), "-c", "1"])
          this.playProc = aplay
        } else {
          this.bufferPath = join(tmpdir(), `devora-tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`)
          piperArgs.push("--output_file", this.bufferPath)
        }

        const piper = spawn("piper", piperArgs)
        this.piperProc = piper
        if (aplay) piper.stdout.pipe(aplay.stdin)
        piper.stdin.write(text + "\n")
        piper.stdin.end()

        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          this.piperProc = null
          this.playProc = null
          this.bufferPath = null
          this.settle = null
          resolve()
        }
        this.settle = done

        const emitError = (msg: string) => this.errorCbs.forEach((cb) => cb(msg))

        piper.once("exit", async (code) => {
          if (code !== 0 && !this.stopped) emitError(`piper exited with code ${code}`)
          if (this.output === "buffer" && this.bufferPath && code === 0) {
            try {
              const wav = await readFile(this.bufferPath)
              this.onBuffer?.(wav)
            } catch (err) {
              if (!this.stopped) emitError(err instanceof Error ? err.message : String(err))
            } finally {
              if (this.bufferPath) void unlink(this.bufferPath).catch(() => {})
            }
          }
          if (aplay) {
            setTimeout(done, 1000)
          } else {
            done()
          }
        })
        piper.once("error", (err) => {
          emitError(err.message)
          done()
        })
        aplay?.once("close", done)
        aplay?.once("error", () => done())
      } catch (err) {
        this.errorCbs.forEach((cb) => cb(err instanceof Error ? err.message : String(err)))
        resolve()
      }
    })
  }

  stop() {
    this.stopped = true
    for (const p of [this.piperProc, this.playProc]) {
      if (!p) continue
      try {
        p.stdin.destroy()
        p.kill("SIGKILL")
      } catch {
        /* already dead */
      }
    }
    this.piperProc = null
    this.playProc = null
    this.settle?.()
  }
}