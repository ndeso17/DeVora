import { useState } from "react"
import { Send, Square } from "lucide-react"
import { Conversation } from "../components/Conversation"
import type { Snapshot } from "../lib/ws"

export function TypePage({
  snapshot,
  onSubmit,
  onInterrupt,
}: {
  snapshot: Snapshot | null
  onSubmit: (text: string) => void
  onInterrupt: () => void
}) {
  const [input, setInput] = useState("")

  const submit = () => {
    const text = input.trim()
    if (!text) return
    onSubmit(text)
    setInput("")
  }

  const state = snapshot?.state ?? "idle"
  const working = state === "working" || state === "submitting"

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 flex flex-col">
        <Conversation
          conversation={snapshot?.conversation ?? []}
          activity={snapshot?.activity ?? []}
          partialTranscript={undefined}
          error={snapshot?.error}
        />
      </div>
      <div className="flex items-center gap-2 px-4 py-3 border-t border-surface-2">
        {working && (
          <button
            onClick={onInterrupt}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-surface-2 text-muted text-sm hover:text-text"
          >
            <Square size={14} /> Stop
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ketik pesan…"
          className="flex-1 min-w-0 bg-surface border border-surface-2 rounded-lg px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-violet-500 transition-colors"
        />
        <button
          onClick={submit}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} /> Kirim
        </button>
      </div>
    </div>
  )
}
