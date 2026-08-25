#!/usr/bin/env node
// DeVora CLI — install & manage the DeVora voice server.
//
//   npx devora install [--hotspot]   full install (deps, build, systemd)
//   npx devora start|stop|restart|status   systemd service control
//   npx devora doctor                check installed dependencies
//   npx devora ca                    how to trust the local CA
//   npx devora version               print version
import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(__dirname, "..", "scripts", "install.sh")
const PKG = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"))
const isRoot = typeof process.getuid === "function" && process.getuid() === 0

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false, ...opts })
  return r.status ?? 1
}

function sudoRun(args) {
  if (isRoot) return run("bash", args)
  return run("sudo", ["bash", ...args])
}

function has(cmd) {
  return spawnSync("bash", ["-lc", `command -v ${cmd}`], { stdio: "ignore" }).status === 0
}

function service(action) {
  if (!has("systemctl")) {
    console.error("ERROR: systemctl tidak ditemukan — bukan sistem systemd")
    process.exit(1)
  }
  const ok = sudoRun(["-c", `systemctl ${action} devora`]) === 0
  if (!ok) console.error(`Gagal systemctl ${action} devora`)
  process.exit(ok ? 0 : 1)
}

const commands = {
  install(args) {
    const hotspot = args.includes("--hotspot")
    const skipBuild = args.includes("--skip-build")
    if (!existsSync(SCRIPT)) {
      console.error("ERROR: install.sh tidak ditemukan di package")
      process.exit(1)
    }
    const flags = [hotspot ? "--hotspot" : "", skipBuild ? "--skip-build" : ""].filter(Boolean)
    console.log(`\n  DeVora installer v${PKG.version}\n  Script: ${SCRIPT}\n`)
    const r = run("bash", [SCRIPT, ...flags])
    process.exit(r)
  },

  start: () => service("start"),
  stop: () => service("stop"),
  restart: () => service("restart"),
  status: () => service("status"),

  doctor() {
    const checks = ["bun", "opencode", "piper", "python3", "nginx", "named", "systemctl"]
    console.log("DeVora doctor — cek dependensi:\n")
    let fail = 0
    for (const c of checks) {
      const ok = has(c)
      if (!ok && ["nginx", "named", "systemctl"].includes(c)) {
        console.log(`  ${ok ? "✓" : "○"} ${c} (opsional — hotspot)`)
      } else {
        console.log(`  ${ok ? "✓" : "✗"} ${c}`)
        if (!ok) fail++
      }
    }
    const svc = spawnSync("systemctl", ["is-active", "devora"], { encoding: "utf8" }).stdout.trim()
    console.log(`  ${svc === "active" ? "✓" : "○"} service devora (${svc || "tidak ada"})`)
    console.log(fail ? `\n  ${fail} dependensi hilang — jalankan: devora install` : "\n  Semua OK ✓")
    process.exit(fail ? 1 : 0)
  },

  ca() {
    console.log(`
  DeVora CA — trust certificate di perangkat klien:

  1. Unduh CA dari server:
     https://${process.env.DEVORA_DOMAIN || "devora.local"}/ca.crt

  2. Install sesuai OS:
     Linux  : sudo cp devora-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
     macOS  : sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain devora-ca.crt
     Windows: Import ke "Trusted Root Certification Authorities" (MMC certmgr.msc)
     Android: Settings → Keamanan → Instal sertifikat CA (devora-ca.crt)
     iOS    : AirDrop/email devora-ca.crt → install profile → enable full trust

  3. Set DNS perangkat hotspot → 10.42.0.1, lalu buka https://devora.local
`)
  },

  version: () => console.log(PKG.version),
  help() {
    console.log(`
  DeVora CLI v${PKG.version}

  Usage: devora <command> [options]

  Commands:
    install [--hotspot] [--skip-build]   Install server (deps + build + systemd)
    start | stop | restart | status      Kontrol service systemd devora
    doctor                               Cek dependensi terinstall
    ca                                   Cara trust CA lokal di perangkat
    version                              Versi CLI
    help                                 Bantuan ini
`)
  },
}

const [cmd, ...rest] = process.argv.slice(2)
const fn = commands[cmd] ?? commands.help
fn(rest)
