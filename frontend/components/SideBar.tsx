"use client"

import { useState } from "react"

interface Session {
  id: string
  title: string
  timestamp: string
}

interface User {
  name: string
  email: string
}

interface SidebarProps {
  sessions: Session[]
  onNewSession: () => void
  onSelectSession: (id: string) => void
  currentSessionId: string
  user: User | null
  onLoginClick: () => void
  onLogout: () => void
  onOpenSessions: () => void
}

export default function Sidebar({
  sessions, onNewSession, onSelectSession,
  currentSessionId, user, onLoginClick, onLogout, onOpenSessions
}: SidebarProps) {
  const [expanded, setExpanded] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [recentsOpen, setRecentsOpen] = useState(true)

  const initials = user?.name
    ? user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?"

  const handleSessionsClick = () => {
    if (!user) { onLoginClick(); return }
    onOpenSessions()
  }

  return (
    <div style={{
      width: expanded ? "240px" : "48px",
      height: "100vh",
      backgroundColor: "#161616",
      borderRight: "1px solid #2a2a2a",
      display: "flex",
      flexDirection: "column",
      transition: "width 0.25s ease",
      overflow: "hidden",
      flexShrink: 0,
      zIndex: 10,
      position: "relative",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    }}>

      {/* Top icons */}
      <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: "2px" }}>
        <SidebarBtn icon="→" label="Toggle" expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          extraStyle={{ transform: expanded ? "rotate(180deg)" : "none" }} />
        <SidebarBtn icon="+" label="New session" expanded={expanded}
          onClick={user ? onNewSession : onLoginClick} />
        <SidebarBtn icon="□" label="Sessions" expanded={expanded}
          onClick={handleSessionsClick} />
      </div>

      {/* Recents header — only visible when expanded */}
      {expanded && (
        <div
          onClick={() => setRecentsOpen(!recentsOpen)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px 6px",
            cursor: "pointer",
            userSelect: "none"
          }}
        >
          <span style={{ fontSize: "12px", color: "#9a9a9a", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Recents
          </span>
          <span style={{
            fontSize: "14px", color: "#9a9a9a",
            transition: "transform 0.15s",
            display: "inline-block",
            transform: recentsOpen ? "rotate(0deg)" : "rotate(-90deg)"
          }}>
            ▾
          </span>
        </div>
      )}

      {/* Inline session list — only visible when expanded and recentsOpen */}
      {expanded && recentsOpen && (
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 6px",
          display: "flex",
          flexDirection: "column",
          gap: "2px"
        }}>
          {sessions.length === 0 ? (
            <div style={{ color: "#5a5a5a", fontSize: "11px", padding: "12px" }}>
              No sessions yet
            </div>
          ) : (
            sessions.map(session => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  backgroundColor: session.id === currentSessionId ? "#252526" : "transparent",
                  transition: "background 0.15s"
                }}
                onMouseEnter={e => {
                  if (session.id !== currentSessionId) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "#1f1f1f"
                  }
                }}
                onMouseLeave={e => {
                  if (session.id !== currentSessionId) {
                    (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"
                  }
                }}
              >
                <div style={{
                  fontSize: "11px",
                  color: "#d4d4d4",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical"
                }}>
                  {session.title}
                </div>
                <div style={{ fontSize: "10px", color: "#5a5a5a", marginTop: "3px" }}>
                  {session.timestamp}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {(!expanded || !recentsOpen) && <div style={{ flex: 1 }} />}

      {/* Bottom — login or user profile */}
      <div style={{ padding: "12px", borderTop: "1px solid #2a2a2a" }}>
        {user ? (
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                cursor: "pointer", padding: "4px",
                borderRadius: "6px", transition: "background 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#252526"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
            >
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%",
                backgroundColor: "#007acc",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "11px", color: "#fff", fontWeight: "700", flexShrink: 0
              }}>
                {initials}
              </div>
              {expanded && (
                <div style={{ overflow: "hidden" }}>
                  <div style={{
                    fontSize: "11px", color: "#d4d4d4",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                  }}>{user.name}</div>
                  <div style={{
                    fontSize: "10px", color: "#5a5a5a",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
                  }}>{user.email}</div>
                </div>
              )}
            </div>

            {showUserMenu && (
              <div style={{
                position: "absolute", bottom: "40px",
                left: expanded ? "0" : "48px",
                backgroundColor: "#252526",
                border: "1px solid #3e3e42",
                borderRadius: "8px",
                padding: "4px",
                minWidth: "160px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                zIndex: 50
              }}>
                <div style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid #3e3e42",
                  marginBottom: "4px"
                }}>
                  <div style={{ color: "#d4d4d4", fontSize: "11px" }}>{user.name}</div>
                  <div style={{ color: "#5a5a5a", fontSize: "10px", marginTop: "2px" }}>{user.email}</div>
                </div>
                <button
                  onClick={() => { onLogout(); setShowUserMenu(false) }}
                  style={{
                    width: "100%", textAlign: "left",
                    backgroundColor: "transparent", border: "none",
                    color: "#f14c4c", fontSize: "11px",
                    fontFamily: "inherit", cursor: "pointer",
                    padding: "7px 12px", borderRadius: "4px",
                    transition: "background 0.15s"
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#3e1a1a"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
                >
                  sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={onLoginClick}
            title="Sign in"
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              cursor: "pointer", padding: "6px 4px",
              borderRadius: "6px", transition: "background 0.15s"
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#252526"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"}
          >
            <div style={{
              width: "28px", height: "28px", borderRadius: "50%",
              border: "1px dashed #3e3e42",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "13px", flexShrink: 0
            }}>
              👤
            </div>
            {expanded && (
              <div style={{ fontSize: "11px", color: "#007acc", whiteSpace: "nowrap" }}>
                sign in
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SidebarBtn({ icon, label, expanded, onClick, extraStyle }: {
  icon: string; label: string; expanded: boolean
  onClick: () => void; extraStyle?: React.CSSProperties
}) {
  return (
    <div onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 12px", cursor: "pointer", color: "#8a8a8a",
        fontSize: "14px", transition: "color 0.15s", whiteSpace: "nowrap",
        ...extraStyle
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#d4d4d4"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#8a8a8a"}
    >
      <span style={{ width: "20px", textAlign: "center", flexShrink: 0 }}>{icon}</span>
      {expanded && <span style={{ fontSize: "12px" }}>{label}</span>}
    </div>
  )
}