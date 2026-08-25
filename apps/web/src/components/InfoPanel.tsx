import { useState, type ReactNode } from "react"
import { FolderGit2, Plug, Boxes, Cpu, ChevronDown } from "lucide-react"
import type { BridgeContext } from "../lib/ws"

const MCP_COLOR: Record<string, string> = {
  connected: "text-emerald-400",
  disabled: "text-muted",
  failed: "text-red-400",
  needsAuth: "text-amber-400",
  needsClientRegistration: "text-amber-400",
}

function Section({
  icon,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  icon: ReactNode
  title: string
  count: number
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="border-b border-surface-2 pb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1 py-1 hover:text-text transition-colors"
        aria-expanded={open}
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        <span className="font-mono normal-case tracking-normal">{count}</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="mt-1">{children}</div>}
    </section>
  )
}

export function InfoPanel({
  context,
  open,
  onClose,
}: {
  context: BridgeContext | null
  open: boolean
  onClose: () => void
}) {
  return (
    <div
      className={`fixed inset-0 z-40 lg:static lg:inset-auto ${
        open ? "pointer-events-auto" : "pointer-events-none lg:pointer-events-auto"
      }`}
    >
      <div
        className={`absolute inset-0 bg-black/50 lg:hidden ${
          open ? "opacity-100" : "opacity-0"
        } transition-opacity`}
        onClick={onClose}
      />
      <aside
        className={`absolute inset-y-0 left-0 z-10 w-64 lg:w-72 lg:relative lg:inset-auto lg:h-full bg-bg border-r border-surface-2 p-4 overflow-y-auto transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between mb-4 lg:hidden">
          <span className="font-display font-semibold text-violet-500">Info</span>
          <button onClick={onClose} className="text-muted text-sm px-2 py-1">
            ✕
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <section className="border-b border-surface-2 pb-3">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1">
              <FolderGit2 size={13} /> Project
            </h3>
            <p className="font-mono text-xs text-text break-all">
              {context?.directory ?? "—"}
            </p>
          </section>
          <Section icon={<Plug size={13} />} title="MCP Servers" count={context?.mcp.length ?? 0}>
            <ul className="space-y-0.5">
              {(context?.mcp ?? []).map((m) => (
                <li key={m.name} className="flex items-center gap-1.5 font-mono text-xs">
                  <span
                    className={`w-1.5 h-1.5 rounded-full bg-current inline-block ${
                      MCP_COLOR[m.status] ?? "text-muted"
                    }`}
                  />
                  {m.name}
                </li>
              ))}
              {(context?.mcp.length ?? 0) === 0 && (
                <li className="text-muted text-xs">Tidak ada MCP</li>
              )}
            </ul>
          </Section>
          <Section icon={<Boxes size={13} />} title="Skills" count={context?.skills.length ?? 0}>
            <div className="flex flex-wrap gap-1">
              {(context?.skills ?? []).map((s) => (
                <span
                  key={s}
                  className="px-1.5 py-0.5 rounded bg-surface-2 text-muted text-xs font-mono"
                >
                  {s}
                </span>
              ))}
              {(context?.skills.length ?? 0) === 0 && (
                <span className="text-muted text-xs">Tidak ada skills</span>
              )}
            </div>
          </Section>
          <Section icon={<Cpu size={13} />} title="Models" count={context?.models.length ?? 0}>
            <ul className="space-y-0.5">
              {(context?.models ?? []).map((m) => (
                <li key={`${m.provider}/${m.id}`} className="font-mono text-xs text-text truncate">
                  {m.id}
                  <span className="text-muted"> · {m.provider}</span>
                </li>
              ))}
              {(context?.models.length ?? 0) === 0 && (
                <li className="text-muted text-xs">Tidak ada models</li>
              )}
            </ul>
          </Section>
        </div>
      </aside>
    </div>
  )
}
