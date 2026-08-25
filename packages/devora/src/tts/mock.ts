// Mock synthesizer — records spoken text, never touches audio. Used in tests
// and as text-only fallback when no TTS provider is configured.

import type { SpeechSynthesizer } from "./client.ts"

export class MockSynthesizer implements SpeechSynthesizer {
  readonly available = true
  readonly spoken: string[] = []
  private errorCbs: ((message: string) => void)[] = []
  private stopped = false
  private resolveQueue: Array<() => void> = []

  onError(cb: (message: string) => void) {
    this.errorCbs.push(cb)
  }

  async speak(text: string): Promise<void> {
    if (!text.trim()) return
    if (this.stopped) return
    this.spoken.push(text)
    await new Promise<void>((r) => {
      this.resolveQueue.push(r)
      setTimeout(r, 5)
    })
  }

  stop() {
    this.stopped = true
    this.resolveQueue.splice(0).forEach((r) => r())
  }

  get wasStopped() {
    return this.stopped
  }
}