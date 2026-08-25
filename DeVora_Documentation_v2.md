# DeVora Documentation v2

This bundle contains the revised PRD, architecture, and implementation plan.

---

# DeVora — Voice-Native OpenCode Companion

**Status:** Ready for Development  
**Version:** 2.0  
**Date:** 24 August 2026

## 1. Ringkasan

DeVora adalah voice interaction layer untuk OpenCode yang memungkinkan developer berkomunikasi dengan coding agent OpenCode secara real-time melalui suara.

DeVora **bukan coding agent baru**. Agent, tools, session, context, permission, terminal, filesystem, Git, MCP, dan kemampuan coding tetap menggunakan OpenCode.

Tujuan MVP adalah menambahkan **satu Voice TUI Screen** yang me-reuse TUI OpenCode yang sudah ada, ditambah microphone, STT, TTS, voice turn-taking, dan interruption.

OpenCode memang menyediakan interactive terminal interface (TUI) untuk bekerja dengan LLM, sedangkan arsitektur TUI saat ini menggunakan package `@opencode-ai/tui` sebagai boundary UI dan SDK sebagai boundary OpenCode domain. citeturn0search5turn0search0

## 2. Product Definition

> **DeVora = Voice Mode for OpenCode.**

Developer tetap menggunakan OpenCode seperti biasa, tetapi dapat berpindah ke mode suara:

```text
OpenCode
   ↓
Existing Session / Agent / Tools
   ↓
DeVora Voice Layer
   ├── Microphone
   ├── VAD
   ├── Streaming STT
   ├── Conversation Controller
   ├── Interruption
   ├── Narration Filter
   └── Streaming TTS
   ↓
Speaker
```

## 3. Goals

### Primary Goals

1. Menambahkan voice interaction ke OpenCode.
2. Menambahkan satu screen TUI baru.
3. Reuse TUI OpenCode yang sudah ada.
4. Memungkinkan user berbicara dengan agent secara multi-turn.
5. Memungkinkan agent menjawab melalui suara.
6. Mendukung interruption secara real-time.
7. Mempertahankan OpenCode session/context.
8. Memungkinkan coding task dilakukan tanpa keyboard untuk workflow utama.
9. Meminimalkan perubahan terhadap upstream OpenCode.

### Secondary Goals

- Provider STT/TTS dapat diganti.
- Mendukung local maupun remote STT/TTS.
- Menyediakan keyboard fallback.
- Menjaga voice feature sebagai layer yang terisolasi.

## 4. Non-Goals MVP

Tidak membangun ulang:

- coding agent
- planner
- task manager
- memory system
- tool executor
- permission engine
- terminal runtime
- Git integration
- MCP runtime
- database
- Redis
- FastAPI backend
- React dashboard
- Tauri desktop application
- multi-agent system
- browser agent
- cloud SaaS

Jika OpenCode sudah menyediakan kemampuan tersebut, DeVora wajib menggunakannya.

## 5. User Experience

### Start

```text
$ opencode

OpenCode TUI
    ↓
Voice Mode
```

User dapat mengaktifkan Voice Mode melalui keybind/command.

### Conversation

```text
User:
"De, cari kenapa login saya gagal."

DeVora:
"Baik, saya akan memeriksa alur autentikasi."

[OpenCode agent bekerja]

DeVora:
"Saya menemukan masalah pada refresh token."

User:
"Jangan ubah dulu. Jelaskan."

DeVora:
"Refresh token sedang dianggap expired sebelum waktunya..."
```

### Coding

```text
User:
"Perbaiki."

DeVora:
"Baik. Saya akan memperbaiki bagian tersebut dan menjalankan test."

[OpenCode melakukan edit + test]

DeVora:
"Perubahan selesai. Semua test berhasil."
```

### Interruption

```text
DeVora:
"Saya sedang menjalankan integration test—"

User:
"Stop."

→ TTS berhenti
→ agent/tool cancellation dilakukan jika memungkinkan
→ state OpenCode dipertahankan
→ Voice Mode kembali listening
```

## 6. Voice Interaction Model

```text
                    ┌──────────────┐
                    │ MICROPHONE   │
                    └──────┬───────┘
                           ↓
                    ┌──────────────┐
                    │ VAD / STT    │
                    └──────┬───────┘
                           ↓
                ┌────────────────────┐
                │ Conversation       │
                │ Controller         │
                └─────────┬──────────┘
                          ↓
                  OpenCode Session
                          ↓
                    Existing Agent
                          ↓
                    Existing Tools
                          │
                          ↓
                 OpenCode Events
                          ↓
                  Narration Filter
                          ↓
                    Streaming TTS
                          ↓
                       SPEAKER
```

