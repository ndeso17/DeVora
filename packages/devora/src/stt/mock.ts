// Mock recognizer — deterministic, no I/O. Used in tests and keyboard fallback
// mode. Returns a canned transcript or a configurable value.

import type { SpeechRecognizer } from "./client.ts"

export class MockRecognizer implements SpeechRecognizer {
  readonly supportsPartial = false
  private partialCb: ((text: string) => void)[] = []
  private finalCb: ((text: string) => void)[] = []
  private errorCb: ((message: string) => void)[] = []
  private _result = "Mock transcript"
  private _delay = 100

  constructor(result?: string, delay?: number) {
    if (result !== undefined) this._result = result
    if (delay !== undefined) this._delay = delay
  }

  onPartial(cb: (text: string) => void) {
    this.partialCb.push(cb)
  }
  onFinal(cb: (text: string) => void) {
    this.finalCb.push(cb)
  }
  onError(cb: (message: string) => void) {
    this.errorCb.push(cb)
  }
  start() {
    return Promise.resolve()
  }
  stop() {
    return Promise.resolve()
  }
  interrupt() {}
  feedAudio(_chunk: Buffer) {}
  flushPartial() {}
  async end(): Promise<string> {
    await new Promise((r) => setTimeout(r, this._delay))
    for (const cb of this.finalCb) cb(this._result)
    return this._result
  }
}