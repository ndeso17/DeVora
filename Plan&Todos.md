# Plan & Todos — Migrasi Frontend ke Tailwind CSS

## Ringkasan

Frontend React 19 + Vite 6 saat ini pakai **inline styles** (`style={{}}`) di `App.tsx` + `<style>` block di `index.html`. Migrasi ke **Tailwind CSS v4** (utility classes).

---

## Langkah Implementasi

### 1. Setup Tailwind v4 + Vite Plugin

**File berubah:** `apps/web/package.json`, `apps/web/vite.config.ts`

**Aksi:**
- Install `tailwindcss @tailwindcss/vite`
- Tambah `@tailwindcss/vite` plugin di `vite.config.ts` (bersamaan dg `@vitejs/plugin-react` — dua-duanya tetap, plugin Tailwind cuma handle CSS, React plugin tetap buat JSX)
- Hapus CSS `<style>` block di `index.html`, ganti jadi `@import "tailwindcss"` di `src/index.css`
- Buat `src/index.css` dengan `@import "tailwindcss"`

**Hasil:** Tailwind aktif, Vite rebuild, CSS reset Tailwind terpasang.

### 1b. Install lucide-react

**File berubah:** `apps/web/package.json`

**Aksi:**
- Install `lucide-react` (dependency)

**Hasil:** Library icon tersedia, semua emoji bisa diganti icon.

### 2. Migrasi inline styles → Tailwind classes di App.tsx

**File berubah:** `apps/web/src/App.tsx`

**Mapping style → class:**

| Inline Style | Tailwind Class |
|---|---|
| `display: flex, flexDirection: "column", gap: "0.75rem", flex: 1` | `flex flex-col gap-3 flex-1` |
| `display: "flex", justifyContent: "space-between", alignItems: "baseline"` | `flex justify-between items-baseline` |
| `fontSize: "1.25rem", fontWeight: 700, color: "#8b5cf6"` | `text-xl font-bold text-violet-500` |
| `fontSize: "0.75rem", color: connected ? "#4ade80" : "#f87171"` | `text-xs text-green-400` / `text-red-400` |
| `display: "flex", alignItems: "center", gap: "0.5rem"` | `flex items-center gap-2` |
| `fontSize: "1.5rem"` | `text-2xl` |
| `fontWeight: 700, color` (dinamis) | `font-bold text-{color}` |
| `fontSize: "0.7rem", color: "#6b7280", marginLeft: "auto"` | `text-[0.7rem] text-gray-500 ml-auto` |
| `color: "#f87171", fontSize: "0.85rem"` | `text-red-400 text-sm` |
| `color: "#9ca3af", fontStyle: "italic", fontSize: "0.9rem"` | `text-gray-400 italic text-sm` |
| `flexDirection: "column", gap: "0.6rem", flex: 1, overflowY: "auto"` | `flex flex-col gap-1.5 flex-1 overflow-y-auto` |
| `maxWidth: "85%"` | `max-w-[85%]` |
| `fontSize: "0.75rem", fontWeight: 600, color` | `text-xs font-semibold` |
| `padding: "0.5rem 0.75rem", borderRadius: 8, background: ..., fontSize: "0.9rem", lineHeight: 1.4` | `p-2.5 rounded-lg bg-gray-800/ bg-[#1a1a2e] text-sm leading-relaxed` |
| `fontSize: "0.75rem", color: "#6b7280"` | `text-xs text-gray-500` |
| `display: "flex", gap: "0.5rem", alignItems: "center"` | `flex gap-2 items-center` |
| `padding: "0.6rem 1rem", borderRadius: 8, border: "none", background: "#ef4444" / "#8b5cf6", color: "#fff", fontWeight: 600, cursor: "pointer"` | `px-4 py-2.5 rounded-lg border-none bg-red-500/ bg-violet-500 text-white font-semibold cursor-pointer` |
| `padding: "0.6rem 1rem", borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#e0e0ea", cursor: "pointer"` | `px-4 py-2.5 rounded-lg border border-gray-700 bg-transparent text-gray-200 cursor-pointer` |
| `padding: "0.6rem 0.75rem", borderRadius: 8, border: "1px solid #374151", background: "#1a1a2e", color: "#e0e0ea"` | `px-3 py-2.5 rounded-lg border border-gray-700 bg-[#1a1a2e] text-gray-200` |
| `padding: "0.6rem 1rem", borderRadius: 8, border: "none", background: "#22c55e", color: "#fff", fontWeight: 600, cursor: "pointer"` | `px-4 py-2.5 rounded-lg border-none bg-green-500 text-white font-semibold cursor-pointer` |