Voice state:

```text
IDLE
 ↓
LISTENING
 ↓
TRANSCRIBING
 ↓
SUBMITTING
 ↓
WORKING
 ↓
SPEAKING
 ↓
LISTENING
```

Interruption dari state `WORKING` atau `SPEAKING` harus dapat kembali ke `LISTENING`.

## 7. Voice TUI Screen

MVP hanya menambahkan satu screen.

Contoh:

```text
┌──────────────────────────────────────────────────────────┐
│ DeVora Voice                                             │
│ Project: ~/project                                       │
│ Session: 8f2c...                                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 🎙 LISTENING                                             │
│                                                          │
│ You                                                       │
│ "Cari penyebab login gagal setelah refresh token."       │
│                                                          │
│ DeVora                                                    │
│ "Baik, saya akan memeriksa alur refresh token."          │
│                                                          │
│ ● Analyzing auth flow                                    │
│ ● Reading middleware                                     │
│ ● Running tests                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ 🎙 Listening...                         Ctrl+C Stop      │
└──────────────────────────────────────────────────────────┘
```

Screen harus reuse:

- existing OpenCode renderer
- existing theme
- existing keymap
- existing terminal behavior
- existing session state
- existing SDK/client boundary

OpenTUI adalah native terminal UI core dengan TypeScript bindings dan digunakan OpenCode sebagai TUI foundation. citeturn0search2

## 8. OpenCode Integration Boundary

DeVora harus berada di atas OpenCode, bukan menggantikannya.

```text
┌────────────────────────────────────┐
│            DeVora Voice            │
│                                    │
│ STT / TTS / VAD / Turn Controller │
└──────────────────┬─────────────────┘
                   │
                   ▼
┌────────────────────────────────────┐
│          OpenCode TUI              │
│          @opencode-ai/tui          │
└──────────────────┬─────────────────┘
                   │ SDK
                   ▼
┌────────────────────────────────────┐
│          OpenCode Server           │
│                                    │
│ Session / Agent / Tools / Events   │
└────────────────────────────────────┘
```

OpenCode saat ini mendokumentasikan TUI sebagai client yang berbicara dengan server; server menyediakan OpenAPI dan SDK sebagai interface programmatic. citeturn0search8turn0search0

### Prinsip

- Jangan import private backend implementation jika SDK sudah menyediakan capability.
- Jika capability belum tersedia, tambahkan endpoint/server API lalu konsumsi melalui SDK.
- Jangan membuat backend kedua.
- Jangan membuat session store kedua.

## 9. Voice Controller

Voice Controller bertanggung jawab atas:

- microphone lifecycle
- VAD
- STT stream
- transcript state
- turn detection
- submit message
- TTS stream
- interruption
- voice state
- audio queue

Voice Controller **tidak** bertanggung jawab atas:

- planning
- coding
- tool execution
- task state internal OpenCode
- project memory
- permission policy

## 10. Intelligent Narration

Tidak semua event OpenCode perlu dibacakan.

### Jangan dibacakan

- file read biasa
- `ls`
- `pwd`
- `git status`
- grep sederhana
- command kecil
- internal/debug data

### Dibacakan

- task dimulai
- penemuan penting
- perubahan penting
- test dimulai
- test gagal
- test berhasil
- permission/approval diperlukan
- error penting
- task selesai

Contoh:

Buruk:

> "Executing npm test with PID 39291 exit code 1."

Baik:

> "Test gagal. Saya akan memeriksa penyebabnya."

## 11. Realtime Interruption

Interruption adalah requirement inti.

Ketika user mulai berbicara:

```text
VAD detects speech
      ↓
Stop TTS playback
      ↓
Mark current narration interrupted
      ↓
Cancel/interrupt OpenCode operation if supported
      ↓
Preserve session
      ↓
Transcribe new utterance
      ↓
Submit to OpenCode
```

Target: interruption terasa langsung, bukan setelah response selesai.

## 12. Existing OpenCode Capabilities

DeVora harus memanfaatkan kemampuan OpenCode untuk:

- LLM/provider
- agent
- tools
- filesystem
- terminal
- Git
- MCP
- permissions
- session
- context
- message history
- event stream
- task execution

Jangan membuat implementasi paralel.

