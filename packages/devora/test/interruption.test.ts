import { describe, expect, test } from "bun:test"
import { InterruptionCoordinator } from "../src/conversation/interruption.ts"

const order: string[] = []

function makeCoordinator(cancelAgent?: () => Promise<void>) {
  return new InterruptionCoordinator({
    stopTts: () => order.push("stop_tts"),
    clearNarration: () => order.push("clear_narration"),
    cancelAgent:
      cancelAgent ??
      (async () => {
        order.push("cancel_agent")
      }),
  })
}

describe("InterruptionCoordinator — doc §11 contract", () => {
  test("order: stop TTS → clear narration → cancel agent", async () => {
    order.length = 0
    await makeCoordinator().interrupt()
    expect(order).toEqual(["stop_tts", "clear_narration", "cancel_agent"])
  })

  test("TTS stop failure never blocks cancellation", async () => {
    const c = new InterruptionCoordinator({
      stopTts: () => {
        throw new Error("audio dead")
      },
      clearNarration: () => {},
      cancelAgent: async () => {},
    })
    const result = await c.interrupt()
    expect(result.agentCancelled).toBe(true)
  })

  test("agent cancel failure is reported, not thrown", async () => {
    const c = makeCoordinator(async () => {
      throw new Error("session busy")
    })
    const result = await c.interrupt()
    expect(result.ttsStopped).toBe(true)
    expect(result.agentCancelled).toBe(false)
    expect(result.agentError).toContain("session busy")
  })
})
