// Test helpers — synthetic PCM16 audio generation + fake adapters.

export function silencePcm(ms: number, sampleRate = 16000): Buffer {
  const samples = Math.round((sampleRate * ms) / 1000)
  return Buffer.alloc(samples * 2)
}

/** Constant-amplitude PCM16 "speech-like" tone. */
export function tonePcm(ms: number, amplitude = 8000, sampleRate = 16000): Buffer {
  const samples = Math.round((sampleRate * ms) / 1000)
  const buf = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) {
    const value = i % 2 === 0 ? amplitude : -amplitude
    buf.writeInt16LE(value, i * 2)
  }
  return buf
}
