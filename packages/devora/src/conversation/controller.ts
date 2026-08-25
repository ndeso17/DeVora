// VoiceController — the conversation state machine (doc §9, §11, Phase 7).
// Owns: microphone/VAD/STT turn flow, OpenCode bridge, narration→TTS queue,
// interruption. Does NOT own planning/coding/tool execution — that is OpenCode.

import type {
  NarrationEvent,
  NarrationPriority,
  VoiceControllerState,
  VoiceState,
} from "../types.ts"
import type { AudioCapture } from "../audio/capture.ts"
import { VadDetector, type VadConfig, type VadEvent } from "../vad/detector.ts"
import { TurnDetector } from "./turn.ts"
import { InterruptionCoordinator, type InterruptionResult } from "./interruption.ts"
import { Narrator } from "../narration/narrator.ts"
import { classifyNarration } from "../narration/filter.ts"
import type { SpeechRecognizer } from "../stt/client.ts"
import type { SpeechSynthesizer } from "../tts/client.ts"
import type { OpencodeBridge, BridgeEvent, BridgeModelOption } from "../opencode/bridge.ts"

export type ConversationMessage = { role: "user" | "assistant"; text: string }

export type VoiceControllerOptions = {
  bridge: OpencodeBridge
  recognizer: SpeechRecognizer
  synthesizer: SpeechSynthesizer
  narrator?: Narrator
  capture?: AudioCapture
  vadConfig?: Partial<VadConfig>
  onStateChange?: (snapshot: VoiceControllerState) => void
}

// Explicitly allowed transitions — keeps the state machine deterministic and
// testable.
const TRANSITIONS: Record<VoiceState, VoiceState[]> = {
  idle: ["listening", "submitting", "error"],
  listening: ["transcribing", "submitting", "interrupting", "error"],
  transcribing: ["submitting", "listening", "interrupting", "error"],
  submitting: ["working", "interrupting", "error"],
  working: ["speaking", "listening", "submitting", "interrupting", "error"],
  speaking: ["listening", "submitting", "interrupting", "error"],
  interrupting: ["listening", "error"],
  error: ["listening"],
}

export class VoiceController {
  private state: VoiceState = "idle"
  private transcript = ""
  private partialTranscript = ""
  private conversation: ConversationMessage[] = []
  private activity: string[] = []
  private error: string | null = null

  private readonly vad: VadDetector
  private readonly turn = new TurnDetector()
  private readonly narrator: Narrator
  private readonly interruption: InterruptionCoordinator
  private readonly opts: VoiceControllerOptions

  private bridgeReady = false
  private busyWithAgent = false
  private speechQueue: string[] = []
  private speaking = false
  private listening = false
  private disposed = false
  private responseText = ""
  private lastAssistantText = ""
  private messageRoles = new Map<string, "user" | "assistant">()
  private interruptionInFlight = false
  private unsubscribeEvents: (() => void) | null = null
  private unsubNarrate: (() => void) | null = null
  private partialTimer: ReturnType<typeof setInterval> | null = null
  private partialSub: (() => void) | null = null
  private defaultModel: BridgeModelOption | null = null

  setDefaultModel(model: BridgeModelOption): void {
    this.defaultModel = model
  }

  constructor(opts: VoiceControllerOptions) {
    this.opts = opts
    this.vad = new VadDetector(opts.vadConfig)
    this.narrator = opts.narrator ?? new Narrator()
    this.interruption = new InterruptionCoordinator({
      stopTts: () => opts.synthesizer.stop(),
      clearNarration: () => this.narrator.clear(),
      cancelAgent: () => opts.bridge.abort(),
    })
  }

  getSnapshot(): VoiceControllerState {
    return {
      state: this.state,
      transcript: this.transcript,
      partialTranscript: this.partialTranscript,
      conversation: [...this.conversation],
      activity: [...this.activity],
      error: this.error,
      opencodeSessionId: this.opts.bridge.sessionId,
    }
  }

  private setState(next: VoiceState) {
    if (!TRANSITIONS[this.state]?.includes(next)) {
      // Invalid transition — reject silently except for tests (see isState).
      return
    }
    this.state = next
    this.opts.onStateChange?.(this.getSnapshot())
  }

