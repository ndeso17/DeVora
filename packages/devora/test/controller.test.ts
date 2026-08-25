import { describe, expect, test } from "bun:test"
import { VoiceController } from "../src/conversation/controller.ts"
import { MockRecognizer } from "../src/stt/mock.ts"
import type { SpeechRecognizer } from "../src/stt/client.ts"
import type { SpeechSynthesizer } from "../src/tts/client.ts"
import type { AudioCapture } from "../src/audio/capture.ts"
import type { OpencodeBridge, BridgeEvent, BridgeEventHandler, BridgeModelOption } from "../src/opencode/bridge.ts"
import { Narrator } from "../src/narration/narrator.ts"
import { tonePcm, silencePcm } from "./helpers.ts"

class FakeBridge implements OpencodeBridge {
  sessionId: string | null = null
  sent: string[] = []
  sentModels: Array<BridgeModelOption | undefined> = []
  aborted = 0
  private handlers: BridgeEventHandler[] = []

  async connect() {
    this.sessionId = "sess-test-1"
    return this.sessionId
  }
  async sendMessage(text: string, model?: BridgeModelOption) {
    this.sent.push(text)
    this.sentModels.push(model)
    this.handlers.forEach((h) => h({ type: "session.updated", properties: { sessionID: this.sessionId!, info: { status: "busy" } } }))
  }
  async abort() {
    this.aborted++
  }
  async getMessages(_limit?: number): Promise<Array<{ role: string; parts: Array<{ type: string; text?: string }> }>> {
    return []
  }
  async listSessions() {
    return []
  }
  async createSession() {
    return "sess-test-1"
  }
  setSession(_id: string) {}
  async getContext() {
    return { directory: null, mcp: [], skills: [], models: [] }
  }
  onEvent(cb: BridgeEventHandler) {
    this.handlers.push(cb)
    this.handlers.forEach((h) => h({ type: "session.created", properties: { sessionID: this.sessionId! } }))
    return () => {
      this.handlers = this.handlers.filter((x) => x !== cb)
    }
  }
  async close() {}
  emit(type: string, properties?: Record<string, unknown>) {
    this.handlers.forEach((h) => h({ type, properties } satisfies BridgeEvent))
  }
}

class FakeCapture implements AudioCapture {
  running = false
  startCount = 0
  async start() {
    this.running = true
    this.startCount++
  }
  async stop() {
    this.running = false
  }
}

/** Synthesizer that blocks until stop() — lets tests hold the SPEAKING state. */
class BlockingSynthesizer implements SpeechSynthesizer {
  available = true
  spoken: string[] = []
  stopped = false
  private resolvers: Array<() => void> = []
  onError(_cb: (m: string) => void) {}
  speak(text: string): Promise<void> {
    this.spoken.push(text)
    return new Promise((r) => this.resolvers.push(r))
  }
  stop() {
    this.stopped = true
    this.resolvers.splice(0).forEach((r) => r())
  }
  releaseAll() {
    this.resolvers.splice(0).forEach((r) => r())
  }
}

async function waitFor(fn: () => boolean, timeout = 3000): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (fn()) return
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error("waitFor timeout")
}

function speakUtterance(controller: VoiceController) {
  controller.feedAudio(tonePcm(200)) // speech_start → turn_start
  controller.feedAudio(silencePcm(600)) // speech_end → turn_end
}

