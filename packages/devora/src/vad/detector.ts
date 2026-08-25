// Local energy-based VAD (voice activity detection) on raw PCM16 (S16LE)
// frames. Pure logic — no I/O — so interruption latency stays local and it is
// unit-testable with synthetic frames.
//
// Frame energy = RMS of int16 samples in a frame (default 10 ms). A
// hysteresis (speechThreshold vs silenceThreshold) prevents flapping on the
// boundary. The detector emits speech_start / speech_end / speech_hold events.

export type VadEvent = { type: "speech_start" } | { type: "speech_end" } | { type: "speech_hold" }

export type VadConfig = {
  sampleRate: number
  frameMs: number
  /** RMS above which a frame counts as speech while idle */
  speechThreshold: number
  /** RMS below which a frame counts as silence while speaking */
  silenceThreshold: number
  /** minimum speech duration before speech_start fires (ms) */
  minSpeechMs: number
  /** trailing silence after which speech_end fires (ms) */
  maxSilenceMs: number
  /** hard cap on utterance length — forces speech_end (ms) */
  maxSpeechMs: number
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  sampleRate: 16000,
  frameMs: 10,
  speechThreshold: 500,
  silenceThreshold: 250,
  minSpeechMs: 120,
  maxSilenceMs: 450,
  maxSpeechMs: 30_000,
}

const bytesPerSample = 2

function frameRms(frame: Buffer): number {
  const samples = frame.length / bytesPerSample
  if (samples < 1) return 0
  let sum = 0
  for (let i = 0; i < frame.length; i += 2) {
    const sample = frame.readInt16LE(i)
    sum += sample * sample
  }
  return Math.sqrt(sum / samples)
}

export class VadDetector {
  private readonly cfg: VadConfig
  private readonly frameBytes: number
  private buffer: Buffer = Buffer.alloc(0)
  private speaking = false
  private speechMs = 0
  private silenceMs = 0
  private firedStart = false

  constructor(config: Partial<VadConfig> = {}) {
    this.cfg = { ...DEFAULT_VAD_CONFIG, ...config }
    this.frameBytes = Math.round((this.cfg.sampleRate * this.cfg.frameMs) / 1000) * bytesPerSample
  }

  get isSpeaking(): boolean {
    return this.speaking
  }

  /** Feed a PCM16 chunk; returns events produced (max one per frame). */
  feed(chunk: Buffer): VadEvent[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const events: VadEvent[] = []
    while (this.buffer.length >= this.frameBytes) {
      const frame = this.buffer.subarray(0, this.frameBytes)
      this.buffer = this.buffer.subarray(this.frameBytes)
      const ev = this.processFrame(frame)
      if (ev) events.push(ev)
    }
    return events
  }

  private processFrame(frame: Buffer): VadEvent | null {
    const rms = frameRms(frame)
    const frameMs = this.cfg.frameMs

    if (!this.speaking) {
      if (rms >= this.cfg.speechThreshold) {
        this.speechMs += frameMs
        if (!this.firedStart && this.speechMs >= this.cfg.minSpeechMs) {
          this.speaking = true
          this.firedStart = true
          this.silenceMs = 0
          return { type: "speech_start" }
        }
      } else {
        this.speechMs = 0
      }
      return null
    }

    // speaking
    this.speechMs += frameMs
    if (rms <= this.cfg.silenceThreshold) {
      this.silenceMs += frameMs
    } else {
      this.silenceMs = 0
    }

    if (this.silenceMs >= this.cfg.maxSilenceMs || this.speechMs >= this.cfg.maxSpeechMs) {
      this.reset()
      return { type: "speech_end" }
    }
    return { type: "speech_hold" }
  }

  /** Force an end of the current utterance (used by interrupt/stop). */
  forceEnd(): VadEvent | null {
    if (!this.speaking) return null
    this.reset()
    return { type: "speech_end" }
  }

  private reset() {
    this.speaking = false
    this.speechMs = 0
    this.silenceMs = 0
    this.firedStart = false
  }
}