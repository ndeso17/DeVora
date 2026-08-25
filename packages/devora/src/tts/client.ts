// SpeechSynthesizer adapter interface (doc §15). Providers: piper (local),
// mock (tests / text-only mode).

export interface SpeechSynthesizer {
  /** Synthesize + play `text`. Resolves when playback finishes. */
  speak(text: string): Promise<void>
  /** Stop playback immediately (interruption path). */
  stop(): void
  onError(cb: (message: string) => void): void
  /** true when the provider can play audio (false → text-only fallback). */
  readonly available: boolean
}