// SpeechRecognizer adapter interface (doc §15). Providers are swappable:
// vosk (en, streaming), whisper (multilingual incl. Indonesian), mock.

export interface SpeechRecognizer {
  start(): Promise<void>
  stop(): Promise<void>
  interrupt(): void
  /** Feed a PCM16 (S16LE, mono, 16 kHz) chunk while listening. */
  feedAudio(chunk: Buffer): void
  /** Request a partial transcript of what has been heard so far. */
  flushPartial(): void
  /** End the utterance and produce the final transcript. */
  end(): Promise<string>
  onPartial(cb: (text: string) => void): void
  onFinal(cb: (text: string) => void): void
  onError(cb: (message: string) => void): void
  /** true when the provider can emit intermediate transcripts. */
  readonly supportsPartial: boolean
}

export type { SpeechRecognizerConfig } from "../types.ts"