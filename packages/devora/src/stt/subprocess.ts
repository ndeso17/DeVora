// Shared subprocess bridge for the local STT providers. Each provider spawns a
// python worker that reads JSON-lines from stdin and writes JSON-lines to
// stdout. This file owns the line protocol + process lifecycle; provider
// workers live in scripts/.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { resolve } from "node:path"
import type { SpeechRecognizer } from "./client.ts"

export const DEVORA_ROOT = resolve(import.meta.dir, "../../../..")
export const PACKAGE_ROOT = resolve(import.meta.dir, "../..")

export function venvPython(): string {
  return process.env.DEVORA_VENV_PYTHON ?? resolve(DEVORA_ROOT, ".venv/bin/python")
}

export type WorkerMessage =
  | { type: "ready" }
  | { type: "partial"; text: string }
  | { type: "final"; text: string }
  | { type: "error"; message: string }

export class SttSubprocessRecognizer implements SpeechRecognizer {
  readonly supportsPartial: boolean
  private proc: ChildProcessWithoutNullStreams | null = null
  private partialCbs: ((text: string) => void)[] = []
  private finalCbs: ((text: string) => void)[] = []
  private errorCbs: ((message: string) => void)[] = []
  private lineBuf = ""
  private alive = false
  private startPromise: Promise<void> | null = null
  private ended = false
  protected workerArgs: string[] = []
  protected workerEnv: Record<string, string> = {}

  constructor(supportsPartial: boolean) {
    this.supportsPartial = supportsPartial
  }

  onPartial(cb: (text: string) => void) {
    this.partialCbs.push(cb)
  }
  onFinal(cb: (text: string) => void) {
    this.finalCbs.push(cb)
  }
  onError(cb: (message: string) => void) {
    this.errorCbs.push(cb)
  }

  start(): Promise<void> {
    if (this.startPromise) return this.startPromise
    this.startPromise = new Promise<void>((resolveStart, rejectStart) => {
      try {
        const proc = spawn(venvPython(), ["-u", ...this.workerArgs], {
          cwd: PACKAGE_ROOT,
          env: { ...process.env, ...this.workerEnv },
        })
        this.proc = proc
        this.alive = true
        this.lineBuf = ""
        this.ended = false
        proc.stdout.setEncoding("utf8")
        proc.stdout.on("data", (chunk: string) => this.onStdout(chunk))
        proc.stderr.on("data", (chunk: Buffer) => {
          const text = chunk.toString()
          if (text.includes("Traceback") || text.includes("Error")) {
            this.errorCbs.forEach((cb) => cb(text.split("\n")[0]))
          }
        })
        proc.once("error", (err) => {
          this.alive = false
          rejectStart(err)
        })
        proc.once("exit", (code) => {
          this.alive = false
          this.proc = null
          if (!this.ended && code !== 0) {
            this.errorCbs.forEach((cb) => cb(`STT worker exited with code ${code}`))
          }
        })
        proc.stdin.once("error", () => {})
        // Worker announces readiness; resolve start on first line OR timeout.
        const timer = setTimeout(() => resolveStart(), 8000)
        proc.stdout.once("data", () => {
          clearTimeout(timer)
          resolveStart()
        })
      } catch (err) {
        rejectStart(err instanceof Error ? err : new Error(String(err)))
      }
    })
    return this.startPromise
  }

  private onStdout(chunk: string) {
    this.lineBuf += chunk
    const lines = this.lineBuf.split("\n")
    this.lineBuf = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line) as WorkerMessage
        this.handleMessage(msg)
      } catch {
        /* ignore malformed line */
      }
    }
  }

  private handleMessage(msg: WorkerMessage) {
    switch (msg.type) {
      case "ready":
        break
      case "partial":
        if (msg.text) this.partialCbs.forEach((cb) => cb(msg.text))
        break
      case "final":
        if (msg.text) this.finalCbs.forEach((cb) => cb(msg.text))
        break
      case "error":
        this.errorCbs.forEach((cb) => cb(msg.message))
        break
    }
  }

  private send(obj: unknown) {
    if (!this.proc || !this.alive) return
    this.proc.stdin.write(`${JSON.stringify(obj)}\n`)
  }

  feedAudio(chunk: Buffer) {
    this.send({ type: "audio", data: chunk.toString("base64") })
  }

  flushPartial() {
    this.send({ type: "flush" })
  }

  async end(): Promise<string> {
    this.ended = true
    return new Promise<string>((resolveEnd) => {
      const proc = this.proc
      if (!proc) return resolveEnd("")
      let finalText = ""
      let timer: ReturnType<typeof setTimeout> | null = null
      const done = () => {
        if (timer) clearTimeout(timer)
        resolveEnd(finalText)
      }
      proc.once("exit", done)
      timer = setTimeout(done, 30_000)
      this.send({ type: "end" })
      proc.stdin.end()
      // capture final from streamed messages
      const origFinal = this.finalCbs
      this.finalCbs = [
        (text) => {
          finalText = text
          origFinal.forEach((cb) => cb(text))
        },
      ]
    })
  }

  interrupt() {
    if (!this.proc) return
    try {
      this.proc.kill("SIGTERM")
    } catch {
      /* ignore */
    }
    this.proc = null
    this.alive = false
    this.startPromise = null
  }

  stop(): Promise<void> {
    if (!this.proc) return Promise.resolve()
    const proc = this.proc
    this.alive = false
    this.proc = null
    this.startPromise = null
    return new Promise((resolveStop) => {
      proc.once("exit", () => resolveStop())
      try {
        proc.kill("SIGTERM")
      } catch {
        resolveStop()
      }
      setTimeout(resolveStop, 500)
    })
  }
}