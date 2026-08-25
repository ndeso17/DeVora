import { useEffect, useRef, useState } from "react"
import { WsClient, type Snapshot, type BridgeContext, type SessionInfo, type ModelOption, type DirList } from "./ws"

function wavUrl(wavB64: string): Blob {
  const bytes = atob(wavB64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: "audio/wav" })
}

export function useWs() {
  const wsRef = useRef<WsClient | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const activeSrcRef = useRef<AudioBufferSourceNode | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [context, setContext] = useState<BridgeContext | null>(null)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [dirList, setDirList] = useState<DirList | null>(null)
  const [model, setModel] = useState<ModelOption | null>(null)

  useEffect(() => {
    const client = new WsClient({
      onState: setSnapshot,
      onAudio: (wavB64) => {
        void (async () => {
          try {
            const ctx = audioCtxRef.current ?? new AudioContext()
            audioCtxRef.current = ctx
            await ctx.resume()
            const buf = await ctx.decodeAudioData(await (await wavUrl(wavB64).arrayBuffer()))
            activeSrcRef.current?.stop()
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.connect(ctx.destination)
            src.onended = () => {
              if (activeSrcRef.current === src) activeSrcRef.current = null
            }
            activeSrcRef.current = src
            src.start()
          } catch (err) {
            setSnapshot((s) => (s ? { ...s, error: `TTS playback: ${String(err)}` } : s))
          }
        })()
      },
      onError: (message) => setSnapshot((s) => (s ? { ...s, error: message } : s)),
      onContext: setContext,
      onSessions: setSessions,
      onSessionSelected: setSessionId,
      onConnectionChange: setConnected,
      onDirList: setDirList,
      onModel: setModel,
    })
    wsRef.current = client
    client.connect()
    return () => {
      client.close()
    }
  }, [])

  const ws = wsRef.current

  return {
    connected,
    snapshot,
    context,
    sessions,
    dirList,
    model,
    sessionId,
    start: () => ws?.start(),
    stop: () => ws?.stop(),
    feedAudio: (b64: string) => ws?.feedAudio(b64),
    interrupt: () => ws?.interrupt(),
    submit: (text: string) => ws?.submit(text),
    createSession: (directory: string, title?: string, model?: ModelOption) =>
      ws?.createSession(directory, title, model),
    selectSession: (id: string, model?: ModelOption) => ws?.selectSession(id, model),
    setModel: (model: ModelOption) => ws?.setModel(model),
    listDir: (path?: string) => ws?.listDir(path),
  }
}
