import { useNavigate } from "react-router-dom"
import { SessionPicker } from "../components/SessionPicker"
import { Wifi, WifiOff } from "lucide-react"
import type { SessionInfo, BridgeContext } from "../lib/ws"

export function SetupPage({
  sessions,
  connected,
  context,
  onSelectSession,
}: {
  sessions: SessionInfo[]
  connected: boolean
  context: BridgeContext | null
  onSelectSession: (id: string) => void
}) {
  const navigate = useNavigate()
  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center gap-8 px-4 py-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-violet-500">DeVora Voice</h1>
        <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-muted">
          {connected ? (
            <Wifi size={13} className="text-emerald-400" />
          ) : (
            <WifiOff size={13} className="text-red-400" />
          )}
          {connected ? "terhubung" : "terputus"}
        </div>
      </div>
      <SessionPicker
        sessions={sessions}
        onSelect={(s) => {
          onSelectSession(s.id)
          navigate("/conversation")
        }}
        onNew={() => navigate("/new")}
      />
      <div className="text-center text-xs text-muted">
        <p className="font-mono">{context?.directory ?? "—"}</p>
        <p className="mt-1">
          {context?.mcp.length ?? 0} MCP · {context?.skills.length ?? 0} skills
        </p>
        <p className="mt-2 opacity-60">v0.1.0 · opencode serve</p>
      </div>
      </div>
    </div>
  )
}