**Catatan:**
- Warna dinamis (`color`) pake `style={{ color }}` — tetap inline karena dinamis. Atau buat mapping class name.
- `backgroundColor: "#1a1a2e"` — custom color, pake `bg-[#1a1a2e]`

### 2a. Responsive layout (semua device)

**Masalah saat ini:** nol media query, fixed `max-width: 640px`, controls row 4 elemen berdesakan di layar kecil, padding/font statis.

**Target:** Full screen (`w-full`) — setara Bootstrap `col-12`. Tidak ada centering, tidak ada max-width constraint. Layout grid 2 kolom di desktop, stack di mobile.

```
Desktop (lg+):                        Mobile (< 768px):
┌──────────────┬────────────────┐     ┌──────────────────┐
│  Voice Core  │  Conversation  │     │  Voice Core      │
│  (kiri)      │  (kanan)       │     │  (compact)       │
│              │                │     │  Conversation    │
├──────────────┴────────────────┤     ├──────────────────┤
│  Control dock                 │     │  Control dock    │
└───────────────────────────────┘     └──────────────────┘
```

**Aksi di App.tsx (Tailwind classes):**
- Root div: `w-full h-screen flex flex-col overflow-x-hidden`
- Grid area: `flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]` — core kiri, conversation kanan
- Conversation panel: `min-h-0 overflow-y-auto` — scroll independen
- Controls dock: `flex flex-wrap gap-2 p-4 sm:p-5 md:p-6` — wrap saat sempit, sticky bawah
- Input: `min-w-0 flex-1` — cegah overflow, bisa menyusut
- `overflow-x-hidden` di root — cegah horizontal scroll

**`#root` di index.html:**
```
#root { width: 100%; height: 100dvh; display: flex; flex-direction: column; }
```
Hapus `max-width: 640px; margin: 0 auto; padding: 1rem;` — pindah ke Tailwind classes.



### 2b. Migrasi emoji → lucide-react icons

**File berubah:** `apps/web/src/App.tsx`

**Import:** `import { Mic, Volume2, Settings, Circle, Square, Wifi, WifiOff } from "lucide-react"`

**Mapping emoji → icon:**

| Emoji/Unicode | Konteks | Lucide Icon |
|---|---|---|
| `🎙` (listening) | status icon | `<Mic size={24} />` |
| `🔊` (speaking) | status icon | `<Volume2 size={24} />` |
| `⚙` (working) | status icon | `<Settings size={24} />` |
| `·` (idle) | status icon | `<Circle size={24} />` |
| `●` / `○` (connected/terputus) | koneksi header | `<Wifi size={12} />` / `<WifiOff size={12} />` |
| `⏹` (stop) | tombol mic aktif | `<Square size={16} />` + teks "Stop" |
| `🎙` (Bicara) | tombol mic idle | `<Mic size={16} />` + teks "Bicara" |
| `⏹` (Stop/Interrupt) | tombol interrupt | `<Square size={16} />` + teks "Stop / Interrupt" |

**Catatan:**
- Icon status pakai `size={24}`, icon tombol pakai `size={16}` (dalam `flex items-center gap-1` + teks)
- Warna icon status mengikuti `color` dinamis (inherit dari `style={{ color }}` parent)
- Semua emoji hilang — ganti icon React component

### 2c. Fallback icon: Google Icons (Material Symbols)

**Kapan:** icon yang dibutuhkan tidak tersedia di lucide-react.

**Sumber SVG:** Google Fonts Icons — https://fonts.google.com/icons (Material Symbols)

**Cara ambil SVG:**
- Cari icon di fonts.google.com/icons
- Ambil SVG path (download `.svg` atau copy path dari URL `https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsrounded/<icon-name>/default/24px.svg`)
- Bungkus jadi React component inline SVG:

```tsx
// src/icons/MyIcon.tsx (contoh)
export function MyIcon({ size = 24, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="...path dari google icons..." />
    </svg>
  )
}
```

**Catatan:**
- `fill="currentColor"` — warna ikut parent, sama seperti lucide
- Simpan icon custom di `src/icons/*.tsx`, bukan inline di App.tsx
- Konsistensi: ukuran sama (24 status / 16 tombol), stroke style sama

