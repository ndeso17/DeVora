import { describe, expect, test, afterAll } from "bun:test"
import { SdkBridge } from "../src/opencode/bridge.ts"

let server: ReturnType<typeof Bun.serve> | null = null
const requests: Array<{ method: string; path: string; body?: unknown }> = []

function startMockServer() {
  let eventController: ReadableStreamDefaultController<Uint8Array> | null = null
  const encoder = new TextEncoder()

  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url)
      let body: unknown = undefined
      const raw = await req.text()
      if (raw) {
        try {
          body = JSON.parse(raw)
        } catch {
          body = raw
        }
      }
      requests.push({ method: req.method, path: url.pathname, body })

      if (req.method === "POST" && url.pathname === "/session") {
        return Response.json({ id: "sess-mock-1", title: "DeVora Voice", directory: "/tmp" })
      }

      if (req.method === "GET" && url.pathname === "/session") {
        return Response.json([
          {
            id: "sess-mock-1",
            title: "DeVora Voice",
            directory: "/tmp",
            time: { created: 1000, updated: 2000 },
          },
          {
            id: "sess-mock-2",
            title: "Debu PR",
            directory: "/tmp",
            time: { created: 3000, updated: 4000 },
          },
        ])
      }

      if (req.method === "GET" && url.pathname === "/session/sess-mock-1") {
        return Response.json({ id: "sess-mock-1", title: "DeVora Voice", directory: "/tmp" })
      }

      if (req.method === "GET" && url.pathname === "/mcp") {
        return Response.json({
          codegraph: { status: "connected" },
          context7: { status: "connected" },
          postman: { status: "disabled" },
        })
      }

      if (req.method === "GET" && url.pathname === "/config/providers") {
        return Response.json({
          providers: [
            {
              id: "anthropic",
              name: "Anthropic",
              source: "env",
              env: [],
              options: {},
              models: {
                "claude-3-5-sonnet": {
                  id: "claude-3-5-sonnet",
                  providerID: "anthropic",
                  name: "Claude 3.5 Sonnet",
                  status: "active",
                  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
                  limit: { context: 200000, output: 8192 },
                  capabilities: {
                    temperature: true,
                    reasoning: true,
                    attachment: true,
                    toolcall: true,
                    input: {},
                    output: {},
                  },
                },
              },
            },
          ],
          default: { build: "anthropic/claude-3-5-sonnet" },
        })
      }

      if (req.method === "GET" && url.pathname === "/config") {
        return Response.json({ agent: { build: {}, plan: {} } })
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

  test("listSessions fetches GET /session", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    await bridge.connect()
    const sessions = await bridge.listSessions()
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    expect(sessions.some((s) => s.id === "sess-mock-2" && s.title === "Debu PR")).toBe(true)
    expect(requests.some((r) => r.path === "/session" && r.method === "GET")).toBe(true)
    await bridge.close()
  })

  test("createSession posts directory query + title body", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    await bridge.connect()
    const id = await bridge.createSession({ directory: "/home/x/proj", title: "Proyek Baru" })
    expect(id).toBe("sess-mock-1")
    const req = requests.find((r) => r.path === "/session" && r.method === "POST")
    expect(req).toBeDefined()
    await bridge.close()
  })

  test("setSession switches active session id", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    await bridge.connect()
    expect(bridge.sessionId).toBe("sess-mock-1")
    bridge.setSession("sess-mock-2")
    expect(bridge.sessionId).toBe("sess-mock-2")
    await bridge.close()
  })

  test("sendMessage passes model option in prompt body", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    await bridge.connect()
    await bridge.sendMessage("hai", { providerID: "anthropic", modelID: "claude-3-5-sonnet" })
    await bridge.close()
    const req = requests.find(
      (r) => r.path === "/session/sess-mock-1/message" && r.method === "POST" && (r.body as { model?: unknown })?.model,
    )
    expect(req).toBeDefined()
    const body = req!.body as { model?: { providerID: string; modelID: string } }
    expect(body.model).toEqual({ providerID: "anthropic", modelID: "claude-3-5-sonnet" })
  })

  test("getContext returns directory, mcp, skills, models", async () => {
    const bridge = new SdkBridge(`http://127.0.0.1:${server!.port}`)
    await bridge.connect()
    const ctx = await bridge.getContext("sess-mock-1", "/tmp")
    expect(ctx.directory).toBe("/tmp")
    expect(ctx.mcp.find((m) => m.name === "codegraph")?.status).toBe("connected")
    expect(ctx.models.some((m) => m.id === "claude-3-5-sonnet" && m.provider === "anthropic")).toBe(true)
    expect(Array.isArray(ctx.skills)).toBe(true)
    await bridge.close()
  })
})
