"use client"

import { useEffect, useState } from "react"

interface AgentEvent {
  agent_id:  string
  type:      string
  payload:   string
  timestamp: number
}

interface AgentFlowChartProps {
  sessionId: string
  isRunning: boolean
  onReady?: () => void
}

// ── Fix: agent IDs must match what publish_agent_event sends ─────────────
const AGENT_META: Record<string, { label: string; color: string }> = {
  router:                { label: "Input Router",  color: "#569cd6" },
  code_analysis_agent:   { label: "Code Agent",    color: "#4ec9b0" },
  context_builder_agent: { label: "Context",       color: "#9cdcfe" },
  orchestrator:          { label: "Orchestrator",  color: "#e5c07b" },
  search:                { label: "Search",        color: "#d7ba7d" }, // ← was "analyse"
  analyse:               { label: "Analyse",       color: "#c586c0" }, // ← keep both
  patch:                 { label: "Patch",         color: "#98c379" }, // ← was "patch_agent"
  patch_agent:           { label: "Patch",         color: "#98c379" }, // ← keep both
  test:                  { label: "Test Agent",    color: "#f14c4c" }, // ← was "test_agent"
  test_agent:            { label: "Test Agent",    color: "#f14c4c" }, // ← keep both
}

// ── Pipeline order matches actual execution order ─────────────────────────
const PIPELINE = [
  "router",
  "code_analysis_agent",
  "context_builder_agent",
  "search",
  "analyse",
  "patch",
  "test",
]

export default function AgentFlowChart({ sessionId, isRunning, onReady }: AgentFlowChartProps) {
  const [events,       setEvents]       = useState<AgentEvent[]>([])
  const [visibleNodes, setVisibleNodes] = useState<string[]>([])
  const [connected,    setConnected]    = useState(false)

  // Clear on new session
  useEffect(() => {
    setEvents([])
    setVisibleNodes([])
  }, [sessionId])

  useEffect(() => {
    // ── only connect when a session is running ──────────────────────────
    if (!sessionId || !isRunning) return

    setEvents([])
    setVisibleNodes([])

    // ── Build WebSocket URL from backend URL env var ──────────────────
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
    const wsUrl = backendUrl.replace(/^http/, "ws") + `/ws/events/${sessionId}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setConnected(true)
      console.log(`[AgentFlowChart] connected to session ${sessionId}`)
    }

    ws.onmessage = (event) => {
      try {
        const data: AgentEvent = JSON.parse(event.data)

        if (data.type === "ready") {
          console.log("[AgentFlowChart] redis subscribed — triggering start")
          onReady?.()
          return
        }

        if (data.type === "done") {
          setConnected(false)
          return
        }

        setEvents(prev => [...prev, data])
        setVisibleNodes(prev =>
          prev.includes(data.agent_id) ? prev : [...prev, data.agent_id]
        )
      } catch (e) {
        console.error("[AgentFlowChart] parse error:", e)
      }
    }

    ws.onerror = (e) => {
      setConnected(false)
    }

    ws.onclose = () => {
      setConnected(false)
    }

    return () => {
      ws.close()
    }
  }, [sessionId, isRunning])

  const getStatus = (id: string) => {
    const evs = events.filter(e => e.agent_id === id)
    if (evs.some(e => e.type === "result"))   return "done"
    if (evs.some(e => e.type === "thinking")) return "running"
    return "pending"
  }

  const getPayload = (id: string) => {
    const evs = events.filter(e => e.agent_id === id)
    return evs[evs.length - 1]?.payload || ""
  }

  const isAllDone = PIPELINE.every(id => getStatus(id) === "done")

  return (
    <div style={{
      width: "250px", height: "100%", overflowY: "auto",
      padding: "1rem 1.5rem", display: "flex",
      flexDirection: "column", alignItems: "center",
      backgroundColor: "#1a1a1a", flexShrink: 0,
    }}>

      {/* Connection indicator */}
      <div style={{
        display: "flex", alignItems: "center", gap: "6px",
        marginBottom: "12px", alignSelf: "flex-end"
      }}>
        <div style={{
          width: "7px", height: "7px", borderRadius: "50%",
          backgroundColor: connected ? "#98c379" : "#5a5a5a",
          boxShadow: connected ? "0 0 5px #98c379" : "none",
          transition: "all 0.3s"
        }} />
        <span style={{ fontSize: "10px", color: connected ? "#98c379" : "#5a5a5a" }}>
          {connected ? "live" : isRunning ? "connecting..." : "idle"}
        </span>
      </div>

      {/* User avatar */}
      <div style={{
        width: "30px", height: "30px", borderRadius: "50%",
        backgroundColor: "#007acc", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: "12px", color: "#fff", fontWeight: "600",
        marginBottom: "6px"
      }}>A</div>

      <div style={{ width: "1px", height: "14px", backgroundColor: "#3e3e42" }} />
      <div style={{ color: "#3e3e42", fontSize: "10px", marginBottom: "4px" }}>↓</div>

      {/* Pipeline nodes */}
      {PIPELINE.map((agentId, index) => {
        const meta    = AGENT_META[agentId]
        const status  = getStatus(agentId)
        const payload = getPayload(agentId)
        const visible = visibleNodes.includes(agentId)
        const isLast  = index === PIPELINE.length - 1

        const statusColor =
          status === "done"    ? "#98c379" :
          status === "running" ? "#e5c07b" :
          "#2a2a2a"

        return (
          <div key={agentId} style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", width: "100%",
            opacity: visible ? 1 : 0.25,
            transition: "opacity 0.4s ease",
          }}>
            <div style={{
              width: "100%", backgroundColor: "#252526",
              border: `1px solid ${statusColor}`,
              borderRadius: "6px", padding: "6px 10px",
              transition: "border-color 0.4s ease, box-shadow 0.4s ease",
              boxShadow: status === "running" ? `0 0 8px ${statusColor}55` : "none",
            }}>
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between"
              }}>
                <span style={{
                  color: meta?.color || "#d4d4d4",
                  fontSize: "11px", fontWeight: "500"
                }}>
                  {meta?.label || agentId}
                </span>
                <span style={{
                  color: statusColor, fontSize: "10px",
                  display: "inline-block",
                  animation: status === "running" ? "spin 1s linear infinite" : "none",
                }}>
                  {status === "done" ? "✓" : status === "running" ? "⟳" : "○"}
                </span>
              </div>

              {payload && visible && (
                <div style={{
                  color: "#6a9955", fontSize: "10px",
                  marginTop: "3px", lineHeight: "1.4"
                }}>
                  // {payload.slice(0, 35)}{payload.length > 35 ? "..." : ""}
                </div>
              )}
            </div>

            {!isLast && (
              <>
                <div style={{ width: "1px", height: "10px", backgroundColor: "#3e3e42" }} />
                <div style={{ color: "#3e3e42", fontSize: "10px" }}>↓</div>
                <div style={{ width: "1px", height: "10px", backgroundColor: "#3e3e42" }} />
              </>
            )}
          </div>
        )
      })}

      {/* Done state */}
      {isAllDone && (
        <>
          <div style={{
            width: "1px", height: "14px",
            backgroundColor: "#98c379", marginTop: "4px"
          }} />
          <div style={{
            width: "30px", height: "30px", borderRadius: "50%",
            border: "2px solid #98c379", display: "flex",
            alignItems: "center", justifyContent: "center",
            color: "#98c379", fontSize: "14px",
          }}>✓</div>
        </>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}