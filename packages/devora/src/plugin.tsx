// DeVora OpenCode TUI Plugin entry (doc §17 Option A).
// Loaded by opencode via `plugin: ["./packages/devora/dist/plugin.js"]` in
// opencode.json or tui.json.
//
// Module shape: { id, tui: (api, options, meta) => Promise<void> }
//   - register the voice route + commands
//   - create the controller + bridge on first use
//   - cleanup on lifecycle dispose

import type { TuiPlugin, TuiPluginApi, TuiPluginMeta } from "@opencode-ai/plugin/tui"
import { VoiceController } from "./conversation/controller.ts"
import { TuiBridge, type TuiClientLike } from "./opencode/bridge.ts"
import { VoiceScreen, type VoiceScreenSubscribers } from "./tui/voice-screen.tsx"
import type { VoiceControllerState } from "./types.ts"
import type { SpeechRecognizer } from "./stt/client.ts"
import type { SpeechSynthesizer } from "./tts/client.ts"
import { MockRecognizer } from "./stt/mock.ts"
import { MockSynthesizer } from "./tts/mock.ts"

const ROUTE = "voice"

let controller: VoiceController | undefined
let subscribers: VoiceScreenSubscribers | undefined
let bridge: TuiBridge | undefined

function createController(api: TuiPluginApi) {
  if (controller) return controller

  subscribers = new Set<(snapshot: VoiceControllerState) => void>()

  // Determine initial session from current route
  const current = api.route.current
  const initialSessionId =
    current.name === "session" ? (current.params?.sessionID as string | undefined) : undefined

  bridge = new TuiBridge(
    api.client as unknown as TuiClientLike,
    { on: (type, handler) => api.event.on(type as never, handler) },
    initialSessionId,
  )

  // Host provides the real TTS/STT providers; fall back to mocks if none
  // configured (should be swapped via devora config).
  // In production, the user configures providers in opencode.json.
  const recognizer: SpeechRecognizer = new MockRecognizer()
  const synthesizer: SpeechSynthesizer = new MockSynthesizer()

  controller = new VoiceController({
    bridge,
    recognizer,
    synthesizer,
    onStateChange: (snap: VoiceControllerState) => {
      subscribers!.forEach((fn) => fn(snap))
    },
  })

  void controller.open().catch((err) => {
    api.ui.toast({ variant: "error", message: `DeVora: ${err.message}` })
  })

  return controller
}

const tui: TuiPlugin = async (api: TuiPluginApi, _options: unknown, _meta: TuiPluginMeta) => {
  const ctrl = createController(api)

  // Register the voice screen route
  api.route.register([
    {
      name: ROUTE,
      render: () => (
        <VoiceScreen
          api={api}
          controller={ctrl}
          subscribers={subscribers!}
        />
      ),
    },
  ])

  // Commands & keybindings
  api.keymap.registerLayer({
    commands: [
      {
        name: "devora.voice.open",
        title: "DeVora Voice Mode",
        slashName: "d",
        category: "DeVora",
        namespace: "palette",
        run() {
          const current = api.route.current
          const params: Record<string, unknown> = {}
          if (current.name === "session") {
            params.sessionID = (current.params as Record<string, unknown>)?.sessionID
          }
          api.route.navigate(ROUTE, params)
        },
      },
      {
        name: "devora.voice.type",
        title: "DeVora: type a command",
        category: "DeVora",
        namespace: "palette",
        run() {
          api.ui.dialog.replace({
            size: "medium",
            onClose: () => api.ui.dialog.clear(),
            children: (
              <api.ui.DialogPrompt
                title="DeVora Voice — ketik perintah"
                placeholder="Ketik perintah di sini…"
                onConfirm={(value) => {
                  void ctrl.keyboardSubmit(value)
                  api.ui.dialog.clear()
                }}
                onCancel={() => api.ui.dialog.clear()}
              />
            ),
          } as never)
        },
      },
      {
        name: "devora.voice.stop",
        title: "DeVora: stop / interrupt",
        category: "DeVora",
        namespace: "palette",
        run() {
          void ctrl.interrupt()
        },
      },
      {
        name: "devora.voice.close",
        title: "DeVora: exit voice mode",
        category: "DeVora",
        namespace: "palette",
        run() {
          api.route.navigate("home")
        },
      },
    ],
    bindings: api.tuiConfig.keybinds.gather("devora.voice", [
      "devora.voice.open",
      "devora.voice.type",
      "devora.voice.stop",
      "devora.voice.close",
    ]),
  })

  // Cleanup
  api.lifecycle.onDispose(async () => {
    await ctrl.dispose().catch(() => {})
    controller = undefined
    subscribers = undefined
    bridge = undefined
  })
}

// For path plugins, `id` is required.
export default { id: "devora", tui }