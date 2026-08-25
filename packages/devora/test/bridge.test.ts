import { describe, expect, test, afterAll } from "bun:test"
import { SdkBridge } from "../src/opencode/bridge.ts"

let server: ReturnType<typeof Bun.serve> | null = null
const requests: Array<{ method: string; path: string }> = []

function startMockServer() {
  let eventController: ReadableStreamDefaultController<Uint8Array> | null = null
  const encoder = new TextEncoder()

  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url)
      requests.push({ method: req.method, path: url.pathname })

      if (req.method === "POST" && url.pathname === "/session") {
        return Response.json({ id: "sess-mock-1", title: "DeVora Voice", directory: "/tmp" })
      }

      if (req.method === "POST" && url.pathname === "/session/sess-mock-1/message") {
        // notify event subscribers that the agent finished
        setTimeout(() => {
          try {
            const payload = `data: ${JSON.stringify({
              id: "evt-1",
              type: "session.idle",
              properties: { sessionID: "sess-mock-1" },
            })}\n\n`
            eventController?.enqueue(encoder.encode(payload))
          } catch {
            /* stream closed */
          }
        }, 30)
        return Response.json({ id: "msg-1", role: "user", parts: [] })
      }

      if (req.method === "POST" && url.pathname === "/session/sess-mock-1/abort") {
        return Response.json({ ok: true })
      }

      if (req.method === "GET" && url.pathname === "/event") {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            eventController = controller
          },
        })
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
        })
      }

      return new Response("not found", { status: 404 })
    },
  })
  return server
}

describe("SdkBridge — OpenCode HTTP boundary (doc §8)", () => {
  startMockServer()

  afterAll(() => {
    server?.stop(true)
  })

  test("connect creates a session via POST /session", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    const id = await bridge.connect("DeVora Voice")
    expect(id).toBe("sess-mock-1")
    expect(bridge.sessionId).toBe("sess-mock-1")
    expect(requests.some((r) => r.path === "/session" && r.method === "POST")).toBe(true)
    await bridge.close()
  })

  test("sendMessage posts text part to /session/{id}/message", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    await bridge.connect()
    await bridge.sendMessage("Cari kenapa login gagal")
    expect(
      requests.some((r) => r.path === "/session/sess-mock-1/message" && r.method === "POST"),
    ).toBe(true)
    await bridge.close()
  })

  test("abort posts to /session/{id}/abort", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    await bridge.connect()
    await bridge.abort()
    expect(requests.some((r) => r.path === "/session/sess-mock-1/abort")).toBe(true)
    await bridge.close()
  })

  test("onEvent receives SSE events from the server", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    const seen: string[] = []
    bridge.onEvent((ev) => seen.push(ev.type))
    await bridge.connect()
    await bridge.sendMessage("trigger idle event")
    // wait for the SSE event
    for (let i = 0; i < 150 && !seen.includes("session.idle"); i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(seen).toContain("session.idle")
    await bridge.close()
  })
})