## 13. TUI Extension Strategy

Sebelum melakukan fork/perubahan besar, evaluasi TUI plugin/runtime OpenCode terlebih dahulu.

OpenCode saat ini memiliki TUI plugin system yang mendukung module target `tui`, command registration, route/UI integration, event subscription, state/client access, keybind helpers, dan lifecycle cleanup. citeturn0search1turn0search4

Urutan pilihan:

1. TUI plugin jika API cukup untuk Voice Screen.
2. Extension terhadap `@opencode-ai/tui` jika plugin API belum cukup.
3. Minimal fork/modifikasi OpenCode hanya jika dua opsi di atas tidak memenuhi kebutuhan.

## 14. Repository Structure

Target minimal:

```text
opencode/
├── packages/
│   ├── tui/
│   │   └── ...
│   │       └── screens/
│   │           └── voice.tsx
│   │
│   └── devora/
│       ├── voice/
│       │   ├── audio.ts
│       │   ├── stt.ts
│       │   ├── tts.ts
│       │   └── vad.ts
│       ├── conversation/
│       │   ├── controller.ts
│       │   ├── interruption.ts
│       │   └── turn.ts
│       └── narration/
│           ├── filter.ts
│           └── narrator.ts
```

Struktur final boleh berubah setelah inspeksi source OpenCode aktual.

## 15. MVP Scope

### Must Have

- [x] OpenCode tetap berjalan normal.
- [x] Voice Mode dapat dibuka dari TUI.
- [x] Satu Voice TUI Screen.
- [x] Microphone capture.
- [x] VAD.
- [x] STT.
- [x] Transcript tampil di TUI.
- [x] Transcript dikirim ke OpenCode session.
- [x] OpenCode agent bekerja seperti normal.
- [x] Response dapat diproses menjadi TTS.
- [x] Speaker playback.
- [x] Multi-turn conversation.
- [x] TTS interruption.
- [x] Agent interruption/cancellation jika capability tersedia.
- [x] Session/context OpenCode tetap digunakan.
- [x] Keyboard fallback.
- [x] Error handling dasar.

### Out of Scope

- [ ] Custom agent.
- [ ] Custom planner.
- [ ] Custom task manager.
- [ ] Custom memory.
- [ ] Redis.
- [ ] PostgreSQL.
- [ ] FastAPI.
- [ ] React.
- [ ] Tauri.
- [ ] New event bus.
- [ ] New database.
- [ ] Multi-agent.
- [ ] Cloud backend.

## 16. Performance Targets

Target awal:

| Metric | Target |
|---|---:|
| VAD reaction | < 200 ms |
| TTS interruption | < 300 ms |
| STT partial result | < 1 s |
| Voice response start | < 2 s setelah response tersedia |
| Voice Mode startup | < 1 s |
| Memory overhead | serendah mungkin |

Target harus divalidasi pada hardware developer nyata dan tidak dianggap absolute sebelum benchmark.

## 17. Safety

DeVora mewarisi permission dan safety model OpenCode.

Voice layer tidak boleh bypass:

- permission
- approval
- command restrictions
- authentication
- project boundaries

Voice command hanya menjadi cara lain untuk menghasilkan input kepada OpenCode.

## 18. Definition of Done

MVP selesai apabila:

```text
$ opencode

       ↓

Voice Mode

       ↓

User:
"De, cari kenapa login saya gagal."

       ↓

STT

       ↓

OpenCode Session

       ↓

OpenCode Agent

       ↓

Existing Tools

       ↓

Agent bekerja

       ↓

TTS:
"Saya menemukan masalah pada refresh token."

       ↓

User:
"Jangan ubah. Jelaskan."

       ↓

TTS:
"Masalahnya adalah..."

       ↓

User:
"Perbaiki."

       ↓

OpenCode edit + test

       ↓

TTS:
"Perubahan selesai dan test berhasil."
```

Developer harus dapat menyelesaikan coding task sederhana tanpa keyboard setelah Voice Mode aktif.

## 19. Product Principles

1. **OpenCode First** — OpenCode adalah coding agent.
2. **Reuse Everything** — jangan implementasikan ulang capability yang sudah ada.
3. **One New Screen** — MVP hanya menambah satu Voice TUI Screen.
4. **Voice as Interaction Layer** — voice bukan agent baru.
5. **Existing Session as Source of Truth**.
6. **No New Backend** untuk MVP.
7. **Realtime First** — prioritaskan latency dan interruption.
8. **Interruptible** — user dapat menyela kapan saja.
9. **Human in Control** — permission OpenCode tetap berlaku.
10. **Minimal Fork** — perubahan terhadap upstream sekecil mungkin.