describe("VoiceController — state machine (doc §11 Phase 7)", () => {
  test("open connects bridge; full turn: listen → transcribe → submit → work", async () => {
    const bridge = new FakeBridge()
    const recognizer = new MockRecognizer("Perbaiki bug login", 10)
    const synth = new BlockingSynthesizer()
    const capture = new FakeCapture()
    const narrator = new Narrator()

    const controller = new VoiceController({ bridge, recognizer, synthesizer: synth, capture, narrator })
    await controller.open()
    expect(bridge.sessionId).toBe("sess-test-1")
    expect(controller.getSnapshot().state).toBe("idle")

    await controller.startListening()
    expect(controller.getSnapshot().state).toBe("listening")
    expect(capture.running).toBe(true)

    speakUtterance(controller)
    await waitFor(() => controller.getSnapshot().state === "working")
    // transcript reached OpenCode session
    expect(bridge.sent).toEqual(["Perbaiki bug login"])
    // conversation has user turn + snapshot exposes session id
    const snap = controller.getSnapshot()
    expect(snap.conversation).toEqual([{ role: "user", text: "Perbaiki bug login" }])
    expect(snap.opencodeSessionId).toBe("sess-test-1")

    await controller.dispose()
  })

  test("agent events narrated and spoken; session.idle returns to listening", async () => {
    const bridge = new FakeBridge()
    const recognizer = new MockRecognizer("jalankan test", 5)
    const synth = new BlockingSynthesizer()
    const narrator = new Narrator()
    const controller = new VoiceController({ bridge, recognizer, synthesizer: synth, capture: undefined, narrator })
    await controller.open()
    await controller.startListening()

    speakUtterance(controller)
    await waitFor(() => controller.getSnapshot().state === "working")

    // agent runs a test command → narrated progress
    bridge.emit("session.next.tool.called", { tool: "bash", input: { command: "bun test" }, sessionID: bridge.sessionId })
    await waitFor(() => synth.spoken.length > 0)
    expect(synth.spoken[0].toLowerCase()).toContain("test")
    expect(controller.getSnapshot().state).toBe("speaking")

    // release speech → back to working (agent busy)
    synth.releaseAll()
    await waitFor(() => controller.getSnapshot().state === "working" || controller.getSnapshot().state === "speaking")

    // agent finishes
    bridge.emit("session.idle", { sessionID: bridge.sessionId })
    await waitFor(() => !synth.spoken.length || true)
    synth.releaseAll()
    await waitFor(() => controller.getSnapshot().state === "listening")
    expect(controller.getSnapshot().activity.some((a) => a.includes("Task selesai"))).toBe(true)

    await controller.dispose()
  })

  test("barge-in during SPEAKING stops TTS + cancels agent + returns to LISTENING", async () => {
    const bridge = new FakeBridge()
    const recognizer = new MockRecognizer("jelaskan error", 5)
    const synth = new BlockingSynthesizer()
    const narrator = new Narrator()
    const controller = new VoiceController({ bridge, recognizer, synthesizer: synth, capture: undefined, narrator })
    await controller.open()
    await controller.startListening()

    speakUtterance(controller)
    await waitFor(() => controller.getSnapshot().state === "working")

    // long narration starts speaking
    bridge.emit("session.next.text.ended", { text: "Saya menemukan masalah pada refresh token yang dianggap expired." , sessionID: bridge.sessionId })
    await waitFor(() => controller.getSnapshot().state === "speaking")

    // user barges in with voice
    controller.feedAudio(tonePcm(200))
    await waitFor(() => controller.getSnapshot().state === "listening")
    expect(synth.stopped).toBe(true)
    expect(bridge.aborted).toBeGreaterThanOrEqual(1)

    // next utterance still works (multi-turn after interruption)
    speakUtterance(controller)
    await waitFor(() => bridge.sent.length === 2)
    await controller.dispose()
  })

  test("barge-in during WORKING cancels agent operation", async () => {
    const bridge = new FakeBridge()
    const recognizer = new MockRecognizer("cari bug", 5)
    const synth = new BlockingSynthesizer()
    const narrator = new Narrator()
    const controller = new VoiceController({ bridge, recognizer, synthesizer: synth, capture: undefined, narrator })
    await controller.open()
    await controller.startListening()
    speakUtterance(controller)
    await waitFor(() => controller.getSnapshot().state === "working")

    controller.feedAudio(tonePcm(200))
    await waitFor(() => controller.getSnapshot().state === "listening")
    expect(bridge.aborted).toBeGreaterThanOrEqual(1)
    await controller.dispose()
  })

  test("keyboard fallback submits without microphone", async () => {
    const bridge = new FakeBridge()
    const controller = new VoiceController({
      bridge,
      recognizer: new MockRecognizer(),
      synthesizer: new BlockingSynthesizer(),
      capture: undefined,
      narrator: new Narrator(),
    })
    await controller.open()
    await controller.keyboardSubmit("Jangan ubah dulu. Jelaskan.")
    await waitFor(() => bridge.sent.length === 1)
    expect(bridge.sent[0]).toBe("Jangan ubah dulu. Jelaskan.")
    expect(controller.getSnapshot().conversation[0]).toEqual({ role: "user", text: "Jangan ubah dulu. Jelaskan." })
    await controller.dispose()
  })

  test("setDefaultModel forwards model option to bridge on submit", async () => {
    const bridge = new FakeBridge()
    const controller = new VoiceController({
      bridge,
      recognizer: new MockRecognizer(),
      synthesizer: new BlockingSynthesizer(),
      capture: undefined,
      narrator: new Narrator(),
    })
    await controller.open()
    controller.setDefaultModel({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
    await controller.keyboardSubmit("Pakai model ini")
    await waitFor(() => bridge.sent.length === 1)
    expect(bridge.sentModels[0]).toEqual({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
    await controller.dispose()
  })

  test("partial transcript from recognizer flows to snapshot", async () => {
    const bridge = new FakeBridge()
    const recognizer = new MockRecognizer()
    const controller = new VoiceController({
      bridge,
      recognizer,
      synthesizer: new BlockingSynthesizer(),
      capture: undefined,
      narrator: new Narrator(),
    })
    await controller.open()
    await controller.startListening()
    recognizer.emitPartial("Halo dunia")
    expect(controller.getSnapshot().partialTranscript).toBe("Halo dunia")
    await controller.dispose()
  })

  test("empty utterance does not submit and stays listening", async () => {
    class EmptyRecognizer extends MockRecognizer implements SpeechRecognizer {
      async end() {
        return ""
      }
    }
    const bridge = new FakeBridge()
    const controller = new VoiceController({
      bridge,
      recognizer: new EmptyRecognizer(),
      synthesizer: new BlockingSynthesizer(),
      capture: undefined,
      narrator: new Narrator(),
    })
    await controller.open()
    await controller.startListening()
    speakUtterance(controller)
    await waitFor(() => controller.getSnapshot().state === "listening")
    expect(bridge.sent).toEqual([])
    await controller.dispose()
  })

  test("STT failure lands in ERROR then recovers via startListening", async () => {
    class FailRecognizer extends MockRecognizer implements SpeechRecognizer {
      async end(): Promise<string> {
        throw new Error("stt worker crashed")
      }
    }
    const bridge = new FakeBridge()
    const controller = new VoiceController({
      bridge,
      recognizer: new FailRecognizer(),
      synthesizer: new BlockingSynthesizer(),
      capture: undefined,
      narrator: new Narrator(),
    })
    await controller.open()
    await controller.startListening()
    speakUtterance(controller)
    await waitFor(() => controller.getSnapshot().error?.includes("stt worker crashed") === true)
    // doc §14: show error, remain usable — controller lands back in LISTENING
    expect(controller.getSnapshot().state).toBe("listening")
    await controller.startListening()
    expect(controller.getSnapshot().state).toBe("listening")
    expect(controller.getSnapshot().error).toBeNull()
    await controller.dispose()
  })
})

describe("VoiceController — non-streamed reply recovery (9router path)", () => {
  test("assistant text recovered from getMessages on session.idle", async () => {
    class RecoverBridge extends FakeBridge {
      async getMessages(_limit?: number) {
        return [
          { role: "user", parts: [{ type: "text", text: "7+1?" }] },
          { role: "assistant", parts: [{ type: "text", text: "8" }] },
        ]
      }
    }
    const bridge = new RecoverBridge()
    const synth = new BlockingSynthesizer()
    const narrator = new Narrator()
    const controller = new VoiceController({
      bridge,
      recognizer: new MockRecognizer("7+1?", 5),
      synthesizer: synth,
      capture: undefined,
      narrator,
    })
    await controller.open()
    await controller.startListening()
    speakUtterance(controller)
    await waitFor(() => bridge.sent.length === 1)
    await waitFor(() => controller.getSnapshot().state === "working")
    // no streamed text — only session.idle arrives
    bridge.emit("session.idle", { sessionID: bridge.sessionId })
    await waitFor(() => controller.getSnapshot().conversation.some((m) => m.role === "assistant"))
    const conv = controller.getSnapshot().conversation
    expect(conv.at(-1)).toEqual({ role: "assistant", text: "8" })
    // narration enqueued → speech scheduled
    synth.releaseAll()
    await controller.dispose()
  })
})
