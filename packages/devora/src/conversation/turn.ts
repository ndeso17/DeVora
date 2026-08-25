// Turn detection (doc §7, §11). Maps raw VAD events to conversational turn
// events. Pure logic — deterministic and unit-testable.

import type { VadEvent } from "../vad/detector.ts"

export type TurnEvent =
  | { type: "user_speech_start" }
  | { type: "user_speech_end" }
  | { type: "turn_start" }
  | { type: "turn_end" }

export class TurnDetector {
  private inTurn = false

  /** Feed a VAD event; returns zero or more turn events. */
  onVadEvent(ev: VadEvent): TurnEvent[] {
    switch (ev.type) {
      case "speech_start":
        if (this.inTurn) return [{ type: "user_speech_start" }]
        this.inTurn = true
        return [{ type: "user_speech_start" }, { type: "turn_start" }]
      case "speech_end":
        if (!this.inTurn) return [{ type: "user_speech_end" }]
        this.inTurn = false
        return [{ type: "user_speech_end" }, { type: "turn_end" }]
      default:
        return []
    }
  }

  /** True while an utterance is open. */
  get active() {
    return this.inTurn
  }
}