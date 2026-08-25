// DeVora web voice client.
//
// Mic: getUserMedia → AudioContext(16000) → ScriptProcessor → PCM16 chunks → WS.
// Playback: server sends WAV (base64) → decodeAudioData → AudioBufferSource.

import { useEffect, useRef, useState } from "react"

type Snapshot = {
  state: string
  transcript: string
  partialTranscript: string
  conversation: Array<{ role: "user" | "assistant"; text: string }>
  activity: string[]
  error: string | null
  opencodeSessionId: string | null
}

const STATE_LABEL: Record<string, string> = {
  idle: "IDLE",
  listening: "LISTENING",
  transcribing: "TRANSCRIBING…",
  submitting: "SUBMITTING…",
  working: "WORKING",
  speaking: "SPEAKING",
  interrupting: "INTERRUPTING…",
  error: "ERROR",
}

function wavUrl(wavB64: string): Blob {
  const bytes = atob(wavB64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: "audio/wav" })
}

export function App() {
  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null)
  const [snap, setSnap] = useState<Snapshot>({
    state: "idle",
    transcript: "",
    partialTranscript: "",
    conversation: [],
    activity: [],
    error: null,
    opencodeSessionId: null,
  })
  const [connected, setConnected] = useState(false)
  const [input, setInput] = useState("")
  const [listenState, setListenState] = useState<"off" | "on">("off")

  // --- WebSocket connection ---
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws"
    const ws = new WebSocket(`${proto}://${location.host}/ws`)
    wsRef.current = ws
    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === "state") setSnap(msg.snapshot)
        if (msg.type === "audio") {
          void playWav(msg.wav)
        }
        if (msg.type === "error") {
          setSnap((s) => ({ ...s, error: msg.message }))
        }
      } catch {
        /* ignore malformed */
      }
    }
    return () => {
      ws.close()
    }
  }, [])

  function send(obj: unknown) {
    wsRef.current?.send(JSON.stringify(obj))
  }

  async function playWav(wavB64: string) {
    try {
      const ctx = audioCtxRef.current ?? new AudioContext()
      audioCtxRef.current = ctx
      await ctx.resume()
      const buf = await ctx.decodeAudioData(await (await wavUrl(wavB64).arrayBuffer()))
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      src.start()
    } catch (err) {
      setSnap((s) => ({ ...s, error: `TTS playback: ${String(err)}` }))
    }
  }

  // --- Mic capture: PCM16 mono 16k chunks ---
  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } })
      micStreamRef.current = stream
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)

      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0)
        const pcm = new Int16Array(ch.length)
        for (let i = 0; i < ch.length; i++) {
          const s = Math.max(-1, Math.min(1, ch[i]))
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        send({ type: "audio", data: btoa(String.fromCharCode(...new Uint8Array(pcm.buffer))) })
      }
      source.connect(processor)
      processor.connect(ctx.destination)
      recorderRef.current = processor

      send({ type: "start" })
      setListenState("on")
    } catch (err) {
      setSnap((s) => ({ ...s, error: `Microphone: ${String(err)}` }))
    }
  }

  function stopMic() {
    if (recorderRef.current) {
      try {
        ;(recorderRef.current as ScriptProcessorNode).disconnect()
      } catch { /* noop */ }
      recorderRef.current = null
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    send({ type: "stop" })
    setListenState("off")
  }

  function toggleListen() {
    if (listenState === "on") stopMic()
    else void startMic()
  }

  function interrupt() {
    send({ type: "interrupt" })
  }

  function submit() {
    const text = input.trim()
    if (!text) return
    send({ type: "submit", text })
    setInput("")
  }

  const state = snap.state
  const label = STATE_LABEL[state] ?? state.toUpperCase()
  const color =
    state === "listening" ? "#4ade80" :
    state === "speaking" ? "#fbbf24" :
    state === "working" || state === "transcribing" || state === "submitting" ? "#60a5fa" :
    state === "error" ? "#f87171" :
    state === "interrupting" ? "#fb923c" : "#9ca3af"

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#8b5cf6" }}>DeVora Voice</h1>
        <span style={{ fontSize: "0.75rem", color: connected ? "#4ade80" : "#f87171" }}>
          {connected ? "● terhubung" : "○ terputus"}
        </span>
      </header>

      {/* status */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "1.5rem" }}>
          {state === "listening" ? "🎙" : state === "speaking" ? "🔊" : state === "working" ? "⚙" : "·"}
        </span>
        <span style={{ fontWeight: 700, color }}>{label}</span>
        {snap.opencodeSessionId && (
          <span style={{ fontSize: "0.7rem", color: "#6b7280", marginLeft: "auto" }}>
            session {snap.opencodeSessionId.slice(0, 8)}
          </span>
        )}
      </div>

      {snap.error && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>! {snap.error}</p>}
      {snap.partialTranscript && state !== "idle" && (
        <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "0.9rem" }}>"{snap.partialTranscript}…"</p>
      )}

      {/* conversation */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", flex: 1, overflowY: "auto" }}>
        {snap.conversation.slice(-20).map((m, i) => (
          <div key={i} style={{ maxWidth: "85%" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: m.role === "user" ? "#e0e0ea" : "#8b5cf6" }}>
              {m.role === "user" ? "You" : "DeVora"}
            </div>
            <div
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                background: m.role === "user" ? "#1f2937" : "#1a1a2e",
                fontSize: "0.9rem",
                lineHeight: 1.4,
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
      </div>

      {/* activity */}
      {snap.activity.length > 0 && (
        <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>
          {snap.activity.slice(-5).map((a, i) => (
            <div key={i}>{a}</div>
          ))}
        </div>
      )}

      {/* controls */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          onClick={toggleListen}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: 8,
            border: "none",
            background: listenState === "on" ? "#ef4444" : "#8b5cf6",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {listenState === "on" ? "⏹ Stop" : "🎙 Bicara"}
        </button>
        <button
          onClick={interrupt}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: 8,
            border: "1px solid #374151",
            background: "transparent",
            color: "#e0e0ea",
            cursor: "pointer",
          }}
        >
          ⏹ Stop / Interrupt
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Atau ketik perintah…"
          style={{
            flex: 1,
            padding: "0.6rem 0.75rem",
            borderRadius: 8,
            border: "1px solid #374151",
            background: "#1a1a2e",
            color: "#e0e0ea",
          }}
        />
        <button
          onClick={submit}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: 8,
            border: "none",
            background: "#22c55e",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Kirim
        </button>
      </div>
    </div>
  )
}
