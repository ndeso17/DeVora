import { describe, expect, test } from "bun:test"
import { TurnDetector } from "../src/conversation/turn.ts"

describe("TurnDetector", () => {
  test("speech_start opens turn once", () => {
    const t = new TurnDetector()
    const first = t.onVadEvent({ type: "speech_start" })
    expect(first.map((e) => e.type)).toContain("turn_start")
    const second = t.onVadEvent({ type: "speech_start" })
    expect(second.map((e) => e.type)).not.toContain("turn_start")
  })

  test("speech_end closes turn once", () => {
    const t = new TurnDetector()
    t.onVadEvent({ type: "speech_start" })
    const end = t.onVadEvent({ type: "speech_end" })
    expect(end.map((e) => e.type)).toContain("turn_end")
    const again = t.onVadEvent({ type: "speech_end" })
    expect(again.map((e) => e.type)).not.toContain("turn_end")
  })

  test("active flag tracks utterance state", () => {
    const t = new TurnDetector()
    expect(t.active).toBe(false)
    t.onVadEvent({ type: "speech_start" })
    expect(t.active).toBe(true)
    t.onVadEvent({ type: "speech_end" })
    expect(t.active).toBe(false)
  })
})
