// Realtime interruption coordination (doc §11, §10 Interruption Contract).
// Order of operations on interrupt:
//   1. Stop TTS playback           (always, synchronous)
//   2. Stop queued narration       (always)
//   3. Cancel active OpenCode op   (best-effort)
//   4. Report failures             (interrupt must never throw)

export type InterruptionDeps = {
  stopTts: () => void
  clearNarration: () => void
  cancelAgent: () => Promise<void>
}

export type InterruptionResult = {
  ttsStopped: boolean
  narrationCleared: boolean
  agentCancelled: boolean
  agentError?: string
}

export class InterruptionCoordinator {
  constructor(private readonly deps: InterruptionDeps) {}

  /** Execute the interruption contract. Never rejects. */
  async interrupt(): Promise<InterruptionResult> {
    let agentCancelled = false
    let agentError: string | undefined
    try {
      this.deps.stopTts()
    } catch {
      /* TTS stop is best-effort; swallowing keeps listening alive */
    }
    this.deps.clearNarration()

    try {
      await this.deps.cancelAgent()
      agentCancelled = true
    } catch (err) {
      agentError = err instanceof Error ? err.message : String(err)
    }

    return {
      ttsStopped: true,
      narrationCleared: true,
      agentCancelled,
      agentError,
    }
  }
}