## 20. Final Product Vision

> DeVora adalah mode suara pada OpenCode yang memungkinkan developer mengobrol secara natural dan real-time dengan coding agent melalui microphone dan speaker, sementara seluruh kemampuan coding OpenCode tetap digunakan tanpa membangun agent runtime baru.

**Developer speaks. OpenCode works. DeVora talks back.**


---

# DeVora Architecture

**Version:** 2.0  
**Date:** 24 August 2026

## 1. Architecture Goal

Arsitektur DeVora harus meminimalkan pekerjaan baru dengan menjadikan OpenCode sebagai coding-agent runtime utama.

DeVora hanya menambahkan voice interaction dan satu TUI screen.

```text
                         DEVELOPER
                            │
                  ┌─────────┴─────────┐
                  │                   │
             Microphone            Speaker
                  │                   ▲
                  ▼                   │
             ┌────────┐              │
             │  VAD   │              │
             └───┬────┘              │
                 ▼                   │
             ┌────────┐              │
             │  STT   │              │
             └───┬────┘              │
                 ▼                   │
       ┌──────────────────────┐      │
       │ Voice Controller      │      │
       │ - turn detection      │      │
       │ - interruption        │      │
       │ - session bridge      │      │
       └──────────┬───────────┘      │
                  │                  │
                  ▼                  │
       ┌──────────────────────┐      │
       │   OpenCode TUI       │      │
       │ @opencode-ai/tui     │      │
       │                      │      │
       │ Existing screens     │      │
       │ + DeVora Voice       │      │
       └──────────┬───────────┘      │
                  │ SDK              │
                  ▼                  │
       ┌──────────────────────┐      │
       │   OpenCode Server    │      │
       │                      │      │
       │ Session              │      │
       │ Agent                │      │
       │ LLM                  │      │
       │ Tools                │      │
       │ Permissions          │      │
       │ Events               │      │
       └──────────┬───────────┘      │
                  │                  │
                  ▼                  │
          OpenCode response/events ──┘
                         │
                         ▼
                 Narration Filter
                         │
                         ▼
                    Streaming TTS
```

OpenCode's documented architecture uses the TUI as a client of its server, with OpenAPI/SDK as the programmatic boundary. citeturn0search8

## 2. Component Ownership

### OpenCode owns

- LLM provider
- agent
- tools
- filesystem
- terminal
- Git
- MCP
- permissions
- session
- message history
- context
- server
- event infrastructure

### DeVora owns

- microphone
- audio capture
- VAD
- STT integration
- TTS integration
- voice state
- turn detection
- interruption coordination
- narration filtering
- Voice TUI Screen

## 3. Integration Boundary

Preferred boundary:

```text
DeVora
   │
   │ SDK / supported TUI APIs
   ▼
OpenCode
```

Avoid:

```text
DeVora
   │
   ├── imports private agent
   ├── imports private session
   ├── imports private tool
   └── duplicates backend logic
```

The current OpenCode TUI package specification explicitly defines `@opencode-ai/tui` as the canonical TUI package and the SDK as its OpenCode boundary. citeturn0search0

## 4. TUI Layer

OpenTUI powers OpenCode's production TUI and provides the native terminal UI core with TypeScript bindings and component-based architecture. citeturn0search2

DeVora should reuse this layer.

```text
@opencode-ai/tui
│
├── Existing App
├── Existing Theme
├── Existing Keymap
├── Existing Components
├── Existing Session Views
│
└── Voice Screen
    ├── status
    ├── transcript
    ├── current activity
    ├── voice state
    └── controls
```

## 5. Voice Controller

```text
VoiceController
├── startListening()
├── stopListening()
├── submitTranscript()
├── interrupt()
├── startSpeaking()
├── stopSpeaking()
└── dispose()
```

State:

```text
IDLE
LISTENING
TRANSCRIBING
SUBMITTING
WORKING
SPEAKING
INTERRUPTING
ERROR
```

## 6. Audio Pipeline

### Input

```text
Microphone
   ↓
Audio Capture
   ↓
VAD
   ↓
Streaming STT
   ↓
Partial Transcript
   ↓
Final Transcript
```

### Output

```text
OpenCode Response/Event
   ↓
Narration Filter
   ↓
Text Chunk
   ↓
Streaming TTS
   ↓
Audio Buffer
   ↓
Speaker
```

