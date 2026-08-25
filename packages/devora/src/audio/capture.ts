// Microphone capture via ALSA `arecord`. Streams mono PCM16 (S16LE, 16 kHz)
// chunks to a callback.
//
// Some HDA codecs (e.g. Conexant CX20751/2) reject mono capture
// ("Channels count non available"). When that happens we transparently retry
// with 2 channels and downmix to mono so the VAD/STT pipeline never sees
// anything but mono 16 kHz.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import type { AudioCaptureConfig } from "../types.ts"

export type CaptureChunkHandler = (chunk: Buffer) => void
export type CaptureErrorHandler = (error: Error) => void

export type AudioCapture = {
  start(): Promise<void>
  stop(): Promise<void>
  readonly running: boolean
}

export type CaptureEvents = {
  onData: CaptureChunkHandler
  onError?: CaptureErrorHandler
  onEnd?: () => void
}

const DEFAULT_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1,
}

function downmixStereoToMono(stereo: Buffer): Buffer {
  const out = Buffer.alloc(stereo.length / 2)
  for (let i = 0; i + 3 < stereo.length; i += 4) {
    const l = stereo.readInt16LE(i)
    const r = stereo.readInt16LE(i + 2)
    out.writeInt16LE((l + r) >> 1, i / 2)
  }
  return out
}

export function createAudioCapture(
  events: CaptureEvents,
  config: Partial<AudioCaptureConfig> = {},
): AudioCapture {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  let proc: ChildProcessWithoutNullStreams | null = null
  let stopped = false
  let effectiveChannels = cfg.channels

  const buildArgs = (channels: number) => {
    const args = [
      "-q",
      "-t", "raw",
      "-f", "S16_LE",
      "-r", String(cfg.sampleRate),
      "-c", String(channels),
    ]
    if (cfg.device) args.push("-D", cfg.device)
    return args
  }

  const spawnArecord = (channels: number) => {
    proc = spawn("arecord", buildArgs(channels))
    proc.once("error", (err) => {
      proc = null
      events.onError?.(err)
    })
    proc.once("close", () => {
      proc = null
      if (!stopped) events.onEnd?.()
    })
    proc.stdout.on("data", (chunk: Buffer) => {
      if (stopped) return
      events.onData(effectiveChannels === 2 ? downmixStereoToMono(chunk) : chunk)
    })
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      // mono unsupported on this device → retry stereo once
      if (!stopped && proc && channels === 1 && text.includes("Channels count non available")) {
        const old = proc
        proc = null
        try {
          old.kill("SIGTERM")
        } catch {
          /* ignore */
        }
        effectiveChannels = 2
        spawnArecord(2)
      }
    })
    proc.once("exit", (code) => {
      if (code !== 0 && !stopped && !(effectiveChannels === 2 && channels === 1)) {
        events.onError?.(new Error(`arecord exited with code ${code}`))
      }
    })
  }

  return {
    get running() {
      return proc !== null && !stopped
    },
    start() {
      return new Promise<void>((resolve, reject) => {
        if (proc) return resolve()
        stopped = false
        effectiveChannels = cfg.channels
        try {
          spawnArecord(cfg.channels)
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)))
          return
        }
        const timer = setTimeout(() => resolve(), 1500)
        proc!.once("spawn", () => {
          clearTimeout(timer)
          resolve()
        })
      })
    },
    stop() {
      return new Promise<void>((resolve) => {
        stopped = true
        if (!proc) return resolve()
        const p = proc
        proc = null
        try {
          p.kill("SIGTERM")
        } catch {
          /* ignore */
        }
        p.once("exit", () => resolve())
        setTimeout(resolve, 500)
      })
    },
  }
}