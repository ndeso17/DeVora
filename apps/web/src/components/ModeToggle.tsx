import { Mic, Keyboard } from "lucide-react"

export type Mode = "voice" | "type"

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 flex bg-surface border border-surface-2 rounded-full p-1 text-sm shadow-lg">
      <button
        onClick={() => onChange("voice")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
          mode === "voice" ? "bg-violet-500 text-white" : "text-muted hover:text-text"
        }`}
        aria-pressed={mode === "voice"}
      >
        <Mic size={14} /> Voice
      </button>
      <button
        onClick={() => onChange("type")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
          mode === "type" ? "bg-violet-500 text-white" : "text-muted hover:text-text"
        }`}
        aria-pressed={mode === "type"}
      >
        <Keyboard size={14} /> Type
      </button>
    </div>
  )
}