### 2d. Design System — "The Voice Core"

**Konsep:** 1 focal hero: Voice Core orbital. Suite adalah voice, jadi keadaan suara harus TERLIHAT. Sisa layout tenang, biar core yang bicara.

**Signature — Voice Core (pure CSS, ~160px orb):**

| State | Visual Core |
|---|---|
| idle | ring violet redup, breathing pulse lambat |
| listening | pulse rings mengembang + center dot berdenyut (radar feel) |
| transcribing | ripple kecil dari center |
| working | arc berputar (spinner) |
| speaking | radial waveform bars — 8 bar di sekeliling circle, height animasi bergantian |
| interrupting | kontraksi flash cepat |
| error | glow merah + shake halus |

Implementasi: `@keyframes` di `index.css`, class `core--idle`, `core--listening`, dll. Hormati `prefers-reduced-motion`.

**Palet (refined):**

| Token | Hex | Tailwind |
|---|---|---|
| bg | `#0B0B10` | `bg-[#0B0B10]` |
| surface | `#131320` | `bg-[#131320]` |
| surface-2 | `#1C1C2E` | `bg-[#1C1C2E]` |
| accent (violet) | `#8B5CF6` | `text-violet-500` / `bg-violet-500` |
| success | `#34D399` | `text-emerald-400` |
| warning | `#FBBF24` | `text-amber-400` |
| danger | `#F87171` | `text-red-400` |
| info | `#60A5FA` | `text-blue-400` |
| text | `#E7E7F0` | `text-[#E7E7F0]` |
| muted | `#8B8B9E` | `text-[#8B8B9E]` |

**Typography (2 wajah, deliberate):**
- **Space Grotesk** (Google Fonts) — wordmark + state label (uppercase, karakter techie)
- **JetBrains Mono** (Google Fonts) — session id, activity log, timestamp
- Body: `system-ui` stack — jangan tambah beban font

**Komponen:**
- **Top bar**: wordmark kiri + `<Wifi />` / `<WifiOff />` + "terhubung/terputus" + session id mono
- **Voice Core**: center-upper, bordered area (kiri di desktop, top di mobile)
- **State label**: uppercase, Space Grotesk, colored by state
- **Live transcript**: italic muted, langsung di bawah label
- **Message bubbles**: user = `bg-violet-500/10 border-l-2 border-violet-500` right-aligned; assistant = `bg-[#131320]` left-aligned, `rounded-xl`, `max-w-[80%]`
- **Activity log**: `text-xs text-[#8B8B9E] font-mono`, last 2-3 items saja
- **Control dock**: sticky bottom, `bg-[#0B0B10]` + border-top subtle
- **Mic FAB**: `w-14 h-14 rounded-full` — violet, merah saat aktif
- **Error**: banner strip `bg-red-500/10 border-l-2 border-red-500`, tidak apologize
- **Empty state**: "Mulai bicara atau ketik perintah…" — undangan

**Motion:**
- State transitions: core morphs via CSS class swap (fade)
- Pesan baru: slide-in 200ms
- `prefers-reduced-motion`: semua non-esensial mati
- Tidak pakai library (framer-motion, etc) — CSS keyframes cukup

### 3. Update index.html

**File berubah:** `apps/web/index.html`

**Aksi:**
- Hapus `<style>` block (CSS reset)
- Tambah `<link>` ke `src/index.css` atau biarkan Vite handle via `import`
- Tambah Google Fonts link (Space Grotesk + JetBrains Mono)

**Hasil:** HTML bersih, styling lewat CSS/inline classes.

### 3a. Arsitektur 2 halaman: VoC + TyC

**Temuan kunci:** server (VoiceController) SUDAH support full-duplex penuh:
- **VAD auto-endpoint**: `feedAudio` → `vad.feed()` → `turn_end` → `endUtterance()` → `recognizer.end()` → `submitTranscript()` — otomatis, tanpa tombol
- **Barge-in**: `user_speech_start` saat state `speaking`/`working` → `interrupt()` — user bisa interupsi agent yang bicara
- Gap cuma di **client** (mic manual on/off) + **1 config** (`maxSilenceMs`)

**Struktur file baru:**

