// Narration queue (doc §8). Prioritized, deduplicated queue feeding the TTS
// sink. Only non-trivial narration enters TTS.

import type { NarrationEvent, NarrationPriority } from "../types.ts"
import { priorityRank } from "./filter.ts"

export type NarrationSink = (text: string, priority: NarrationPriority) => void

export class Narrator {
  private queue: NarrationEvent[] = []
  private sinks: NarrationSink[] = []
  private lastEmitted: Map<string, number> = new Map()
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false
  /** dedup window per dedupKey (ms) */
  private readonly dedupWindowMs: number

  constructor(dedupWindowMs = 30_000) {
    this.dedupWindowMs = dedupWindowMs
  }

  onNarrate(cb: NarrationSink) {
    this.sinks.push(cb)
    return () => {
      this.sinks = this.sinks.filter((s) => s !== cb)
    }
  }

  /**
   * Enqueue an event. Events are flushed as a sorted batch on the next tick,
   * so priority ordering applies within a burst and dedup/clear stay cheap.
   */
  enqueue(event: NarrationEvent) {
    if (this.stopped) return
    if (event.dedupKey) {
      const last = this.lastEmitted.get(event.dedupKey) ?? 0
      if (Date.now() - last < this.dedupWindowMs) return
      if (this.queue.some((q) => q.dedupKey === event.dedupKey)) return
    }
    this.queue.push(event)
    this.queue.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 0)
    }
  }

  private flush() {
    this.flushTimer = null
    const batch = this.queue
    this.queue = []
    for (const item of batch) {
      if (this.stopped) break
      if (item.dedupKey) this.lastEmitted.set(item.dedupKey, Date.now())
      this.sinks.forEach((cb) => cb(item.text, item.priority))
    }
  }

  /** Immediately drop queued (not yet emitted) narration. */
  clear() {
    this.queue = []
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  stop() {
    this.stopped = true
    this.clear()
  }

  resume() {
    this.stopped = false
  }

  get pending() {
    return this.queue.length
  }
}