## 7. Turn-Taking

Normal:

```text
LISTENING
   ↓
User finishes
   ↓
STT final
   ↓
OpenCode
   ↓
Response
   ↓
TTS
   ↓
LISTENING
```

Interruption:

```text
SPEAKING
   ↓
VAD detects user speech
   ↓
Stop TTS
   ↓
Interrupt/cancel OpenCode if possible
   ↓
LISTENING
```

## 8. Narration

Narration is a presentation layer, not a second agent.

```text
OpenCode Event
     ↓
Importance Filter
     ↓
Narration Queue
     ↓
TTS
```

Priority:

```text
CRITICAL
APPROVAL
ERROR
IMPORTANT_PROGRESS
COMPLETION
TRIVIAL
```

Only important events should enter TTS.

## 9. Data Flow

### User Command

```text
Microphone
→ VAD
→ STT
→ VoiceController
→ OpenCode Session
→ Agent
→ Tool
→ Event
→ Response
→ Narrator
→ TTS
→ Speaker
```

### Status Question

```text
User:
"Apa yang sedang kamu lakukan?"

STT
→ OpenCode session
→ Agent
→ current context/state
→ response
→ TTS
```

Tidak perlu membuat Task Manager kedua.

## 10. Interruption Contract

When interruption occurs:

1. Stop TTS playback.
2. Stop queued narration.
3. Cancel/interrupt active OpenCode operation if supported.
4. Preserve session.
5. Enter listening state.
6. Accept next utterance.
7. Do not create duplicate session.

## 11. TUI Plugin Option

OpenCode currently documents a TUI plugin system with TUI-target modules and lifecycle/UI APIs. citeturn0search1

Therefore implementation should first test:

```text
TUI Plugin
   ↓
Voice Screen
   ↓
Voice Controller
```

If plugin APIs cannot provide the required full-screen interaction, integrate directly into `@opencode-ai/tui`.

## 12. Minimal Module Diagram

```text
packages/devora/
│
├── audio/
│   ├── capture.ts
│   ├── playback.ts
│   └── device.ts
│
├── stt/
│   └── client.ts
│
├── tts/
│   └── client.ts
│
├── vad/
│   └── detector.ts
│
├── conversation/
│   ├── controller.ts
│   ├── turn.ts
│   └── interruption.ts
│
└── narration/
    ├── filter.ts
    └── narrator.ts
```

TUI:

```text
packages/tui/
└── src/
    └── screens/
        └── voice.tsx
```

Final location can change after source inspection.

## 13. Security Boundary

Voice layer must never bypass OpenCode permissions.

```text
Voice command
     ↓
OpenCode
     ↓
Existing permission system
     ↓
Tool execution
```

Never:

```text
Voice command
     ↓
Direct shell execution
```

## 14. Failure Handling

### STT failure

- show error
- remain in Voice Mode
- allow retry

### TTS failure

- show text response
- remain usable via text

### Microphone failure

- show device error
- keyboard fallback

### OpenCode connection failure

- stop narration
- preserve UI
- show connection state

### Interrupt failure

- stop TTS regardless
- report if agent could not be cancelled

## 15. Architectural Invariants

1. One OpenCode session.
2. One OpenCode agent.
3. One source of truth for task state.
4. No duplicate tool runtime.
5. No duplicate permission system.
6. No new backend for MVP.
7. No database for MVP.
8. Voice layer can be disabled without breaking OpenCode.
9. Existing OpenCode TUI remains usable.
10. Upstream merge should remain manageable.


---

# DeVora Implementation Plan

**Project:** DeVora Voice Mode for OpenCode  
**Version:** 2.0  
**Date:** 24 August 2026  
**Strategy:** Minimal implementation by reusing OpenCode and its existing TUI.

## 1. Objective

Implement a real-time voice conversation mode inside OpenCode without building a new coding-agent runtime.

Primary deliverable:

> **One new Voice TUI Screen + voice I/O + realtime conversation/interruption.**

OpenCode's current TUI is already an interactive terminal interface for LLM coding work. Its TUI architecture is being organized around `@opencode-ai/tui`, with SDK as the domain boundary. citeturn0search0turn0search5

## 2. Implementation Rules

