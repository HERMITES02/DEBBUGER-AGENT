"use client"

import { useEffect, useState } from "react"

interface AgentEvent {
  agent_id: string
  type: string
  payload: string
  timestamp: number
}

interface AgentFlowChartProps {
  sessionId: string
  isRunning: boolean
  mockMode?: boolean
  mockAgents?: AgentEvent[]
}

const AGENT_META: Record<string, { label: string; color: string }> = {
  router:                { label: "Input Router", color: "#569cd6" },
  code_analysis_agent:   { label: "Code Agent",   color: "#4ec9b0" },
  context_builder_agent: { label: "Context",      color: "#9cdcfe" },
  orchestrator:          { label: "Orchestrator", color: "#e5c07b" },
  analyse:               { label: "Search",       color: "#d7ba7d" },
  patch_agent:           { label: "Patch",        color: "#98c379" },
  test_agent:            { label: "Test Agent",   color: "#f14c4c" },
}

const PIPELINE = ["router","code_analysis_agent","context_builder_agent","orchestrator","analyse","patch_agent","test_agent"]

export default function AgentFlowChart({ sessionId, isRunning, mockMode, mockAgents }: AgentFlowChartProps) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [visibleNodes, setVisibleNodes] = useState<string[]>([])

  useEffect(() => {
    if (!mockMode || !mockAgents || !isRunning) return
    setEvents([]); setVisibleNodes([])
    const timers = mockAgents.map(a =>
      setTimeout(() => {
        setEvents(prev => [...prev, a])
        setVisibleNodes(prev => prev.includes(a.agent_id) ? prev : [...prev, a.agent_id])
      }, a.timestamp)
    )
    return () => timers.forEach(clearTimeout)
  }, [isRunning, mockMode])

  useEffect(() => {
    if (!sessionId || !isRunning || mockMode) return
    const ws = new WebSocket("ws://localhost:8000/ws/debug")
    ws.onmessage = e => {
      try {
        const data = JSON.parse(e.data)
        setEvents(prev => [...prev, data])
        setVisibleNodes(prev => prev.includes(data.agent_id) ? prev : [...prev, data.agent_id])
      } catch {}
    }
    return () => ws.close()
  }, [sessionId, isRunning, mockMode])

  useEffect(() => {
    if (isRunning) { setEvents([]); setVisibleNodes([]) }
  }, [sessionId])

  const getStatus = (id: string) => {
    const evs = events.filter(e => e.agent_id === id)
    if (evs.some(e => e.type === "result")) return "done"
    if (evs.some(e => e.type === "thinking")) return "running"
    return "pending"
  }

  const getPayload = (id: string) => {
    const evs = events.filter(e => e.agent_id === id)
    return evs[evs.length - 1]?.payload || ""
  }

  const isAllDone = getStatus("test_agent") === "done"

  return (
    <div style={{
      width: "250px",
      height: "100%",
      overflowY: "auto",
      padding: "1rem 3rem",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      backgroundColor: "#1a1a1a",
      flexShrink: 0
    }}>

      {/* User avatar */}
      <div style={{
        width: "30px", height: "30px", borderRadius: "50%",
        backgroundColor: "#007acc", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: "12px", color: "#fff", fontWeight: "600", marginBottom: "6px"
      }}>A</div>

      {/* Arrow down */}
      <div style={{ width: "1px", height: "14px", backgroundColor: "#3e3e42" }} />
      <div style={{ color: "#3e3e42", fontSize: "10px", marginBottom: "4px" }}>↓</div>

      {/* Pipeline */}
      {PIPELINE.map((agentId, index) => {
        const meta = AGENT_META[agentId]
        const status = getStatus(agentId)
        const payload = getPayload(agentId)
        const visible = visibleNodes.includes(agentId)
        const isLast = index === PIPELINE.length - 1

        const statusColor = status === "done" ? "#98c379" : status === "running" ? "#e5c07b" : "#2a2a2a"

        return (
          <div key={agentId} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            width: "100%",
            opacity: visible ? 1 : 0.2,
            transition: "opacity 0.3s ease",
            animation: visible && status !== "pending" ? "fadeIn 0.3s ease" : "none"
          }}>
            <div style={{
              width: "100%",
              backgroundColor: "#252526",
              border: `1px solid ${statusColor}`,
              borderRadius: "6px",
              padding: "6px 10px",
              transition: "border-color 0.4s ease",
              boxShadow: status === "running" ? `0 0 8px ${statusColor}33` : "none"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: meta?.color || "#d4d4d4", fontSize: "11px", fontWeight: "500" }}>
                  {meta?.label || agentId}
                </span>
                <span style={{
                  color: statusColor, fontSize: "10px",
                  display: "inline-block",
                  animation: status === "running" ? "spin 1s linear infinite" : "none"
                }}>
                  {status === "done" ? "✓" : status === "running" ? "⟳" : "○"}
                </span>
              </div>
              {payload && visible && (
                <div style={{ color: "#6a9955", fontSize: "10px", marginTop: "3px", lineHeight: "1.4" }}>
                  // {payload.slice(0, 30)}{payload.length > 30 ? "..." : ""}
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

      {/* Done checkmark */}
      {isAllDone && (
        <>
          <div style={{ width: "1px", height: "14px", backgroundColor: "#98c379", marginTop: "4px" }} />
          <div style={{
            width: "30px", height: "30px", borderRadius: "50%",
            border: "2px solid #98c379",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#98c379", fontSize: "14px",
            animation: "fadeIn 0.3s ease"
          }}>✓</div>
        </>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}