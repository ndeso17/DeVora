import { useState } from "react"
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom"
import { Wifi, WifiOff, PanelLeft, Power } from "lucide-react"
import { useWs } from "./lib/useWs"
import { SetupPage } from "./pages/SetupPage"
import { NewSessionPage } from "./pages/NewSessionPage"
import { VoicePage } from "./pages/VoicePage"
import { TypePage } from "./pages/TypePage"
import { InfoPanel } from "./components/InfoPanel"
import { ModeToggle, type Mode } from "./components/ModeToggle"

function Shell() {
  const ws = useWs()
  const [mode, setMode] = useState<Mode>("voice")
  const [infoOpen, setInfoOpen] = useState(false)
  const navigate = useNavigate()

  const endSession = () => {
    ws.stop()
    navigate("/")
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-surface-2 shrink-0">
        <button
          onClick={() => setInfoOpen(true)}
          className="lg:hidden text-muted hover:text-text"
          aria-label="Buka info"
        >
          <PanelLeft size={18} />
        </button>
        <span className="font-display font-semibold text-violet-500 text-lg">DeVora</span>
        <span className="flex-1" />
        {ws.connected ? (
          <Wifi size={14} className="text-emerald-400" />
        ) : (
          <WifiOff size={14} className="text-red-400" />
        )}
        {ws.sessionId && (
          <span className="text-xs text-muted font-mono">{ws.sessionId.slice(0, 8)}</span>
        )}
        <button onClick={endSession} className="text-muted hover:text-red-400" aria-label="Akhiri sesi">
          <Power size={16} />
        </button>
      </header>
      <div className="flex-1 min-h-0 flex relative">
        <InfoPanel context={ws.context} open={infoOpen} onClose={() => setInfoOpen(false)} />
        <main className="flex-1 min-h-0">
          <Routes>
            <Route
              path="/"
              element={
                <SetupPage
                  sessions={ws.sessions}
                  connected={ws.connected}
                  context={ws.context}
                  onSelectSession={(id) => ws.selectSession(id)}
                />
              }
            />
            <Route
              path="/new"
              element={
                <NewSessionPage
                  context={ws.context}
                  dirList={ws.dirList}
                  onCreateSession={(directory, model) => ws.createSession(directory, undefined, model)}
                  onListDir={(path) => ws.listDir(path)}
                />
              }
            />
            <Route
              path="/conversation"
              element={
                <div className="h-full relative">
                  <ModeToggle mode={mode} onChange={setMode} />
                  {mode === "voice" ? (
                    <VoicePage
                      snapshot={ws.snapshot}
                      models={ws.context?.models ?? []}
                      activeModel={ws.model}
                      onSubmit={(text) => ws.submit(text)}
                      onSetModel={(m) => ws.setModel(m)}
                      onInterrupt={() => ws.interrupt()}
                      onEndSession={endSession}
                      onSwitchToType={() => setMode("type")}
                    />
                  ) : (
                    <TypePage
                      snapshot={ws.snapshot}
                      onSubmit={(text) => ws.submit(text)}
                      onInterrupt={() => ws.interrupt()}
                    />
                  )}
                </div>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}
