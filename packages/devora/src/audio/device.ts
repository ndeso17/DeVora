// Device discovery via ALSA (arecord -l). Provider-agnostic shell: returns
// AudioDevice[] parsed from `arecord -l` output. No devices found when arecord
// is unavailable — callers must fall back to keyboard input.

import { spawnSync } from "node:child_process"
import type { AudioDevice } from "../types.ts"

const parseArecordList = (raw: string): AudioDevice[] => {
  const devices: AudioDevice[] = []
  const cardRe = /^card (\d+): (.+?) \[(.+?)\], device (\d+): (.+?) \[(.+?)\]\s*$/
  for (const line of raw.split("\n")) {
    const m = line.match(cardRe)
    if (!m) continue
    const [, card, , , , name] = m
    devices.push({
      id: `hw:${card}`,
      name: name.trim(),
      available: true,
    })
  }
  return devices
}

export function listAudioDevices(): AudioDevice[] {
  try {
    const res = spawnSync("arecord", ["-l"], { encoding: "utf8", timeout: 5000 })
    if (res.status !== 0) return []
    return parseArecordList(res.stdout ?? "")
  } catch {
    return []
  }
}

export function defaultAudioDevice(): AudioDevice | undefined {
  return listAudioDevices()[0]
}

export function isAudioAvailable(): boolean {
  return listAudioDevices().length > 0
}