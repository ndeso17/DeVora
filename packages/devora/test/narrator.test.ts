import { describe, expect, test } from "bun:test"
import { Narrator } from "../src/narration/narrator.ts"
import type { NarrationEvent } from "../src/types.ts"

const ev = (text: string, priority: NarrationEvent["priority"], dedupKey?: string): NarrationEvent => ({
  text,
  priority,
  timestamp: Date.now(),
  dedupKey,
})

describe("Narrator", () => {
  test("higher priority is emitted first", async () => {
    const narrator = new Narrator()
    const spoken: string[] = []
    narrator.onNarrate((text) => spoken.push(text))
    narrator.enqueue(ev("progress", "important_progress"))
    narrator.enqueue(ev("error", "error"))
    await new Promise((r) => setTimeout(r, 10))
    expect(spoken[0]).toBe("error")
    expect(spoken).toContain("progress")
  })

  test("dedupKey suppresses repeats within window", async () => {
    const narrator = new Narrator()
    const spoken: string[] = []
    narrator.onNarrate((text) => spoken.push(text))
    narrator.enqueue(ev("Selesai.", "completion", "session:idle"))
    narrator.enqueue(ev("Selesai.", "completion", "session:idle"))
    await new Promise((r) => setTimeout(r, 20))
    expect(spoken.filter((t) => t === "Selesai.").length).toBe(1)
  })

  test("clear() drops queued items", async () => {
    const narrator = new Narrator()
    const spoken: string[] = []
    // no sink attached yet → first item drains immediately; use stop/resume instead
    narrator.stop()
    narrator.onNarrate((text) => spoken.push(text))
    narrator.enqueue(ev("one", "trivial"))
    expect(narrator.pending).toBe(0) // stopped → dropped
    narrator.resume()
    narrator.enqueue(ev("two", "critical"))
    expect(narrator.pending).toBe(1)
    narrator.clear()
    expect(narrator.pending).toBe(0)
    await new Promise((r) => setTimeout(r, 5))
    expect(spoken).toEqual([])
  })
})