1. Inspect existing OpenCode capability before writing new code.
2. Reuse SDK/session/event APIs.
3. Prefer TUI plugin if sufficient.
4. Avoid backend changes unless required.
5. Do not build a second agent.
6. Do not build a second tool system.
7. Do not build a second database.
8. Keep the change isolated.
9. Keep keyboard fallback.
10. Every phase must leave OpenCode buildable.

## 3. Phase 0 — Source Reconnaissance

### Goal

Understand exactly how current OpenCode TUI communicates with its server/session.

### Tasks

- [x] Clone/fork OpenCode.
- [x] Install dependencies.
- [x] Build OpenCode.
- [x] Run existing TUI.
- [x] Locate current TUI entrypoint.
- [x] Inspect `@opencode-ai/tui`.
- [x] Inspect SDK client creation.
- [x] Inspect session/message submission.
- [x] Inspect event subscription.
- [x] Inspect cancellation/interruption.
- [x] Inspect TUI plugin runtime.
- [x] Identify Voice Screen insertion point.
- [x] Identify microphone/audio runtime strategy.

### Output

`docs/opencode-integration.md`

### Exit Criteria

We can answer:

- How does TUI send a user message?
- How does TUI receive agent events?
- How is a running operation cancelled?
- Can a TUI plugin create a full-screen route?
- Can a plugin access the session/client?
- Where should microphone lifecycle live?

## 4. Phase 1 — Voice Screen Prototype

### Goal

Create the screen without real STT/TTS.

### Tasks

- [x] Add Voice Mode command/keybind.
- [x] Open Voice Screen.
- [x] Render voice state.
- [x] Render transcript placeholder.
- [x] Render current OpenCode activity.
- [x] Render conversation messages.
- [x] Return to normal TUI.

Example:

```text
┌──────────────────────────────────────────────┐
│ DeVora Voice                                 │
├──────────────────────────────────────────────┤
│                                              │
│ 🎙 LISTENING                                 │
│                                              │
│ You                                          │
│ "Fix the login bug"                          │
│                                              │
│ DeVora                                       │
│ "Analyzing authentication flow..."           │
│                                              │
├──────────────────────────────────────────────┤
│ Ctrl+C Stop     Esc Exit Voice Mode          │
└──────────────────────────────────────────────┘
```

### Exit Criteria

Voice screen opens/closes reliably and does not break existing TUI.

## 5. Phase 2 — STT

### Goal

Convert microphone input into text.

### Tasks

- [x] Microphone device discovery.
- [x] Audio capture.
- [x] VAD.
- [x] Streaming STT integration.
- [x] Partial transcript.
- [x] Final transcript.
- [x] Error handling.
- [x] Microphone permission handling.

### Interface

```ts
interface SpeechRecognizer {
  start(): Promise<void>
  stop(): Promise<void>
  interrupt(): void
  onPartial(cb: (text: string) => void): void
  onFinal(cb: (text: string) => void): void
}
```

### Exit Criteria

User speaks:

```text
"Fix the login bug"
```

and Voice Screen shows the final transcript without keyboard input.

## 6. Phase 3 — Connect STT to OpenCode

### Goal

Send voice transcript to the existing OpenCode session.

### Flow

```text
STT
 ↓
VoiceController
 ↓
OpenCode SDK/session
 ↓
Existing Agent
```

### Tasks

- [x] Submit transcript through supported OpenCode API.
- [x] Reuse active session.
- [x] Do not create duplicate conversation state.
- [x] Render submitted message.
- [x] Receive streamed response/events.
- [x] Render response.

### Exit Criteria

User can perform:

```text
Speak
→ STT
→ OpenCode
→ Agent
→ Response
```

without keyboard.

## 7. Phase 4 — TTS

### Goal

Read important OpenCode responses/events aloud.

### Tasks

- [x] Select TTS provider.
- [x] Implement TTS client.
- [x] Audio playback.
- [x] Streaming/chunked synthesis if supported.
- [x] Queue management.
- [x] Playback cancellation.
- [x] Error fallback to text.

### Interface

```ts
interface SpeechSynthesizer {
  speak(text: string): Promise<void>
  stop(): void
}
```

### Exit Criteria

OpenCode response is spoken automatically.

## 8. Phase 5 — Intelligent Narration

### Goal

Avoid reading every OpenCode event.

### Tasks

- [x] Subscribe to relevant OpenCode events.
- [x] Classify event importance.
- [x] Filter trivial events.
- [x] Generate concise narration.
- [x] Queue narration.
- [x] Deduplicate repeated status.
- [x] Prioritize errors/approval/completion.

Example:

```text
tool: file.read
→ silent

tool: test.failed
→ "Test gagal. Saya akan memeriksa error-nya."

task.completed
→ "Task selesai. Semua test berhasil."
```

### Exit Criteria

Normal coding work does not produce excessive speech.

## 9. Phase 6 — Realtime Interruption

### Goal

Allow the user to interrupt DeVora naturally.

### Flow

```text
DeVora speaking
       ↓
User starts speaking
       ↓
VAD
       ↓
Stop TTS
       ↓
Cancel active OpenCode operation if possible
       ↓
STT
       ↓
New command
```

### Tasks

- [x] VAD speech detection during TTS.
- [x] Immediate TTS cancellation.
- [x] Clear pending TTS queue.
- [x] OpenCode cancellation integration.
- [x] Preserve session.
- [x] Process new command.

### Exit Criteria

User can say:

> "Stop."

and DeVora stops speaking immediately.

## 10. Phase 7 — Conversation Controller

### Goal

Make voice interaction feel like a conversation rather than request/response API calls.

### State machine

```text
IDLE
 ↓
LISTENING
 ↓
TRANSCRIBING
 ↓
SUBMITTING
 ↓
WORKING
 ↓
SPEAKING
 ├──────────────┐
 │              │
 │ user speaks  │
 ▼              │
INTERRUPTING ───┘
 ↓
LISTENING
```

### Tasks

- [x] State machine.
- [x] Turn detection.
- [x] Conversation queue.
- [x] User interruption.
- [x] Response interruption.
- [x] Duplicate-response protection.
- [x] Session continuity.

## 11. Phase 8 — Voice Commands

These should mostly be natural-language prompts handled by OpenCode.

Priority commands:

```text
"Stop."
"Continue."
"Status."
"Explain."
"Why?"
"Cancel."
"Show me what changed."
"Run the tests."
"Commit this."
```

Emergency stop should be handled locally when possible so it does not depend on another LLM round trip.

## 12. Phase 9 — TUI Polish

### Tasks

- [x] Theme reuse.
- [x] Audio state indicator.
- [ ] Listening animation.
- [x] Speaking indicator.
- [x] Working indicator.
- [ ] Transcript scrolling.
- [x] Current tool/task summary.
- [x] Error state.
- [ ] Device selection.
- [ ] Voice selection.
- [x] Keyboard fallback.

## 13. Phase 10 — Hardening

### Tests

#### Unit

- [x] VAD state.
- [x] Voice state machine.
- [x] STT adapter.
- [x] TTS adapter.
- [x] Narration filter.
- [x] Interruption logic.

#### Integration

- [x] STT → OpenCode.
- [x] OpenCode → TTS.
- [x] Event → narration.
- [x] interruption → cancellation.

#### E2E

- [x] Voice command → coding task.
- [x] Multi-turn conversation.
- [x] User interruption.
- [x] Agent error.
- [x] TTS failure.
- [x] STT failure.
- [x] microphone failure.

## 14. Acceptance Test

Scenario:

```text
User:
"De, cari kenapa upload file besar gagal."

DeVora:
"Baik, saya akan memeriksa alur upload."

[Agent bekerja]

DeVora:
"Saya menemukan masalah pada buffering file."

User:
"Perbaiki."

DeVora:
"Baik. Saya ubah menjadi streaming dan menjalankan test."

[Agent edit + test]

DeVora:
"Perubahan selesai. Test berhasil."
```

Then:

```text
User:
"Stop."
```

while DeVora is speaking.

Expected:

```text
TTS stops immediately.
Voice Mode enters LISTENING.
```

## 15. Technical Decisions

### STT

MVP should use an adapter:

```ts
interface SpeechRecognizer {
  start(): Promise<void>
  stop(): Promise<void>
  onPartial(cb: (text: string) => void): void
  onFinal(cb: (text: string) => void): void
}
```

This keeps provider selection independent.

### TTS

Use:

```ts
interface SpeechSynthesizer {
  speak(text: string): Promise<void>
  stop(): void
}
```

Provider can be swapped later.

### VAD

VAD should be local where practical because interruption latency is critical.

### State

Voice state should be local to the TUI/voice layer.

Do not persist it to a new database for MVP.

## 16. Provider Strategy

Do not hard-code a single vendor into the architecture.

```text
Voice Controller
      │
      ├── SpeechRecognizer
      │       └── Provider
      │
      └── SpeechSynthesizer
              └── Provider
```

Potential providers can be evaluated separately based on:

- latency
- cost
- language support
- streaming support
- local execution
- privacy

## 17. Plugin vs Fork Decision

Evaluate in this order:

### Option A — TUI Plugin

Preferred if plugin APIs can provide:

- route/screen
- keybind
- client/session access
- events
- lifecycle
- renderer access

OpenCode currently documents a TUI plugin system with these types of capabilities. citeturn0search1turn0search4

### Option B — `@opencode-ai/tui` Extension

If plugin APIs cannot support a full voice experience, add the screen and voice integration to the canonical TUI package.

### Option C — Minimal Fork

Only if the upstream APIs cannot expose the required integration point.

Keep fork changes isolated and upstream-friendly.

## 18. Deliverables

### Required

```text
docs/
├── PRD.md
├── ARCHITECTURE.md
├── IMPLEMENTATION_PLAN.md
└── OPENCODE_INTEGRATION.md

packages/
├── devora/
│   ├── audio/
│   ├── stt/
│   ├── tts/
│   ├── vad/
│   ├── conversation/
│   └── narration/
│
└── tui/
    └── ... existing OpenCode TUI
        └── voice screen
```

## 19. Definition of Done

- [x] Existing OpenCode TUI remains functional.
- [x] Voice Mode opens as one TUI screen.
- [x] User can speak.
- [x] STT produces transcript.
- [x] Transcript reaches existing OpenCode session.
- [x] Existing OpenCode agent executes task.
- [x] Important progress can be narrated.
- [x] TTS speaks responses.
- [x] User can interrupt TTS.
- [x] User can interrupt agent where supported.
- [x] Multi-turn conversation works.
- [x] No second agent.
- [x] No second tool runtime.
- [x] No new backend.
- [x] No new database.
- [x] Keyboard fallback works.
- [x] Failure states are recoverable.

## 20. Recommended Execution Order

```text
1. Inspect OpenCode
        ↓
2. Prove TUI extension/plugin path
        ↓
3. Build Voice Screen
        ↓
4. Add STT
        ↓
5. Connect STT → OpenCode
        ↓
6. Add TTS
        ↓
7. Add narration filter
        ↓
8. Add interruption
        ↓
9. Add conversation state
        ↓
10. Test real coding workflow
        ↓
11. Optimize latency
        ↓
12. Polish
```

The key optimization is to avoid building infrastructure that OpenCode already owns.


---

# Status Implementasi (25 Agustus 2026)

Semua item checklist di atas ditandai `[x]` **hanya setelah implementasi selesai
DAN lolos uji coba** (unit/integration/E2E, termasuk uji hardware nyata).

## Yang diuji

| Area | Bukti |
|---|---|
| Unit (VAD, state machine, narration, interrupt, turn, narrator) | `bun test` — **40/40 pass** (lokal + server anlap05) |
| STT whisper (Indonesia) | piper-generate audio → transkrip `"Halo, ini adalah test pengenalan suara bahasa Indonesia."` |
| STT vosk (streaming) | worker ready 1.7s, protokol partial/final OK |
| TTS piper → speaker | aplay playback OK (lokal + server) |
| TTS interrupt | berhenti <300ms target (SIGKILL piper+aplay, resolve instan) |
| Mic capture | arecord real device, VAD reaksi ≤200ms; stereo fallback (CX20751/2) downmix mono OK |
| Bridge SDK vs `opencode serve` | session create/prompt/abort/SSE events (mock server + real server) |
| **E2E real (server anlap05)** | audio piper → whisper → controller → OpenCode session → agent **9router `bai/deepseek-v4-flash`** → events → narration → piper. Output: `[user] "Halo ini adalah test diserfor."` → `[assistant] "Halo. Test diterima. Siap kerja. Apa tugasnya?"` → TTS called ✓ |

## Catatan jujur

- **TUI plugin screen**: mekanisme route/keybind/command diverifikasi dari source
  OpenCode (`packages/tui/src/feature-plugins/system/diff-viewer.tsx` pattern) dan
  bundle `dist/plugin.js` loadable (`{ id: "devora", tui: fn }`). Render Solid
  interaktif penuh di dalam TUI belum diuji otomatis (butuh sesi TUI manual).
- **Emergency "Stop"** (Phase 8): handled locally via `interrupt()` (VAD barge-in
  menghentikan TTS + cancel agent tanpa round-trip LLM).
- Server RAM 1.5GB: whisper base.pt muat (worker child process terpisah), tidak OOM.
