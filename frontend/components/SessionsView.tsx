"use client"

import { useRef, useState } from "react"

interface Session {
  id: string
  title: string
  timestamp: string
}

interface SessionsViewProps {
  sessions: Session[]
  currentSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onClose: () => void
}

export default function SessionsView({
  sessions, currentSessionId, onSelectSession, onNewSession, onClose
}: SessionsViewProps) {
  const [search, setSearch] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = sessions.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{
      flex: 1,
      height: "100vh",
      overflowY: "auto",
      backgroundColor: "#1e1e1e",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      display: "flex",
      justifyContent: "center"
    }}>
      <div style={{
        width: "100%", maxWidth: "820px",
        padding: "4rem 2rem 3rem"
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: "1.5rem"
        }}>
          <h1 style={{ margin: 0, color: "#d4d4d4", fontSize: "28px", fontWeight: 500 }}>
            Sessions🐛
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={onNewSession}
              style={{
                backgroundColor: "#007acc", border: "1px solid #007acc",
                borderRadius: "8px", color: "#fff", cursor: "pointer",
                fontSize: "13px", fontFamily: "inherit", fontWeight: 600,
                padding: "9px 18px", display: "flex", alignItems: "center", gap: "6px"
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#1a9fff"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#007acc"}
            >
              <span>+</span> New session
            </button>
            <button
              onClick={onClose}
              title="Close"
              style={{
                width: "34px", height: "34px",
                display: "flex", alignItems: "center", justifyContent: "center",
                backgroundColor: "transparent", border: "1px solid #3e3e42",
                borderRadius: "8px", color: "#8a8a8a", cursor: "pointer",
                fontSize: "18px", fontFamily: "inherit"
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#d4d4d4"; (e.currentTarget as HTMLElement).style.borderColor = "#5a5a5a" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#8a8a8a"; (e.currentTarget as HTMLElement).style.borderColor = "#3e3e42" }}
            >×</button>
          </div>
        </div>

        {/* Search bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: "10px",
          backgroundColor: "#252526", border: "1px solid #3e3e42",
          borderRadius: "10px", padding: "11px 16px",
          marginBottom: "1.5rem"
        }}>
          <span style={{ color: "#5a5a5a", fontSize: "14px" }}>🔍</span>
          <input
            ref={inputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search sessions..."
            style={{
              flex: 1, backgroundColor: "transparent", border: "none",
              color: "#d4d4d4", fontSize: "13px", fontFamily: "inherit", outline: "none"
            }}
          />
          {search && (
            <span
              onClick={() => setSearch("")}
              style={{ color: "#5a5a5a", fontSize: "13px", cursor: "pointer" }}
            >×</span>
          )}
        </div>

        {/* Session list */}
        <div style={{
          backgroundColor: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: "12px",
          overflow: "hidden"
        }}>
          {filtered.length === 0 && (
            <div style={{ color: "#5a5a5a", fontSize: "13px", padding: "40px 16px", textAlign: "center" }}>
              {sessions.length === 0 ? "// no sessions yet" : "// no matches found"}
            </div>
          )}
          {filtered.map((s, i) => (
            <div key={s.id} onClick={() => onSelectSession(s.id)}
              style={{
                padding: "16px 20px", cursor: "pointer",
                borderBottom: i < filtered.length - 1 ? "1px solid #232323" : "none",
                backgroundColor: s.id === currentSessionId ? "#212223" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: "16px",
                transition: "background 0.12s"
              }}
              onMouseEnter={e => {
                if (s.id !== currentSessionId)
                  (e.currentTarget as HTMLElement).style.backgroundColor = "#212121"
              }}
              onMouseLeave={e => {
                if (s.id !== currentSessionId)
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"
              }}
            >
              <span style={{
                color: "#d4d4d4", fontSize: "14px",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
              }}>{s.title}</span>
              <span style={{
                color: "#5a5a5a", fontSize: "12px", flexShrink: 0
              }}>{s.timestamp}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}