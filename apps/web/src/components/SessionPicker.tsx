import { useMemo, useState } from "react"
import { Search, Plus, History } from "lucide-react"
import type { SessionInfo } from "../lib/ws"

function fmtTime(ms: number): string {
  if (!ms) return "—"
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getDate()} ${d.toLocaleString("id", { month: "short" })} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SessionPicker({
  sessions,
  onSelect,
  onNew,
}: {
  sessions: SessionInfo[]
  onSelect: (s: SessionInfo) => void
  onNew: () => void
}) {
  const [q, setQ] = useState("")
  const filtered = useMemo(() => {
    if (!q.trim()) return sessions
    const t = q.toLowerCase()
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(t) || s.id.toLowerCase().includes(t),
    )
  }, [sessions, q])

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-surface border border-surface-2 rounded-lg px-3 py-2">
          <Search size={15} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari sesi…"
            className="bg-transparent outline-none flex-1 text-sm text-text placeholder:text-muted"
          />
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 bg-violet-500 hover:bg-violet-400 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
        >
          <Plus size={15} /> Baru
        </button>
      </div>
      <div className="bg-surface border border-surface-2 rounded-xl overflow-hidden">
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-muted text-sm">Tidak ada sesi ditemukan</div>
        )}
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2 transition-colors border-b border-surface-2 last:border-b-0"
          >
            <History size={15} className="text-muted shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-text truncate">{s.title}</span>
              <span className="block text-xs text-muted font-mono truncate">{s.directory}</span>
            </span>
            <span className="text-xs text-muted font-mono shrink-0">{fmtTime(s.updated)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
