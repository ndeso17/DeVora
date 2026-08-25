// Streaming STT recognizer — faster-whisper (multilingual incl. Indonesian).
// Spawns scripts/stt_worker_stream.py. Fast CPU inference enables frequent
// partial flushes for a near-live transcript.

import { resolve } from "node:path"
import { SttSubprocessRecognizer, PACKAGE_ROOT } from "./subprocess.ts"
import type { SpeechRecognizerConfig } from "./client.ts"

export class StreamingRecognizer extends SttSubprocessRecognizer {
  constructor(config: SpeechRecognizerConfig) {
    super(true)
    const model = config.modelPath ?? resolve(process.env.DEVORA_MODELS_DIR ?? resolve(PACKAGE_ROOT, "../../models"), "faster-whisper-base")
    this.workerEnv = { WHISPER_LANG: config.language, STT_TRAILING_MS: config.trailingMs?.toString() ?? "2000" }
    this.workerArgs = [resolve(PACKAGE_ROOT, "scripts/stt_worker_stream.py"), "--model", model]
  }
}
