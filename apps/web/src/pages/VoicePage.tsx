import { useEffect, useRef, useState } from "react"
import { Square, Power, Keyboard, Cpu, Mic } from "lucide-react"
import { VoiceCore } from "../components/VoiceCore"
import { Conversation } from "../components/Conversation"
import { useWebSpeechSTT } from "../lib/useWebSpeechSTT"
import type { Snapshot, ModelOption } from "../lib/ws"

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

export function VoicePage({
  snapshot,
  models,
  activeModel,
  onSubmit,
  onSetModel,
  onInterrupt,
  onEndSession,
  onSwitchToType,
}: {
  snapshot: Snapshot | null
  models: Array<{ id: string; provider: string }>
  activeModel: ModelOption | null
  onSubmit: (text: string) => void
  onSetModel: (m: ModelOption) => void
  onInterrupt: () => void
  onEndSession: () => void
  onSwitchToType: () => void
}) {
  const [interim, setInterim] = useState("")
  const [micError, setMicError] = useState<string | null>(null)
  const [mode, setMode] = useState<"continuous" | "push">(() => {
    const saved = localStorage.getItem("devora.micMode")
    return saved === "push" ? "push" : "continuous"
  })
  const lastAssistantRef = useRef("")
  const pushDownRef = useRef(false)

  useEffect(() => {
    const conv = snapshot?.conversation ?? []
    const last = [...conv].reverse().find((m) => m.role === "assistant")
    if (last) lastAssistantRef.current = last.text
  }, [snapshot?.conversation])

  function wordOverlap(a: string, b: string): number {
    const wa = new Set(a.toLowerCase().split(/\W+/).filter(Boolean))
    const wb = new Set(b.toLowerCase().split(/\W+/).filter(Boolean))
    if (wa.size === 0 || wb.size === 0) return 0
    let hit = 0
    for (const w of wa) if (wb.has(w)) hit++
    return hit / Math.min(wa.size, wb.size)
  }

  const { start, stop } = useWebSpeechSTT({
    lang: "id-ID",
    autoRestart: mode === "continuous",
    collectUntilStop: mode === "push",
    onFinal: (text) => {
      if (!text.trim()) return
      // echo filter: drop final that mostly repeats what the agent just said
      if (wordOverlap(text, lastAssistantRef.current) > 0.6) {
        setInterim("")
        return
      }
      setInterim("")
      onSubmit(text)
    },
    onInterim: setInterim,
    onError: setMicError,
  })

  useEffect(() => {
    if (mode === "continuous") start()
    else stop()
    return () => {
      setInterim("")
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // push-to-talk: hold SPACE to record
  useEffect(() => {
    if (mode !== "push") return
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON")) return
      e.preventDefault()
      pushDownRef.current = true
      setInterim("")
      start()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !pushDownRef.current) return
      pushDownRef.current = false
      stop()
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
      pushDownRef.current = false
      stop()
    }
  }, [mode, start, stop])

  const setModePersist = (m: "continuous" | "push") => {
    setMode(m)
    localStorage.setItem("devora.micMode", m)
  }

  const state = snapshot?.state ?? "idle"
  const label = STATE_LABEL[state] ?? state.toUpperCase()
  const liveText = interim || snapshot?.partialTranscript

  return (
    <div className="h-full flex flex-col">
      {micError && (
        <div className="mx-4 mt-3 bg-amber-500/10 border-l-2 border-amber-500 text-amber-400 text-sm px-3 py-2 rounded flex items-center gap-3">
          <span className="flex-1">{micError}</span>
          <button
            onClick={onSwitchToType}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-xs font-semibold shrink-0"
          >
            <Keyboard size={13} /> Gunakan Mode Type
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col items-center justify-center gap-4 px-4 py-6">
          <VoiceCore state={micError ? "error" : state} />
          <div className="text-center">
            <p className="font-display font-bold text-lg uppercase">
              {micError ? "MIC TIDAK TERSEDIA" : label}
            </p>
            {liveText && (
              <p className="text-muted italic text-sm mt-1 max-w-md">"{liveText}…"</p>
            )}
          </div>
          {snapshot?.opencodeSessionId && !micError && (
            <p className="text-xs text-muted font-mono">
              session {snapshot.opencodeSessionId.slice(0, 8)} · mic aktif
            </p>
          )}
          {!micError && (
            <div className="flex items-center gap-1 bg-surface border border-surface-2 rounded-full p-0.5 text-xs">
              <button
                onClick={() => setModePersist("continuous")}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  mode === "continuous" ? "bg-violet-500 text-white" : "text-muted hover:text-text"
                }`}
              >
                Terus menerus
              </button>
              <button
                onClick={() => setModePersist("push")}
                className={`px-2.5 py-1 rounded-full transition-colors ${
                  mode === "push" ? "bg-violet-500 text-white" : "text-muted hover:text-text"
                }`}
              >
                Space
              </button>
            </div>
          )}
          {mode === "push" && !micError && (
            <div className="flex flex-col items-center gap-2">
              <button
                onPointerDown={(e) => {
                  e.preventDefault()
                  pushDownRef.current = true
                  setInterim("")
                  start()
                }}
                onPointerUp={() => {
                  pushDownRef.current = false
                  stop()
                }}
                onPointerLeave={() => {
                  if (pushDownRef.current) {
                    pushDownRef.current = false
                    stop()
                  }
                }}
                onPointerCancel={() => {
                  pushDownRef.current = false
                  stop()
                }}
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-colors select-none touch-none active:scale-95 ${
                  pushDownRef.current ? "bg-red-500" : "bg-violet-500"
                }`}
                aria-label="Tahan untuk bicara"
              >
                <Mic size={32} className="text-white" />
              </button>
              <p className="text-xs text-muted">
                {pushDownRef.current ? "🎙 Merekam… lepas" : "Tahan tombol untuk bicara"}
              </p>
            </div>
          )}
          {!micError && (
            <div className="flex items-center gap-1.5 bg-surface border border-surface-2 rounded-full px-3 py-1.5 text-xs">
              <Cpu size={12} className="text-muted shrink-0" />
              <select
                value={activeModel ? `${activeModel.providerID}/${activeModel.modelID}` : ""}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) return
                  const idx = v.indexOf("/")
                  const providerID = v.slice(0, idx)
                  const modelID = v.slice(idx + 1)
                  onSetModel({ providerID, modelID })
                }}
                className="bg-transparent outline-none text-text font-mono text-xs cursor-pointer max-w-[200px]"
                title="Ganti model"
              >
                <option value="">Default (opencode)</option>
                {models.map((m) => (
                  <option key={`${m.provider}/${m.id}`} value={`${m.provider}/${m.id}`}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-col min-h-0">
          <Conversation
            conversation={snapshot?.conversation ?? []}
            activity={snapshot?.activity ?? []}
            partialTranscript={undefined}
            error={snapshot?.error}
          />
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-surface-2">
        <button
          onClick={onInterrupt}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-2 text-muted text-sm hover:text-text"
        >
          <Square size={14} /> Interrupt
        </button>
        <span className="flex-1" />
        <button
          onClick={onEndSession}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 text-red-400 text-sm hover:bg-red-500/10"
        >
          <Power size={14} /> Akhiri Sesi
        </button>
      </div>
    </div>
  )
}
