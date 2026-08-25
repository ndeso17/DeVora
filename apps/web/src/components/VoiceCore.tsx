const STATE_COLOR: Record<string, string> = {
  idle: "#8b8b9e",
  listening: "#34d399",
  speaking: "#fbbf24",
  working: "#60a5fa",
  transcribing: "#60a5fa",
  submitting: "#60a5fa",
  interrupting: "#fb923c",
  error: "#f87171",
}

export function VoiceCore({ state, size = 160 }: { state: string; size?: number }) {
  const color = STATE_COLOR[state] ?? "#8b8b9e"
  return (
    <div
      className={`core core--${state}`}
      style={{ color, width: size, height: size }}
      aria-hidden="true"
    >
      <div className="core-ring" />
      {state === "listening" && <div className="core-pulse-ring" />}
      {state === "listening" && <div className="core-pulse-ring" style={{ animationDelay: "0.5s" }} />}
      {state === "speaking" &&
        Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="core-wave-bar"
            style={{ transform: `rotate(${i * 45}deg)` }}
          >
            <div className="core-wave" style={{ animationDelay: `${(i % 4) * 0.09}s` }} />
          </div>
        ))}
      <div className="core-dot" />
    </div>
  )
}