```
apps/web/src/
├── main.tsx                   # React bootstrap
├── App.tsx                    # Router + shell (header + mode toggle + drawer state)
├── pages/
│   ├── SetupPage.tsx          # Landing — pilih sesi lama / buat baru
│   ├── NewSessionPage.tsx     # Wizard 2 step: project → model
│   ├── VoicePage.tsx          # VoC — mic selalu on, full-duplex
│   └── TypePage.tsx           # TyC — chat text, tanpa mic
├── components/
│   ├── ModeToggle.tsx         # Floating pill [🎤 Voice] [✎ Type]
│   ├── VoiceCore.tsx          # Orb state visualization (mic hero)
│   ├── Conversation.tsx       # Message bubbles + activity (shared VoC/TyC)
│   ├── InfoPanel.tsx          # Sidebar info: Project/MCP/Skills/Models (shared)
│   └── SessionPicker.tsx      # List sesi + search (Setup page)
├── lib/
│   ├── ws.ts                  # WS client: connect, send, onState, onAudio
│   ├── audio.ts               # Mic stream → PCM16 chunks → send({type:"audio"})
│   └── bridgeContext.ts       # Fetch Project/MCP/Skills/Models via bridge
└── icons/                     # Custom Google Icons (fallback)
```

**Routing:** React Router (`react-router-dom`) — 2 route: `/voice` dan `/type`, default redirect `/voice`. Nav tab di header.

### 3b. VoicePage (VoC) — full-duplex voice

**Flow (perbedaan dari sekarang):**

```
Sekarang (manual):                   Baru (otomatis):
Mount → mic OFF                     Mount → getUserMedia → send({type:"start"})
klik "Bicara" → mic ON              mic STREAMING TERUS (selalu on)
klik "Stop" → text submit           VAD server deteksi diam 3s → auto submit ke LLM
```

**Aksi:**
- `useEffect` mount: `getUserMedia` → AudioContext 16k → stream PCM16 chunks → `send({type:"audio"})` terus
- `send({type:"start"})` sekali — mulai VAD session server
- **Tidak ada tombol on/off mic** — mic hidup selama page terbuka
- Satu tombol "Akhiri Sesi" → stop tracks + `send({type:"stop"})`
- Barge-in otomatis dari server — tidak perlu tombol interrupt (tapi tetap sediakan sebagai fallback)
- Render: Voice Core (state dari snapshot) + partial transcript live + Conversation
- Handler `audio` msg → `playWav` (TTS playback)
- **Server config**: `vadConfig: { maxSilenceMs: 3000 }` di `packages/server/src/index.ts` — jeda 3 detik diam → auto submit

**Protokol WS (sudah ada, tidak berubah):**
```
client → {type:"start"} | {type:"audio", data:PCM16-b64} | {type:"interrupt"} | {type:"stop"}
server → {type:"state", snapshot} | {type:"audio", wav:b64} | {type:"error", message}
```

### 3c. TypePage (TyC) — chat text

**Aksi:**
- Tanpa mic, tanpa audio, tanpa WS audio stream
- Input text + Enter/kirim → `send({type:"submit", text})` → server `keyboardSubmit`
- Render: Conversation (shared component) + input dock
- Tetap terima `state` snapshot (biar kerja agent visible) tapi tanpa Voice Core
- Status: koneksi + session id (mono)

### 3d. Server change

**File:** `packages/server/src/index.ts`

**Aksi:**
- `new VoiceController({ ... , vadConfig: { maxSilenceMs: 3000 } })` — jeda 3 detik
- Catatan: `DEFAULT_VAD_CONFIG.maxSilenceMs = 450` — default terlalu cepat buat VoC

### 3e. Layout final + Info Panel (Project/MCP/Skills/Models)

**PENTING — "Layout ala ChatGPT" = pola UI aplikasi ChatGPT (mic hero besar di tengah, fokus 1 interaksi). Ini hanya referensi LAYOUT, TIDAK terkait model — model tetap dari opencode providers (claude, gemini, dst).**

**Konsep layout:**

| Device | Layout |
|---|---|
| Desktop (≥1024px) | 3 kolom statis: `info \| core \| conversation`. Info panel collapsible via `[≡]` |
| Mobile (<1024px) | Main view = mic hero saja (ala ChatGPT). Sidebar kiri slide-in = info. Sidebar kanan slide-in = conversation |

**Mobile — Main view (default, ala ChatGPT):**

