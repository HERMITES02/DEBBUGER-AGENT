"use client"

import { useState, useEffect } from "react"

interface AgentMessage {
  agent_id:   string
  type:       string
  payload:    string    // ← was "content"
  confidence: number
  session_id: string
  timestamp:  number
}

interface AgentLogProps {
  sessionId: string
  isRunning: boolean
}

const AGENT_COLORS: Record<string, string> = {
  vision_agent: "#c586c0",
  code_analysis_agent: "#569cd6",
  context_builder_agent: "#4ec9b0",
  orchestrator: "#e5c07b",
  patch_agent: "#98c379",
  test_agent: "#f14c4c",
}

const AGENT_LABELS: Record<string, string> = {
  vision_agent: "vision agent",
  code_analysis_agent: "code analysis",
  context_builder_agent: "context builder",
  orchestrator: "orchestrator",
  patch_agent: "patch agent",
  test_agent: "test agent",
}

export default function AgentLog({ sessionId, isRunning }: AgentLogProps) {
  const [logs, setLogs] = useState<AgentMessage[]>([])
  const [connected, setConnected] = useState<boolean>(false)

  useEffect(() => {
    if (!sessionId || !isRunning) return

    const ws = new WebSocket(`ws://localhost:8000/ws/debug`)
    ws.onopen = () => {
      setConnected(true)
      console.log("[AgentLog] WebSocket connected")
    }

    ws.onmessage = (event) => {
      try {
        const data: AgentMessage = JSON.parse(event.data)
        setLogs(prev => [...prev, data])
      } catch (e) {
        console.error("[AgentLog] failed to parse message:", e)
      }
    }

    ws.onerror = (error) => {
      console.error("[AgentLog] WebSocket error:", error)
    }

    ws.onclose = () => {
      setConnected(false)
      console.log("[AgentLog] WebSocket closed")
    }

    return () => {
      ws.close()
    }
  }, [sessionId, isRunning])

  // clear logs when new session starts
  useEffect(() => {
    if (isRunning) setLogs([])
  }, [sessionId])

  if (!isRunning && logs.length === 0) return null

  return (
    <div style={{
      maxWidth: "820px",
      margin: "0 auto",
      padding: "0 1.5rem 3rem",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    }}>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "#569cd6", fontSize: "13px" }}>agent_log</span>
          <span style={{ color: "#d4d4d4", fontSize: "13px" }}>=</span>
          <span style={{ color: "#ce9178", fontSize: "13px" }}>[]</span>
        </div>

        {/* Connection indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: connected ? "#98c379" : "#5a5a5a",
            boxShadow: connected ? "0 0 6px #98c379" : "none",
            transition: "all 0.3s ease"
          }} />
          <span style={{
            fontSize: "11px",
            color: connected ? "#98c379" : "#5a5a5a"
          }}>
            {connected ? "connected" : "waiting"}
          </span>
        </div>
      </div>

      {/* Log container */}
      <div style={{
        backgroundColor: "#252526",
        border: "1px solid #3e3e42",
        borderRadius: "6px",
        overflow: "hidden"
      }}>

        {/* Tab bar */}
        <div style={{
          backgroundColor: "#2d2d2d",
          borderBottom: "1px solid #3e3e42",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{
            padding: "7px 16px",
            fontSize: "13px",
            color: "#d4d4d4",
            borderBottom: "1px solid #007acc",
            backgroundColor: "#252526"
          }}>
            terminal
          </div>
          <span style={{ fontSize: "11px", color: "#5a5a5a" }}>
            {logs.length} message{logs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Log entries */}
        <div style={{
          padding: "12px",
          minHeight: "120px",
          maxHeight: "320px",
          overflowY: "auto"
        }}>

          {/* Empty state */}
          {logs.length === 0 && isRunning && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#5a5a5a",
              fontSize: "13px"
            }}>
              <span style={{ animation: "pulse 1s infinite" }}>▶</span>
              <span>waiting for agents...</span>
            </div>
          )}

          {/* Log items */}
          {logs.map((log, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "6px 0",
                borderBottom: index < logs.length - 1 ? "1px solid #3e3e42" : "none",
                animation: "fadeIn 0.3s ease"
              }}
            >
              {/* Timestamp */}
              <span style={{
                color: "#5a5a5a",
                fontSize: "11px",
                minWidth: "60px",
                paddingTop: "1px"
              }}>
                {new Date().toLocaleTimeString("en", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit"
                })}
              </span>

              {/* Agent name */}
              <span style={{
                color: AGENT_COLORS[log.agent_id] || "#d4d4d4",
                fontSize: "12px",
                minWidth: "140px",
                paddingTop: "1px"
              }}>
                [{AGENT_LABELS[log.agent_id] || log.agent_id}]
              </span>

              {/* Message type + confidence */}
              <div style={{ flex: 1 }}>
                <span style={{ color: "#d4d4d4", fontSize: "12px" }}>
                 {log.type}: {log.payload?.slice(0, 80)}
                </span>
                <span style={{
                  marginLeft: "8px",
                  color: log.confidence >= 0.8 ? "#98c379" : log.confidence >= 0.5 ? "#e5c07b" : "#f14c4c",
                  fontSize: "11px"
                }}>
                  {Math.round(log.confidence * 100)}%
                </span>
              </div>

              {/* Done indicator */}
              <span style={{ color: "#98c379", fontSize: "12px" }}>✓</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}