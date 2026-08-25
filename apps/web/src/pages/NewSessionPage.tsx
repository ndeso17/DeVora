import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Search,
  Check,
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  Cpu,
  ChevronDown,
  CheckCircle2,
  Folder,
  ArrowUp,
  Loader2,
} from "lucide-react"
import type { BridgeContext, DirList } from "../lib/ws"

const RECENT_KEY = "devora.recentProjects"

function loadRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]
  } catch {
    return []
  }
}

function saveRecent(dir: string) {
  const next = [dir, ...loadRecent().filter((r) => r !== dir)].slice(0, 5)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

function ProjectPicker({
  dirList,
  value,
  onChange,
  onListDir,
}: {
  dirList: DirList | null
  value: string | null
  onChange: (d: string) => void
  onListDir: (path?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && !dirList) onListDir("")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const navigateTo = (path: string) => {
    setLoading(true)
    onListDir(path)
  }

  useEffect(() => {
    if (dirList) setLoading(false)
  }, [dirList])

  const selected = value
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 bg-bg border border-surface-2 rounded-lg px-3 py-2 text-sm text-text hover:border-violet-500/50 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Folder size={14} className="text-muted shrink-0" />
        <span className="flex-1 min-w-0 truncate font-mono">
          {selected ?? "Pilih project directory…"}
        </span>
        <ChevronDown size={14} className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface border border-surface-2 rounded-lg shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-surface-2">
              <span className="flex-1 font-mono text-xs text-muted truncate" title={dirList?.path ?? ""}>
                {dirList?.path ?? "Memuat…"}
              </span>
              {dirList?.parent && (
                <button
                  type="button"
                  onClick={() => navigateTo(dirList.parent)}
                  className="flex items-center gap-1 text-muted hover:text-text text-xs shrink-0"
                >
                  <ArrowUp size={12} /> Naik
                </button>
              )}
            </div>
            <div className="max-h-52 overflow-y-auto">
              {loading && (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-muted text-sm">
                  <Loader2 size={14} className="animate-spin" /> Memuat folder…
                </div>
              )}
              {!loading && (dirList?.dirs.length ?? 0) === 0 && (
                <div className="px-3 py-4 text-center text-muted text-sm">Folder kosong</div>
              )}
              {!loading &&
                (dirList?.dirs ?? []).map((d) => (
                  <div key={d} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => navigateTo(d)}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 transition-colors min-w-0"
                    >
                      <Folder size={13} className="text-muted shrink-0" />
                      <span className="truncate font-mono text-xs">{d.split("/").pop()}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(d)
                        setOpen(false)
                      }}
                      className={`mr-2 px-2 py-1 rounded text-xs shrink-0 border transition-colors ${
                        d === selected
                          ? "border-violet-500 text-violet-400 bg-violet-500/10"
                          : "border-surface-2 text-muted hover:text-text"
                      }`}
                      title="Pilih folder ini"
                    >
                      {d === selected ? <Check size={12} /> : "Pilih"}
                    </button>
                  </div>
                ))}
            </div>
            {dirList && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-surface-2">
                <span className="text-xs text-muted truncate font-mono">{dirList.dirs.length} folder</span>
                {dirList.path !== selected && (
                  <button
                    type="button"
                    onClick={() => {
                      onChange(dirList.path)
                      setOpen(false)
                    }}
                    className="text-xs px-2 py-1 rounded bg-violet-500 text-white font-semibold shrink-0"
                  >
                    Pilih folder ini
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export function NewSessionPage({
  context,
  dirList,
  onCreateSession,
  onListDir,
}: {
  context: BridgeContext | null
  dirList: DirList | null
  onCreateSession: (directory: string, model?: { providerID: string; modelID: string }) => void
  onListDir: (path?: string) => void
}) {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [directory, setDirectory] = useState<string | null>(null)
  const [modelQuery, setModelQuery] = useState("")
  const [model, setModel] = useState<{ providerID: string; modelID: string } | null>(null)

  const models = (context?.models ?? []).filter((m) =>
    modelQuery.trim() ? m.id.toLowerCase().includes(modelQuery.toLowerCase()) : true,
  )

  const start = () => {
    if (!directory) return
    saveRecent(directory)
    onCreateSession(directory, model ?? undefined)
    navigate("/conversation")
  }

  return (
    <div className="h-full flex flex-col items-center px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-xl">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1 text-muted hover:text-text text-sm mb-6"
        >
          <ArrowLeft size={14} /> Kembali
        </button>

        <div className="mb-6">
          <h1 className="font-display text-xl font-bold text-text">Session Baru</h1>
          <div className="flex items-center gap-2 mt-2 text-sm">
            <span className={`flex items-center gap-1 ${step === 1 ? "text-violet-500 font-semibold" : "text-muted"}`}>
              <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs">1</span>
              Project Directory
            </span>
            <span className="text-muted">→</span>
            <span className={`flex items-center gap-1 ${step === 2 ? "text-violet-500 font-semibold" : "text-muted"}`}>
              <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs">2</span>
              Pilih Model
            </span>
          </div>
        </div>

        {step === 1 && (
          <div className="bg-surface border border-surface-2 rounded-xl p-4">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              <FolderOpen size={13} /> Project Directory
            </label>
            <ProjectPicker
              dirList={dirList}
              value={directory}
              onChange={setDirectory}
              onListDir={onListDir}
            />
            <p className="text-xs text-muted mt-2">
              <CheckCircle2 size={11} className="inline mr-1" />
              Browse folder di server — pilih project directory
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => navigate("/")} className="px-3 py-1.5 rounded-lg border border-surface-2 text-muted text-sm hover:text-text">
                Cancel
              </button>
              <button
                onClick={() => setStep(2)}
                disabled={!directory}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-surface border border-surface-2 rounded-xl p-4">
            <p className="text-xs text-muted font-mono mb-3 truncate">📁 {directory}</p>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              <Cpu size={13} /> Pilih Model
            </label>
            <div className="flex items-center gap-2 bg-bg border border-surface-2 rounded-lg px-3 py-2 mb-3">
              <Search size={14} className="text-muted" />
              <input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder="Cari model…"
                className="bg-transparent outline-none flex-1 text-sm text-text placeholder:text-muted"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {models.map((m) => {
                const selected = model?.modelID === m.id && model?.providerID === m.provider
                return (
                  <button
                    key={`${m.provider}/${m.id}`}
                    onClick={() => setModel({ providerID: m.provider, modelID: m.id })}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selected
                        ? "border-violet-500 bg-violet-500/10"
                        : "border-surface-2 hover:border-surface-2/50"
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        selected ? "border-violet-500" : "border-muted"
                      }`}
                    >
                      {selected && <span className="w-2 h-2 rounded-full bg-violet-500" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-text truncate">{m.id}</span>
                      <span className="block text-xs text-muted font-mono truncate">{m.provider}</span>
                    </span>
                    {selected && <Check size={15} className="ml-auto text-violet-500 shrink-0" />}
                  </button>
                )
              })}
            </div>
            <div className="flex justify-between gap-2 mt-4">
              <button onClick={() => setStep(1)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-surface-2 text-muted text-sm hover:text-text">
                <ArrowLeft size={14} /> Back
              </button>
              <button
                onClick={start}
                disabled={!model}
                className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-400 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
