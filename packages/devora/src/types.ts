// Shared types for DeVora voice engine.

export type VoiceState =
  | "idle"
  | "listening"
  | "transcribing"
  | "submitting"
  | "working"
  | "speaking"
  | "interrupting"
  | "error"

export type VoiceStateEvent =
  | { type: "start_listening" }
  | { type: "stop_listening" }
  | { type: "transcription_partial"; text: string }
  | { type: "transcription_final"; text: string }
  | { type: "submitted" }
  | { type: "agent_working" }
  | { type: "agent_response"; text: string }
  | { type: "agent_event"; event: string; data?: unknown }
  | { type: "start_speaking" }
  | { type: "stop_speaking" }
  | { type: "interrupt" }
  | { type: "error"; message: string }
  | { type: "cancel" }

export type NarrationPriority = "critical" | "approval" | "error" | "important_progress" | "completion" | "trivial"

export type NarrationEvent = {
  text: string
  priority: NarrationPriority
  timestamp: number
  dedupKey?: string
}

export type AudioDevice = {
  id: string
  name: string
  available: boolean
}

export type AudioCaptureConfig = {
  device?: string
  sampleRate: number
  channels: number
}

export type SpeechRecognizerConfig = {
  provider: "vosk" | "whisper"
  language: string
  modelPath?: string
}

export type SpeechSynthesizerConfig = {
  provider: "piper"
  voice: string
  modelPath: string
  configPath: string
  sampleRate?: number
  /** "speaker" pipes to aplay; "buffer" captures a WAV and calls onBuffer */
  output?: "speaker" | "buffer"
  onBuffer?: (wav: Buffer) => void
}

export type TurnDetectorConfig = {
  silenceMs: number
  minSpeechMs: number
  maxSpeechMs: number
}

export interface VoiceControllerState {
  state: VoiceState
  transcript: string
  partialTranscript: string
  conversation: Array<{ role: "user" | "assistant"; text: string }>
  activity: string[]
  error: string | null
  opencodeSessionId: string | null
}