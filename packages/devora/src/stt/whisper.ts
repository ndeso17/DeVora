// Whisper recognizer — local multilingual STT (openai-whisper base.pt).
// Supports Indonesian via --language id. Partial: transcribes trailing window
// on each flush. Spawns scripts/stt_worker_whisper.py.

import { resolve } from "node:path"
import { SttSubprocessRecognizer, PACKAGE_ROOT } from "./subprocess.ts"
import type { SpeechRecognizerConfig } from "./client.ts"

export class WhisperRecognizer extends SttSubprocessRecognizer {
  constructor(config: SpeechRecognizerConfig) {
    super(false) // partials via flush only
    const model = config.modelPath ?? resolve(process.env.DEVORA_MODELS_DIR ?? resolve(PACKAGE_ROOT, "../../models"), "base.pt")
    this.workerEnv = { WHISPER_LANG: config.language }
    this.workerArgs = [resolve(PACKAGE_ROOT, "scripts/stt_worker_whisper.py"), "--model", model]
  }
}