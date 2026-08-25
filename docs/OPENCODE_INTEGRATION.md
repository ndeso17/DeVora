# DeVora × OpenCode Integration

Output of Phase 0 (Source Reconnaissance). Reference: OpenCode source at
`~/Documents/Projects/opencode` (v1.18.21).

## Answers (doc §3 Phase 0 exit criteria)

### How does the TUI send a user message?

SDK v2 client (hey-api generated):

```ts
client.session.prompt({
  sessionID,
  parts: [{ type: "text", text }],
}) // POST /session/{sessionID}/message
```

Session is created first via `client.session.create({ title })` → `POST /session`,
returns `{ data: { id, title, directory } }`.

### How does the TUI receive agent events?

Two equivalent paths:

1. SDK SSE stream (headless/standalone):

```ts
const events = await client.event.subscribe() // GET /event (text/event-stream)
for await (const event of events.stream) {
  // event = { id, type, properties }
}
```

2. TUI plugin event bus (inside the OpenCode TUI process):

```ts
api.event.on("message.updated", (event) => { /* typed */ })
```

Event shapes used by DeVora narration (`{ type, properties }`):

| event | properties (relevant) |
|---|---|
| `message.updated` | `sessionID`, `info: Message` |
| `message.part.updated` | `sessionID`, `part` (`part.type` text/tool, `part.time.end`) |
| `session.next.tool.called` | `tool`, `input`, `sessionID` |
| `session.next.tool.success` / `.failed` | `structured`, `result` / `error` |
| `session.next.text.ended` | `text` |
| `session.next.shell.started` / `.ended` | `cmd`, exit code |
| `session.idle` | `sessionID` |
| `session.updated` | `info.status`: `"idle" \| "busy" \| "retry"` |

### How is a running operation cancelled?

```ts
client.session.abort({ sessionID }) // POST /session/{sessionID}/abort
```

"Abort an active session and stop any ongoing AI processing or command
execution." DeVora calls this in the interruption contract after stopping TTS.

### Can a TUI plugin create a full-screen route?

Yes. Verified against `packages/tui/src/feature-plugins/system/diff-viewer.tsx`:

```ts
api.route.register([{ name: "voice", render: () => <VoiceScreen api={api} /> }])
api.route.navigate("voice", params)
```

Route components are Solid JSX (`@opentui/solid`; intrinsics `<box>`, `<text>`;
theme colors from `api.theme.current`). Esc/back navigation returns to the
previous route.

### Can a plugin access the session/client?

Yes `TuiPluginApi` (from `@opencode-ai/plugin/tui`):

- `api.client: OpencodeClient` → session create/prompt/abort
- `api.state.session.messages(sessionID)` / `.status()` / `.permission()` → read models
- `api.event.on(type, cb)` → all server events
- `api.keymap.registerLayer({ commands: [{ name, title, slashName, run }] })` → palette + slash commands
- `api.ui.DialogPrompt` / `api.ui.toast` → keyboard fallback + errors
- `api.lifecycle.onDispose(fn)` + `lifecycle.signal` → mic/process cleanup
- `api.tuiConfig.keybinds.gather(name, commands)` → user-configurable keybinds

### Where should microphone lifecycle live?

In the TUI plugin module (`tui()` function), owned by the VoiceController,
cleaned up through `api.lifecycle`. Rationale:

- The TUI process is the interactive surface; capture must start/stop with the
  voice screen and app exit.
- `arecord` runs as a child process of the TUI killed deterministically on
  dispose/interrupt.

## Plugin loading mechanics

- Module shape: `export default { id: string, tui: async (api, options, meta) => void }`
  (`readV1Plugin` requires exactly one of `server`/`tui`; path plugins require `id`).
- Registration: `opencode.json` → `{ "plugin": ["./packages/devora/dist/plugin.js"] }`
  or `.opencode/tui.json` for TUI-only plugins.
- Build: `bun build src/plugin.tsx --target=bun --external solid-js --external @opentui/solid ...`
  External specifiers are rewritten at load time by the host's runtime plugin
  (`@opentui/solid/runtime-plugin-support`) so the plugin shares the host's
  Solid/OpenTUI instances (single reactivity graph).
- Enable/disable per plugin persists via `kv["plugin_enabled"]`.

## Decision: Option A (plugin) no fork needed

Doc §17 order resolved: the plugin API covers route/screen, keybind/slash,
client/session access, events, lifecycle, renderer/theme access. **No changes to
OpenCode upstream are required.** The only repo-local file is `opencode.json`
pointing at the built plugin bundle.

## Local providers used by this machine

| Role | Provider | Detail |
|---|---|---|
| STT (id) | openai-whisper `base.pt` | multilingual; worker `scripts/stt_worker_whisper.py`; model `models/base.pt` |
| STT (en) | vosk small-en-us | streaming partials; worker `scripts/stt_worker_vosk.py` |
| TTS | piper `id_ID-news_tts-medium` | `/opt/piper-models/id/`; raw PCM piped to `aplay` |
| Capture | ALSA `arecord` | S16LE mono 16 kHz, device `hw:0` |

Measured on this machine: whisper ready ≈ 5–7 s (torch load), utterance final
≈ 2–4 s; piper first-audio < 1 s; interrupt-to-silence ≈ instant (SIGKILL both
piper and aplay); VAD reaction ≤ 200 ms.
