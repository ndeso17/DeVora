import { describe, expect, test } from "bun:test"
import { VadDetector } from "../src/vad/detector.ts"
import { silencePcm, tonePcm } from "./helpers.ts"

describe("VadDetector", () => {
  test("silence produces no events", () => {
    const vad = new VadDetector()
    const events = vad.feed(silencePcm(500))
    expect(events.filter((e) => e.type !== "speech_hold")).toEqual([])
    expect(vad.isSpeaking).toBe(false)
  })

  test("tone triggers speech_start after minSpeechMs (< 200ms target)", () => {
    const vad = new VadDetector({ minSpeechMs: 120 })
    // feed 200ms of tone in 10ms frames
    const events = vad.feed(tonePcm(200))
    expect(events.some((e) => e.type === "speech_start")).toBe(true)
    expect(vad.isSpeaking).toBe(true)
    // speech_start must fire within first 200ms of audio (doc §16 VAD reaction < 200ms)
    const startIdx = events.findIndex((e) => e.type === "speech_start")
    expect(startIdx * 10).toBeLessThanOrEqual(200)
  })

  test("trailing silence ends the utterance (maxSilenceMs)", () => {
    const vad = new VadDetector({ maxSilenceMs: 450 })
    vad.feed(tonePcm(200))
    const events = vad.feed(silencePcm(600))
    expect(events.some((e) => e.type === "speech_end")).toBe(true)
    expect(vad.isSpeaking).toBe(false)
  })

  test("short blips below minSpeechMs do not trigger", () => {
    const vad = new VadDetector({ minSpeechMs: 120 })
    vad.feed(tonePcm(50))
    vad.feed(silencePcm(100))
    const events = vad.feed(tonePcm(50))
    // no speech_start yet — blip was too short
    expect(events.filter((e) => e.type === "speech_start")).toEqual([])
  })

  test("forceEnd closes an open utterance", () => {
    const vad = new VadDetector()
    vad.feed(tonePcm(300))
    expect(vad.forceEnd()).toEqual({ type: "speech_end" })
    expect(vad.isSpeaking).toBe(false)
  })

  test("hysteresis: mid-level noise between thresholds holds speech without ending", () => {
    const vad = new VadDetector({ maxSilenceMs: 450 })
    vad.feed(tonePcm(200)) // amplitude 8000 → speaking
    // mid-level (RMS ~400): above silenceThreshold(250), below speechThreshold(500) → not silence
    const mid = tonePcm(200, 400)
    const events = vad.feed(mid)
    expect(events.filter((e) => e.type === "speech_end")).toEqual([])
  })

  test("chunked feeding across arbitrary boundaries behaves like one buffer", () => {
    const a = new VadDetector()
    const b = new VadDetector()
    const whole = tonePcm(300)
    for (let off = 0; off < whole.length; off += 320) a.feed(whole.subarray(off, off + 320))
    b.feed(whole)
    expect(a.isSpeaking).toBe(b.isSpeaking)
  })
})
