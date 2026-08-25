import type { Snapshot } from "../lib/ws"

export function Conversation({
  conversation,
  activity,
  partialTranscript,
  error,
}: {
  conversation: Snapshot["conversation"]
  activity: Snapshot["activity"]
  partialTranscript?: string
  error?: string | null
}) {
  if (conversation.length === 0 && !partialTranscript && !error) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Mulai bicara atau ketik perintah…
      </div>
    )
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 px-4 py-4">
      {error && (
        <div className="bg-red-500/10 border-l-2 border-red-500 text-red-400 text-sm px-3 py-2 rounded">
          {error}
        </div>
      )}
      {conversation.map((m, i) => (
        <div
          key={i}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div className={`max-w-[80%] ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`text-xs font-semibold mb-0.5 ${
                m.role === "user" ? "text-text text-right" : "text-violet-500"
              }`}
            >
              {m.role === "user" ? "You" : "DeVora"}
            </div>
            <div
              className={`px-3 py-2 rounded-xl text-sm leading-relaxed text-text ${
                m.role === "user"
                  ? "bg-violet-500/10 border-l-2 border-violet-500"
                  : "bg-surface"
              }`}
            >
              {m.text}
            </div>
          </div>
        </div>
      ))}
      {partialTranscript && (
        <div className="text-muted italic text-sm">"{partialTranscript}…"</div>
      )}
      {activity.length > 0 && (
        <div className="text-xs text-muted font-mono mt-2 border-t border-surface-2 pt-2">
          {activity.slice(-3).map((a, i) => (
            <div key={i}>{a}</div>
          ))}
        </div>
      )}
    </div>
  )
}