```
┌──────────────────────────────────────┐
│              DeVora                  │
│        (warna violet, Space Grotesk) │
│                                      │
│            ┌──────────┐              │
│            │ ◯◯◯◯◯◯◯  │              │
│            │ ◯ CORE ◯  │  ← mic hero │
│            │ ◯◯◯◯◯◯◯  │             │
│            └──────────┘              │
│                                      │
│          LISTENING                   │
│   "…arsitektur monorepo ini…"        │
│                                      │
├──────────────────────────────────────┤
│  [≡]                    [⏻]   ●     │
│  info                    sesi   mic  │
└──────────────────────────────────────┘
```

**Mobile — Sidebar kiri (Info Panel), slide-in:**

```
┌──────────┬───────────────────────────┐
│ 📁 PROJEK │  (main tetap di belakang)│
│ /home/mr  │        DeVora            │
│ ksvt/...  │                          │
│           │      ◯ CORE              │
│ 🔌 MCP   │                          │
│ ● codegr  │     LISTENING            │
│ ● ctx7    │  "…transcript…"          │
│ ● postman │                          │
│ ● pentest │                          │
│           │                          │
│ 📦 SKILLS │                          │
│ ● front   │                          │
│ ● git-m   │                          │
│ ● rev-wk  │                          │
│ ● +8      │                          │
│           │                          │
│ 🤖 MODELS │                          │
│ ● claude  │                          │
│ ● gemini  │                          │
│ ● +4      │                          │
│ ⠀⠂⠄⠂⠁ │ ← drawer (slide-in)      │
└──────────┴───────────────────────────┘
```

**Mobile — Sidebar kanan (Conversation), slide-in:**

```
┌───────────────────────────┬──────────┐
│  DeVora        ← back     │  You     │
│                           │ ┌──────┐ │
│      ◯ CORE               │ │"jelas│ │
│      LISTENING            │ │ in    │ │
│  "…transcript…"           │ │ ark…" │ │
│                           │ └──────┘ │
│                           │ DeVora  │
│                           │ ┌──────┐ │
│                           │ │ apps │ │
│                           │ │ /web  │ │
│                           │ │ front │ │
│                           │ └──────┘ │
│                           │ activity│ │
│                           │ ─────── │ │
│                           │ ses_ab12│ │
│                           │ (mono)  │ │
│          ← drawer slide-in          │ │
└───────────────────────────┴──────────┘
```

**Desktop — 3 kolom statis:**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ DeVora Voice             [VoC | TyC]        [Wifi] terhubung   ses_ab12       │
├───────────┬───────────────────────────────┬───────────────────────────────────┤
│ 📁 PROJ   │                               │  You                             │
│ /home/..  │       ┌──────────┐            │  ┌───────────────────────────┐    │
│           │       │ ◯◯◯◯◯◯◯  │            │  │ "jelasin arsitektur       │    │
│ 🔌 MCP   │       │ ◯ CORE ◯  │  ← mic    │  │  monorepo ini?"           │    │
│ ● codeg   │       │ ◯◯◯◯◯◯◯  │    hero   │  └───────────────────────────┘    │
│ ● ctx7    │       └──────────┘            │                                  │
│ ● postman │                               │  DeVora                         │
│           │     LISTENING                 │  ┌─────────────────────────────┐ │
│ 📦 SKILLS │  "…arsitektur monorepo ini…"   │  │ apps/web buat frontend,    │ │
│ ● front   │                               │  │ packages/server backend    │ │
│ ● git-m   │                               │  │ packages/devora core lib   │ │
│ ● rev-wk  │                               │  └─────────────────────────────┘ │
│ ● +8      │                               │                                  │
│           │                               │  activity: ──────────────        │
│ 🤖 MODELS │                               │  Session: ses_ab12 (mono)        │
│ ● claude  │                               │                                  │
│ ● gemini  │                               │                                  │
│ ● +4      │                               │                                  │
├───────────┴───────────────────────────────┴───────────────────────────────────┤
│ [⏹ Interrupt]                                              [⏻ Akhiri Sesi]    │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Info Panel — urutan section (final):**

```
┌─────────────────────────────┐
│ 📁 PROJECT                  │
│  /home/mrksvt/.../DeVora    │
├─────────────────────────────┤
│ 🔌 MCP SERVERS (4)          │
│  ● codegraph  ● context7    │
│  ● postman    ● pentest-ai  │
├─────────────────────────────┤
│ 📦 SKILLS (12)              │
│  ● frontend  ● git-master   │
│  ● review-wk ● plantuml …   │
│  +8 more                    │
├─────────────────────────────┤
│ 🤖 MODELS (6)               │
│  ● claude-haiku-40k         │
│  ● claude-sonnet-40k        │
│  ● gemini-flash-2           │
│  ● gemini-pro-2             │
│  +2 more                    │
└─────────────────────────────┘
```

