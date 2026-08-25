// DeVora Voice TUI Screen (doc §7). One new screen, rendered as an OpenCode
// TUI plugin route. Reuses the host theme (api.theme), renderer and keymap.
// Solid JSX intrinsics (<box>/<text>) come from the host's OpenTUI runtime.

import { createSignal, For, Show, onCleanup, onMount } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { RGBA } from "@opentui/core"
import type { VoiceController } from "../conversation/controller.ts"
import type { VoiceControllerState, VoiceState } from "../types.ts"

export type VoiceScreenSubscribers = Set<(snapshot: VoiceControllerState) => void>

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "IDLE",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING…",
  submitting: "SUBMITTING…",
  working: "WORKING",
  speaking: "SPEAKING",
  interrupting: "INTERRUPTING…",
  error: "ERROR",
}

function statusColor(theme: TuiPluginApi["theme"]["current"], state: VoiceState): string | RGBA {
  switch (state) {
    case "listening":
      return theme.success
    case "transcribing":
    case "submitting":
    case "working":
      return theme.info
    case "speaking":
      return theme.accent
    case "interrupting":
      return theme.warning
    case "error":
      return theme.error
    default:
      return theme.textMuted
  }
}

export function VoiceScreen(props: {
  api: TuiPluginApi
  controller: VoiceController
  subscribers: VoiceScreenSubscribers
}) {
  const theme = () => props.api.theme.current
  const [snap, setSnap] = createSignal<VoiceControllerState>(props.controller.getSnapshot())
  const [lastN, setLastN] = createSignal(6)

  onMount(() => {
    props.subscribers.add(setSnap)
    void props.controller.startListening()
  })

  onCleanup(() => {
    props.subscribers.delete(setSnap)
    void props.controller.stopListening()
  })

  const state = () => snap().state
  const label = () => STATE_LABEL[state()]
  const color = () => statusColor(theme(), state())
  const recent = () => snap().conversation.slice(-lastN())
  const activity = () => snap().activity.slice(-lastN())

  return (
    <box flexDirection="column" width="100%" height="100%" padding={1} gap={1}>
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().primary}>
          DeVora Voice
        </text>
        <text fg={theme().textMuted}>Session: {snap().opencodeSessionId ?? "—"}</text>
      </box>

      {/* Status */}
      <box flexDirection="row" gap={1}>
        <text fg={color()}>
          {state() === "listening" ? "🎙" : state() === "speaking" ? "🔊" : state() === "working" ? "⚙" : "·"}{" "}
          {label()}
        </text>
      </box>

      <Show when={snap().error}>
        <text fg={theme().error}>! {snap().error}</text>
      </Show>

      {/* Transcript placeholder / partial */}
      <Show when={snap().partialTranscript && state() !== "idle"}>
        <text fg={theme().textMuted}>
          "{snap().partialTranscript}…"
        </text>
      </Show>

      {/* Conversation */}
      <box flexDirection="column" gap={1} flexGrow={1}>
        <For each={recent()}>
          {(msg) => (
            <box flexDirection="column">
              <text fg={msg.role === "user" ? theme().text : theme().accent}>
                {msg.role === "user" ? "You" : "DeVora"}
              </text>
              <text fg={theme().text} wrapMode="word" width="100%">
                "{msg.text}"
              </text>
            </box>
          )}
        </For>
      </box>

      {/* Activity */}
      <box flexDirection="column" gap={0}>
        <For each={activity()}>
          {(line) => (
            <text fg={theme().textMuted} wrapMode="none" width="100%">
              {line}
            </text>
          )}
        </For>
      </box>

      {/* Footer */}
      <box flexDirection="row" justifyContent="space-between" border={true}>
        <text fg={color()}>🎙 Listening…</text>
        <text fg={theme().textMuted}>Esc Exit Voice Mode · /devora type · /devora stop</text>
      </box>
    </box>
  )
}