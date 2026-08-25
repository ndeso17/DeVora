import { useCallback, useEffect, useRef } from "react"

type SpeechRecognitionResultLike = {
  isFinal: boolean
  0: { transcript: string }
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

type Ctor = new () => SpeechRecognitionLike

function getCtor(): Ctor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function useWebSpeechSTT({
  lang = "id-ID",
  autoRestart = true,
  onFinal,
  onInterim,
  onError,
}: {
  lang?: string
  /** restart recognition after it ends (continuous listening) */
  autoRestart?: boolean
  onFinal: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (message: string) => void
}) {
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const activeRef = useRef(false)
  const optsRef = useRef({ lang, autoRestart, onFinal, onInterim, onError })
  optsRef.current = { lang, autoRestart, onFinal, onInterim, onError }

  const start = useCallback(() => {
    if (activeRef.current) return
    const Ctor = getCtor()
    if (!Ctor) {
      optsRef.current.onError?.("Speech recognition tidak didukung browser ini")
      return
    }
    if (!window.isSecureContext) {
      optsRef.current.onError?.(
        "Speech recognition diblokir: koneksi HTTP non-localhost tidak aman. Gunakan HTTPS atau localhost.",
      )
      return
    }
    activeRef.current = true
    const rec = new Ctor()
    rec.lang = optsRef.current.lang
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      let interim = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          const t = r[0].transcript.trim()
          if (t) optsRef.current.onFinal(t)
        } else {
          interim += r[0].transcript
        }
      }
      if (interim.trim()) optsRef.current.onInterim?.(interim.trim())
    }
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        optsRef.current.onError?.("Akses mic ditolak browser")
      }
    }
    rec.onend = () => {
      if (activeRef.current && optsRef.current.autoRestart) {
        try {
          rec.start()
        } catch {
          activeRef.current = false
        }
      } else {
        activeRef.current = false
      }
    }
    recRef.current = rec
    try {
      rec.start()
    } catch {
      activeRef.current = false
    }
  }, [])

  const stop = useCallback(() => {
    activeRef.current = false
    recRef.current?.stop()
    recRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      recRef.current?.stop()
      recRef.current = null
    }
  }, [])

  return { start, stop }
}
