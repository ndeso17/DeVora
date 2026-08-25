// Audio playback. Two sinks:
//   - rawPipe: streams raw PCM16 to aplay (used by PiperSynthesizer which
//     produces raw PCM on stdout)
//   - wave: plays a complete WAV file via paplay/aplay fallback
// Playback can be stopped synchronously by killing the child process.

import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process"

export type PlaybackSink = {
  write(chunk: Uint8Array): void
  end(): void
  stop(): void
  readonly running: boolean
}

export function createRawPcmPlayback(sampleRate = 22050, channels = 1): PlaybackSink {
  let proc: ChildProcessWithoutNullStreams | null = null
  let stopped = false
  let open = false

  const ensure = () => {
    if (proc && open) return proc
    stopped = false
    const args = ["-q", "-t", "raw", "-f", "S16_LE", "-r", String(sampleRate), "-c", String(channels)]
    proc = spawn("aplay", args)
    proc.once("error", () => {
      proc = null
      open = false
    })
    proc.once("close", () => {
      proc = null
      open = false
    })
    open = true
    return proc
  }

  return {
    get running() {
      return proc !== null && open && !stopped
    },
    write(chunk) {
      if (stopped) return
      const p = ensure()
      p?.stdin.write(Buffer.from(chunk))
    },
    end() {
      if (!proc || !open) return
      const p = proc
      open = false
      proc = null
      p.stdin.end()
    },
    stop() {
      stopped = true
      if (!proc) return
      const p = proc
      proc = null
      open = false
      try {
        p.stdin.destroy()
        p.kill("SIGTERM")
      } catch {
        /* already dead */
      }
    },
  }
}

export function playWaveFile(filePath: string): Promise<void> {
  return new Promise((resolve) => {
    const trySinks = [
      () => spawnSync("paplay", [filePath]),
      () => spawnSync("aplay", ["-q", filePath]),
    ]
    for (const run of trySinks) {
      const res = run()
      if (res.status === 0) return resolve()
    }
    resolve()
  })
}