**Data source (via opencode SDK, tambah method di `SdkBridge`):**

| Section | SDK Endpoint | Data |
|---|---|---|
| Project | `client.session.get({path:{id}})` | `Session.directory` |
| MCP | `client.mcp.status()` | `{[key]: McpStatus}` (connected/disabled/failed/needsAuth) |
| Models | `client.config.providers()` | `{providers: Provider[]}` → flatten `provider.id + model.id` |
| Skills | config agent → `client.config.get()` → `agent` | Nama agent (plan/build/general/explore + custom). Skill dari file `~/.config/opencode/skills/` & project `.opencode/skills/` |

**Catatan Skills:** opencode SDK tidak punya endpoint skill langsung. Ambil dari:
1. `config.get()` → `agent` keys (skills yang dimuat agent)
2. Scan filesystem: `~/.config/opencode/skills/*/SKILL.md` + `<project>/.opencode/skills/*/SKILL.md`

**Bridge baru (`SdkBridge.getContext()`):**
```ts
async getContext(): Promise<{
  directory: string | null
  mcp: Array<{ name: string; status: string }>
  skills: string[]
  models: Array<{ id: string; provider: string }>
}>
```
Dipanggil sekali saat connect, dikirim ke client via WS `{type:"context"}` message. Client cache — tidak perlu refetch tiap render.

**Perilaku drawer (mobile):**
- `[≡]` → sidebar kiri slide-in (info panel)
- Tap conversation / swipe kanan → sidebar kanan slide-in (conversation)
- Back / tap luar → tutup drawer; main view tetap hidup di belakang (core mic tetap jalan)

**Desktop:** 3 kolom statis, info panel kiri collapsible via `[≡]`.

### 3f. Setup Page + New Session wizard + Mode Toggle

**Flow navigasi:**

```
┌──────────────┐      ┌──────────────────────┐
│  SETUP PAGE  │─────▶│ NEW SESSION (2 step) │
│  pilih sesi  │      │ 1. project 2. model  │
└──────┬───────┘      └──────────┬───────────┘
       │                         │
       │ pilih sesi lama         │ create
       ▼                         ▼
┌──────────────────────────────────────────────┐
│              VOICE PAGE (VoC)                │
│   [🎤 Voice] [✎ Type]  ← floating toggle     │
│                                              │
│   toggle [✎ Type]                            │
│   ▼                                          │
│              TYPE PAGE (TyC)                 │
└──────────────────────────────────────────────┘
```