  /** True when `next` is a permitted transition from the current state. */
  canTransition(next: VoiceState): boolean {
    return TRANSITIONS[this.state]?.includes(next) ?? false
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async open(): Promise<void> {
    if (this.bridgeReady) return
    const sessionId = await this.opts.bridge.connect()
    this.bridgeReady = true
    this.activity.unshift(`Session: ${sessionId}`)

    if (!this.partialSub) {
      this.partialSub = this.opts.recognizer.onPartial((text) => {
        this.partialTranscript = text
        this.opts.onStateChange?.(this.getSnapshot())
      })
    }

    this.unsubNarrate = this.narrator.onNarrate((text, priority) => {
      this.speechQueue.push(text)
      void this.drainSpeech(priority)
    })

    this.unsubscribeEvents = this.opts.bridge.onEvent((ev) => this.handleBridgeEvent(ev))
  }

  async dispose(): Promise<void> {
    this.disposed = true
    if (this.partialTimer) clearInterval(this.partialTimer)
    this.partialSub?.()
    this.partialSub = null
    this.unsubNarrate?.()
    this.unsubscribeEvents?.()
    await this.opts.capture?.stop()
    await this.opts.recognizer.stop()
    this.opts.synthesizer.stop()
    this.narrator.stop()
    await this.opts.bridge.close()
  }

  // -------------------------------------------------------------------------
  // Listening (doc §5 API)
  // -------------------------------------------------------------------------

  /**
   * Take the floor and listen. When the agent is still busy or speaking, an
   * explicit start interrupts first (user wants the floor).
   */
  async startListening(): Promise<void> {
    if (this.disposed || this.interruptionInFlight) return
    if (this.busyWithAgent || this.speaking || this.speechQueue.length > 0) {
      await this.interrupt()
      return
    }
    if (this.listening) {
      // already capturing — a retry still dismisses a stale error banner
      if (this.error) {
        this.error = null
        this.opts.onStateChange?.(this.getSnapshot())
      }
      return
    }
    // working/speaking are valid sources once the floor is free
    const okSources: VoiceState[] = ["idle", "error", "listening", "working", "speaking"]
    if (!okSources.includes(this.state)) return
    this.setState("listening")
    this.listening = true
    this.partialTranscript = ""
    this.error = null
    try {
      await this.opts.recognizer.start()
      if (!this.opts.capture?.running) {
        this.opts.capture?.start().catch(() => {
          this.setError("Microphone tidak tersedia. Gunakan keyboard.")
        })
      }
      if (!this.partialTimer) {
        this.partialTimer = setInterval(() => this.opts.recognizer.flushPartial(), 500)
      }
    } catch (err) {
      this.listening = false
      this.setError(err instanceof Error ? err.message : String(err))
    }
  }

  async stopListening(): Promise<void> {
    this.listening = false
    if (this.partialTimer) clearInterval(this.partialTimer)
    this.partialTimer = null
    await this.opts.capture?.stop()
  }

  /** Keyboard fallback — submit text exactly like a voice transcript. */
  async keyboardSubmit(text: string): Promise<void> {
    await this.stopListening()
    await this.submitTranscript(text)
  }

  // -------------------------------------------------------------------------
  // Utterance flow
  // -------------------------------------------------------------------------

  /**
   * Feed a PCM16 chunk (called by the capture sink). VAD runs whenever the
   * mic is live — including WORKING/SPEAKING so barge-in works (doc §11).
   * Audio reaches the recognizer only while an utterance is open.
   */
  feedAudio(chunk: Buffer): void {
    if (!this.listening) return
    const vadEvents = this.vad.feed(chunk)
    for (const ev of vadEvents) this.onVadEvent(ev)
    if (this.turn.active) {
      this.opts.recognizer.feedAudio(chunk)
    }
  }

  private onVadEvent(ev: VadEvent) {
    for (const turn of this.turn.onVadEvent(ev)) {
      if (turn.type === "user_speech_start") {
        // barge-in: user interrupts TTS or a running agent
        if (this.state === "speaking" || this.state === "working") {
          void this.interrupt()
        }
      } else if (turn.type === "turn_end") {
        void this.endUtterance()
      }
    }
  }

  private async endUtterance(): Promise<void> {
    if (this.state !== "listening") return
    this.setState("transcribing")
    if (this.partialTimer) clearInterval(this.partialTimer)
    this.partialTimer = null
    try {
      const final = await this.opts.recognizer.end()
      this.transcript = final
      this.partialTranscript = ""
      if (final.trim()) {
        await this.submitTranscript(final.trim())
      } else {
        this.setState("listening")
        this.listening = true
      }
    } catch (err) {
      this.setError(err instanceof Error ? err.message : String(err))
      this.setState("listening")
      this.listening = true
    }
  }

  private async submitTranscript(text: string): Promise<void> {
    if (!this.bridgeReady) await this.open()
    this.setState("submitting")
    this.responseText = ""
    this.conversation.push({ role: "user", text })
    try {
      await this.opts.bridge.sendMessage(text, this.defaultModel ?? undefined)
      this.busyWithAgent = true
      this.setState("working")
    } catch (err) {
      this.setError(err instanceof Error ? err.message : String(err))
      this.setState("listening")
      this.listening = true
    }
  }

  // -------------------------------------------------------------------------
  // Interruption (doc §11)
  // -------------------------------------------------------------------------

  async interrupt(): Promise<InterruptionResult> {
    if (this.interruptionInFlight) return { ttsStopped: true, narrationCleared: true, agentCancelled: false }
    this.interruptionInFlight = true
    if (this.partialTimer) clearInterval(this.partialTimer)
    this.partialTimer = null

    const result = await this.interruption.interrupt()
    this.speechQueue = []
    this.speaking = false
    this.responseText = ""
    this.busyWithAgent = false

    if (this.state !== "error") this.setState("interrupting")
    if (result.agentError) this.activity.push(`! ${result.agentError}`)
    this.setState("listening")
    this.interruptionInFlight = false
    void this.startListening()
    return result
  }

  // -------------------------------------------------------------------------
  // Narration / speech (doc §10)
  // -------------------------------------------------------------------------

  private async drainSpeech(priority: NarrationPriority) {
    if (this.speaking || this.disposed) return
    const text = this.speechQueue.shift()
    if (!text) {
      this.maybeAutoListen()
      return
    }
    this.speaking = true
    if (this.state === "working" || this.state === "listening") this.setState("speaking")
    try {
      await this.opts.synthesizer.speak(text)
    } catch {
      // TTS failure → text already visible in conversation/activity
    } finally {
      this.speaking = false
      void this.drainSpeech(priority)
    }
  }

  private maybeAutoListen() {
    if (this.disposed) return
    if (this.speaking || this.speechQueue.length > 0 || this.busyWithAgent || this.interruptionInFlight) return
    // guards already guarantee the floor is free — transition directly instead
    // of going through startListening() (which would interrupt a busy agent)
    if (this.state === "speaking" || this.state === "working" || this.state === "submitting") {
      this.setState("listening")
    }
    this.listening = true
  }

  // -------------------------------------------------------------------------
  // OpenCode events (doc §10 narration)
  // -------------------------------------------------------------------------

  private handleBridgeEvent(ev: BridgeEvent) {
    if (this.disposed) return
    const p = ev.properties ?? {}
    const sessionId = p.sessionID

    switch (ev.type) {
      case "bridge.error":
        this.setError(String(p.message ?? "Koneksi OpenCode bermasalah."))
        return
      case "message.updated": {
        const info = p.info as { id?: string; role?: string } | undefined
        if (info?.id && (info.role === "user" || info.role === "assistant")) {
          this.messageRoles.set(info.id, info.role)
        }
        break
      }
      case "message.part.updated": {
        const part = p.part as Record<string, unknown> | undefined
        if (part && part.sessionID === sessionId) {
          // only assistant text parts feed the response buffer — user echoes
          // also arrive here as text parts and must not be committed
          const role = this.messageRoles.get(String(part.messageID ?? ""))
          if (part.type === "text" && role === "assistant") {
            this.responseText = String(part.text ?? "")
            if (part.time && (part.time as { end?: number }).end) {
              this.finalizeAssistantText()
            }
          }
          if (part.type === "tool") {
            const tool = String(part.tool ?? "")
            const status = (part.state as { status?: string })?.status
            if (tool && status === "running") this.activity.push(`• ${tool}`)
          }
        }
        break
      }
      case "session.next.text.ended": {
        const text = String(p.text ?? "").trim()
        if (text && text !== this.lastAssistantText) {
          this.lastAssistantText = text
          this.conversation.push({ role: "assistant", text })
        }
        break
      }
      case "session.next.tool.called": {
        const tool = String(p.tool ?? "")
        if (tool) this.activity.push(`• ${tool}`)
        break
      }
      case "session.idle":
        this.busyWithAgent = false
        this.activity.push("✓ Task selesai")
        this.finalizeAssistantText()
        // non-streaming providers never emit assistant text parts — recover the
        // reply from the session message store
        void this.recoverAssistantReply()
        this.maybeAutoListen()
        break
      case "session.updated": {
        const info = p.info as { status?: string } | undefined
        if (info?.status === "busy") this.busyWithAgent = true
        break
      }
    }

    // narration filter decides what is worth speaking
    const narration: NarrationEvent | null = classifyNarration({ type: ev.type, data: p as Record<string, unknown> })
    if (narration) this.narrator.enqueue(narration)
  }

  private async recoverAssistantReply() {
    if (this.lastAssistantText) return // already committed via streamed text
    try {
      const msgs = await this.opts.bridge.getMessages(3)
      for (const msg of msgs.reverse()) {
        if (msg.role === "assistant") {
          const text = msg.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text ?? "")
            .join("")
            .trim()
          if (text && text !== this.lastAssistantText) {
            this.lastAssistantText = text
            this.conversation.push({ role: "assistant", text })
            const item: NarrationEvent = { text, priority: "important_progress", timestamp: Date.now() }
            this.narrator.enqueue(item)
          }
          break
        }
      }
    } catch {
      // best-effort — if the bridge doesn't support messages(), fall through
    }
  }

  private finalizeAssistantText() {
    const text = this.responseText.trim()
    this.responseText = ""
    if (!text || text === this.lastAssistantText) return
    this.lastAssistantText = text
    this.conversation.push({ role: "assistant", text })
    const item: NarrationEvent = {
      text,
      priority: "important_progress",
      timestamp: Date.now(),
    }
    this.narrator.enqueue(item)
  }

  // -------------------------------------------------------------------------

  private setError(message: string) {
    this.error = message
    this.activity.push(`! ${message}`)
    if (this.state !== "error") this.setState("error")
    this.opts.onStateChange?.(this.getSnapshot())
  }
}