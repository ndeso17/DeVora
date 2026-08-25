// Vosk recognizer — local streaming STT (English model). Spawns
// scripts/stt_worker_vosk.py from the package venv.

import { resolve } from "node:path"
import { SttSubprocessRecognizer, PACKAGE_ROOT } from "./subprocess.ts"
import type { SpeechRecognizerConfig } from "./client.ts"

export class VoskRecognizer extends SttSubprocessRecognizer {
  constructor(config: SpeechRecognizerConfig) {
    super(true)
    const model = config.modelPath ?? resolve(process.env.DEVORA_MODELS_DIR ?? resolve(PACKAGE_ROOT, "../../models"), "vosk-model-small-en-us-0.15")
    this.workerArgs = [resolve(PACKAGE_ROOT, "scripts/stt_worker_vosk.py"), "--model", model]
  }
}