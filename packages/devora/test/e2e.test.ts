// End-to-end pipeline test: mock STT/TTS + real controller + scripted
// OpenCode event bridge. Covers doc §18 Definition of Done in miniature:
// voice turn → OpenCode → narration → TTS, multi-turn, interruption.

import { describe, expect, test } from "bun:test"
import { VoiceController } from "../src/conversation/controller.ts"
import { MockRecognizer } from "../src/stt/mock.ts"
import type { SpeechRecognizer } from "../src/stt/client.ts"
import { MockSynthesizer } from "../src/tts/mock.ts"
import { Narrator } from "../src/narration/narrator.ts"
import type { OpencodeBridge, BridgeEventHandler } from "../src/opencode/bridge.ts"
import { tonePcm, silencePcm } from "./helpers.ts"

class MutableMock extends MockRecognizer implements SpeechRecognizer {
  result = ""
  private finalCbs: Array<(t: string) => void> = []
  onFinal(cb: (text: string) => void) {
    this.finalCbs.push(cb)
    super.onFinal(cb)
  }
  async end(): Promise<string> {
    const out = this.result
    this.finalCbs.forEach((cb) => cb(out))
    return out
  }
}

class ScriptedBridge implements OpencodeBridge {
  sessionId: string | null = null
  sent: string[] = []
  aborted = 0
  private handlers: BridgeEventHandler[] = []

  constructor(private script: Map<string, Array<{ type: string; properties?: Record<string, unknown> }>>) {}

  async connect() {
    this.sessionId = "sess-e2e"
    return this.sessionId
  }

  async sendMessage(text: string) {
    this.sent.push(text)
    const events = this.script.get(text) ?? []
    setTimeout(() => {
      for (const h of this.handlers) h({ type: "session.updated", properties: { sessionID: this.sessionId!, info: { status: "busy" } } })
      for (const ev of events) {
        for (const h of this.handlers) h({ type: ev.type, properties: ev.properties })
      }
      for (const h of this.handlers) h({ type: "session.idle", properties: { sessionID: this.sessionId! } })
    }, 20)
  }

  async abort() {
    this.aborted++
  }

  onEvent(cb: BridgeEventHandler) {
    this.handlers.push(cb)
    return () => {
      this.handlers = this.handlers.filter((x) => x !== cb)
    }
  }

  async close() {}
}

async function waitFor(fn: () => boolean, timeout = 3000): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (fn()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error("waitFor timeout")
}

describe("E2E — doc §18 Definition of Done (miniature)", () => {
  test("voice command → agent events → narration → TTS; multi-turn", async () => {
    const bridge = new ScriptedBridge(
      new Map([
        [
          "De, cari kenapa login saya gagal",
          [
            { type: "session.next.tool.called", properties: { tool: "bash", input: { command: "grep -r refresh_token src" } } },
            { type: "session.next.text.ended", properties: { text: "Saya menemukan masalah pada refresh token." } },
          ],
        ],
        [
          "Jangan ubah dulu. Jelaskan",
          [{ type: "session.next.text.ended", properties: { text: "Refresh token dianggap expired sebelum waktunya." } }],
        ],
        [
          "Perbaiki",
          [
            { type: "session.next.tool.called", properties: { tool: "bash", input: { command: "npm test" } } },
            { type: "session.next.tool.success", properties: { tool: "bash", input: { command: "npm test" } } },
          ],
        ],
      ]),
    )

    const synth = new MockSynthesizer()
    const narrator = new Narrator()
    const recognizer = new MutableMock()
    const controller = new VoiceController({ bridge, recognizer, synthesizer: synth, narrator })

    await controller.open()
    await controller.startListening()

    // --- Turn 1: user speaks a task ---
    recognizer.result = "De, cari kenapa login saya gagal"
    controller.feedAudio(tonePcm(200))
    controller.feedAudio(silencePcm(600))
    await waitFor(() => bridge.sent.length === 1)
    await waitFor(() => synth.spoken.some((t) => t.includes("refresh token")))
    // trivial grep stayed silent, finding was spoken
    expect(synth.spoken.join(" | ")).not.toContain("grep")

    // agent goes idle → back to listening for the next turn
    await waitFor(() => controller.getSnapshot().state === "listening")

    // --- Turn 2: keyboard fallback question ---
    await controller.keyboardSubmit("Jangan ubah dulu. Jelaskan")
    await waitFor(() => bridge.sent.length === 2)
    await waitFor(() => synth.spoken.some((t) => t.includes("expired sebelum waktunya")))
    await waitFor(() => controller.getSnapshot().state === "listening")

    // --- Turn 3: fix → tests run → success narrated ---
    recognizer.result = "Perbaiki"
    controller.feedAudio(tonePcm(200))
    controller.feedAudio(silencePcm(600))
    await waitFor(() => bridge.sent.length === 3)
    await waitFor(() => synth.spoken.some((t) => t.toLowerCase().includes("test berhasil")))

    expect(bridge.sent).toEqual([
      "De, cari kenapa login saya gagal",
      "Jangan ubah dulu. Jelaskan",
      "Perbaiki",
    ])
    expect(controller.getSnapshot().conversation.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ])
    expect(bridge.aborted).toBe(0)

    await controller.dispose()
  })

  test("silence produces no submission and no speech", async () => {
    const bridge = new ScriptedBridge(new Map())
    const synth = new MockSynthesizer()
    const controller = new VoiceController({
      bridge,
      recognizer: new MockRecognizer("", 5),
      synthesizer: synth,
      narrator: new Narrator(),
    })
    await controller.open()
    await controller.startListening()
    controller.feedAudio(tonePcm(200))
    controller.feedAudio(silencePcm(600))
    await waitFor(() => controller.getSnapshot().state === "listening")
    await new Promise((r) => setTimeout(r, 60))
    expect(bridge.sent).toEqual([])
    expect(synth.spoken).toEqual([])
    await controller.dispose()
  })
})