**Setup Page (landing, `/`)** — pilih sesi lama ATAU buat baru:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                          ◆ DeVora Voice                                      │
│                     (violet, Space Grotesk)                                  │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  [🔍 Cari sesi…]                                          [+] Baru    │  │
│  │                                                              (violet)  │  │
│  │  ┌─────────────────────────────────────────────────────────────┐       │  │
│  │  │ ● ses_ab12   "DeVora Voice"            25 Agu 09:00   (mono)│       │  │
│  │  │ ● ses_xy89   "Debu PR"                 24 Agu 14:30         │       │  │
│  │  │ ● ses_wx34   "Bug fix auth"            24 Agu 10:15         │       │  │
│  │  │ ● ses_vw56   "Refactor API"            23 Agu 18:20         │       │  │
│  │  │ ● ses_tu78   "Riset library"           23 Agu 09:05         │       │  │
│  │  └─────────────────────────────────────────────────────────────┘       │  │
│  │                                                                         │  │
│  │  📁 Project aktif: /home/mrksvt/Documents/Projects/DeVora               │  │
│  │  🔌 MCP: codegraph · context7 · postman · pentest-ai                    │  │
│  │  📦 Skills: 12 terinstall                                                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│        v0.1.0 · opencode serve: 127.0.0.1:5173 · id_ID-news_tts             │
└──────────────────────────────────────────────────────────────────────────────┘
```

**New Session — Step 1: Pilih Project (`/new`):**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◀ Kembali                                                    DeVora Voice   │
│                                                                              │
│              Session Baru  ·  Langkah 1 dari 2                               │
│              ────────────────────────────                                    │
│              ● Project Directory                                             │
│              ○ Pilih Model                                                   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  📁 Project Directory                                                  │  │
│  │                                                                       │  │
│  │  [ /home/mrksvt/Documents/Projects/                        ] [Browse]  │  │
│  │                                                                       │  │
│  │  Recent Projects:                                                     │  │
│  │  ┌─────────────────────────────────────────────────────────────┐      │  │
│  │  │ ● /home/mrksvt/Documents/Projects/DeVora            25 Agu  │      │  │
│  │  │ ● /home/mrksvt/Documents/Projects/side-project      20 Agu  │      │  │
│  │  │ ● /home/mrksvt/Documents/Projects/oss-lib           12 Agu  │      │  │
│  │  └─────────────────────────────────────────────────────────────┘      │  │
│  │                                                                       │  │
│  │  ⚠ Validasi: folder harus berisi opencode.json / .opencode / git repo  │  │
│  │                                                                       │  │
│  │                                          [Cancel]      [Continue →]   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**New Session — Step 2: Pilih Model (`/new` step 2):**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ◀ Kembali                                                    DeVora Voice   │
│                                                                              │
│              Session Baru  ·  Langkah 2 dari 2                               │
│              ────────────────────────────                                    │
│              ○ Project Directory                                             │
│              ● Pilih Model                                                   │
│              📁 /home/mrksvt/.../DeVora                                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  🤖 Pilih Model                                                       │  │
│  │  🔍 [ Cari model…                                        ]             │  │
│  │  ┌─────────────────────────────────────────────────────────────┐      │  │
│  │  │ (●) claude-haiku-40k        bai-pitik/deepseek-v4-flash     │      │  │
│  │  │     ◈ fast · 200k ctx       ● active                        │      │  │
│  │  │ ( ) claude-sonnet-40k       anthropic/claude-3-5-sonnet     │      │  │
│  │  │     ◈ balanced · 200k ctx   ● active                        │      │  │
│  │  │ ( ) gemini-flash-2          google/gemini-2.0-flash         │      │  │
│  │  │     ◈ fast · 1M ctx         ● active                        │      │  │
│  │  │ ( ) gemini-pro-2            google/gemini-2.0-pro           │      │  │
│  │  │     ◈ powerful · 1M ctx     ● active                        │      │  │
│  │  │ ( ) deepseek-v4             deepseek/deepseek-chat          │      │  │
│  │  │     ◈ cheap · 128k ctx      ● active                        │      │  │
│  │  └─────────────────────────────────────────────────────────────┘      │  │
│  │                                      [← Back]           [Start →]      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Mode Toggle (VoC/TyC switch) — floating pill, BUKAN di header:**

- Posisi: `absolute top-14 left-1/2 -translate-x-1/2 z-10`
- `[🎤 Voice]` aktif: core visible, mic on, input hidden
- `[✎ Type]` aktif: core hidden, mic off, input muncul
- Sesi & conversation SAMA — toggle cuma ganti mode input, bukan ganti sesi
- Tampil di kedua page (tidak perlu router switch — cukup state `mode` di shell)

```
┌─ Top bar ────────────────────────────────────────┐
│ ◆ DeVora Voice                    [Wifi] ses_ab12 │
├───────────────────────────────────────────────────┤
│             [🎤 Voice]  [✎ Type]                   │
│            ← pill floating di atas canvas          │
│                                                   │
│    ┌──────────┐       ┌─ You ────────────┐        │
│    │ ◯ CORE ◯ │       │ message          │        │
│    └──────────┘       └──────────────────┘        │
│                                                   │
│  [⏹]  [⏻]  ● mic aktif                            │
└───────────────────────────────────────────────────┘
```

**Routing final:**

| Route | Page |
|---|---|
| `/` | Setup — pilih sesi / buat baru |
| `/new` | Wizard: step 1 project, step 2 model |
| `/conversation` | VoC/TyC (mode via toggle state, bukan route) |

**Data flow (setup):**
- Sesi list: `client.session.list()` → title, created, id
- Model list: `client.config.providers()` → flatten models
- Recent projects: localStorage + `client.project.current()`
- Create: `client.session.create({title})` → `client.session.update({model})` untuk set model
- Pilih sesi lama: `SdkBridge.setSession(id)` — `sendMessage()` sudah pakai `_sessionId`

### 4. Verifikasi

- `bun --bun run dev` — jalan tanpa error
- `lsp_diagnostics` — 0 error
- Cek visual: layout, warna, spacing sama seperti sebelum migrasi
- Cek responsive: viewport mobile (320–640px), tablet, desktop
- Cek `prefers-reduced-motion`
- **Cek VoC end-to-end**: bicara → jeda 3s → transcript masuk conversation → agent jawab → suara keluar → interupsi saat agent bicara → agent berhenti → lanjut mendengar
- **Cek TyC**: submit text → jawaban masuk conversation

---

## Todos

| # | Task | File | Priority |
|---|---|---|---|
| 1 | Install `tailwindcss @tailwindcss/vite`, update `vite.config.ts` | `apps/web/package.json`, `apps/web/vite.config.ts` | high |
| 2 | Install `lucide-react` + `react-router-dom` | `apps/web/package.json` | high |
| 3 | Buat `src/index.css` dg `@import "tailwindcss"` + base `#root` (full screen) + Voice Core keyframes + design tokens | `apps/web/src/index.css` (new) | high |
| 4 | Update `index.html` — hapus `<style>`, tambah CSS link + Google Fonts (Space Grotesk, JetBrains Mono) | `apps/web/index.html` | high |
| 5 | Migrasi inline styles → Tailwind classes (design system: palet, komponen, bubbles) | `apps/web/src/App.tsx` | high |
| 6 | Layout 3 kolom desktop (info\|core\|conversation) / mobile main = mic hero + 2 drawer | `apps/web/src/App.tsx` | high |
| 7 | Voice Core component: `src/components/VoiceCore.tsx` — state-driven orb + waveform | `apps/web/src/components/VoiceCore.tsx` (new) | high |
| 8 | Conversation component: `src/components/Conversation.tsx` — bubbles + activity (shared) | `apps/web/src/components/Conversation.tsx` (new) | high |
| 9 | InfoPanel component: `src/components/InfoPanel.tsx` — Project/MCP/Skills/Models, drawer + desktop static | `apps/web/src/components/InfoPanel.tsx` (new) | high |
| 10 | ModeToggle component: `src/components/ModeToggle.tsx` — floating pill [Voice]/[Type] | `apps/web/src/components/ModeToggle.tsx` (new) | high |
| 11 | SessionPicker component: `src/components/SessionPicker.tsx` — list sesi + search | `apps/web/src/components/SessionPicker.tsx` (new) | high |
| 12 | WS lib: `src/lib/ws.ts` — connect, send, onState/onAudio/onError/onContext; `src/lib/audio.ts` — mic → PCM16 chunks | `apps/web/src/lib/ws.ts`, `apps/web/src/lib/audio.ts` (new) | high |
| 13 | Router + shell: `App.tsx` — routes `/` `/new` `/conversation`, mode toggle state, drawer state | `apps/web/src/App.tsx` | high |
| 14 | SetupPage: `src/pages/SetupPage.tsx` — list sesi (lama) / tombol buat baru | `apps/web/src/pages/SetupPage.tsx` (new) | high |
| 15 | NewSessionPage: `src/pages/NewSessionPage.tsx` — wizard 2 step: pilih project dir → pilih model | `apps/web/src/pages/NewSessionPage.tsx` (new) | high |
| 16 | VoicePage: mic selalu on, streaming audio, auto-submit VAD 3s (server), barge-in, TTS playback | `apps/web/src/pages/VoicePage.tsx` (new) | high |
| 17 | TypePage: chat text tanpa mic, submit → conversation | `apps/web/src/pages/TypePage.tsx` (new) | high |
| 18 | Bridge: `SdkBridge.getContext()` + `listSessions()` + `setSession(id)` — fetch directory/MCP/skills/models, session list & switch | `packages/devora/src/opencode/bridge.ts` | high |
| 19 | Server: `vadConfig: { maxSilenceMs: 3000 }` + kirim `{type:"context"}` + `{type:"sessions"}` saat connect | `packages/server/src/index.ts` | high |
| 20 | Migrasi emoji → lucide icons; fallback Google Icons SVG utk icon yg tidak ada di lucide | `apps/web/src/**` | high |
| 21 | `bun dev` — test end-to-end: setup (pilih sesi/baru) + VoC (bicara→3s→submit→jawab→interupsi) + TyC + mode toggle + info panel + responsive + reduced-motion | — | high |