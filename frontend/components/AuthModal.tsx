"use client"

import { useState } from "react"

interface AuthModalProps {
  onClose: () => void
  onLogin: (user: { name: string; email: string; token: string; user_id: string }) => void
  onApiLogin:    (email: string, password: string) => Promise<{ token: string; user_id: string; username: string }>
  onApiRegister: (email: string, username: string, password: string) => Promise<{ token: string; user_id: string; username: string }>
}

export default function AuthModal({ onClose, onLogin, onApiLogin, onApiRegister }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [showPassword, setShowPassword] = useState(false)

 const handleSubmit = async () => {
  if (!email || !password) { setError("Please fill all fields"); return }
  if (mode === "signup" && !name) { setError("Please enter your name"); return }
  setLoading(true); setError("")
  try {
    const data = mode === "signup"
      ? await onApiRegister(email, name, password)
      : await onApiLogin(email, password)
    const user = { name: data.username, email, token: data.token, user_id: data.user_id }
    localStorage.setItem("debugger_user", JSON.stringify(user))
    onLogin(user)
    onClose()
  } catch (err: any) {
    setError(err.message || "Auth failed")
  } finally {
    setLoading(false)
  }
}

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          backgroundColor: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 100
        }}
      />

      {/* Modal */}
      <div className="auth-modal" style={{
        position: "fixed",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 101,
        width: "360px",
        backgroundColor: "#1e1e1e",
        border: "1px solid #3e3e42",
        borderRadius: "12px",
        padding: "2rem",
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)"
      }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{
            width: "48px", height: "48px", borderRadius: "12px",
            backgroundColor: "#252526", border: "1px solid #3e3e42",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "22px", margin: "0 auto 0.75rem"
          }}>🐛</div>
          <div style={{ color: "#d4d4d4", fontSize: "14px", fontWeight: "500" }}>
            <span style={{ color: "#569cd6" }}>debugger</span>
            <span style={{ color: "#3e3e42" }}>.</span>
            <span style={{ color: "#dcdcaa" }}>agent</span>
          </div>
          <div style={{ color: "#5a5a5a", fontSize: "11px", marginTop: "4px" }}>
            // {mode === "login" ? "welcome back" : "create account"}
          </div>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: "flex",
          backgroundColor: "#252526",
          border: "1px solid #3e3e42",
          borderRadius: "8px",
          padding: "3px",
          marginBottom: "1.25rem"
        }}>
          {(["login", "signup"] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError("") }}
              style={{
                flex: 1, padding: "6px",
                backgroundColor: mode === m ? "#007acc" : "transparent",
                border: "none", borderRadius: "6px",
                color: mode === m ? "#fff" : "#5a5a5a",
                fontSize: "11px", fontFamily: "inherit",
                cursor: "pointer", transition: "all 0.15s"
              }}
            >
              {m === "login" ? "sign in" : "sign up"}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

          {mode === "signup" && (
            <div style={{
              backgroundColor: "#252526", border: "1px solid #3e3e42",
              borderRadius: "8px", padding: "10px 14px",
              display: "flex", alignItems: "center", gap: "8px"
            }}>
              <span style={{ color: "#5a5a5a", fontSize: "12px" }}>👤</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="your name"
                style={{
                  flex: 1, backgroundColor: "transparent", border: "none",
                  color: "#d4d4d4", fontSize: "12px", fontFamily: "inherit", outline: "none"
                }}
              />
            </div>
          )}

          <div style={{
            backgroundColor: "#252526", border: "1px solid #3e3e42",
            borderRadius: "8px", padding: "10px 14px",
            display: "flex", alignItems: "center", gap: "8px"
          }}>
            <span style={{ color: "#5a5a5a", fontSize: "12px" }}>@</span>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email address"
              type="email"
              onKeyDown={e => { if (e.key === "Enter") handleSubmit() }}
              style={{
                flex: 1, backgroundColor: "transparent", border: "none",
                color: "#d4d4d4", fontSize: "12px", fontFamily: "inherit", outline: "none"
              }}
            />
          </div>

          <div style={{
            backgroundColor: "#252526", border: "1px solid #3e3e42",
            borderRadius: "8px", padding: "10px 14px",
            display: "flex", alignItems: "center", gap: "8px"
          }}>
            <span style={{ color: "#5a5a5a", fontSize: "12px" }}>🔒</span>
            <input
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="password"
              type={showPassword ? "text" : "password"}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit() }}
              style={{
                flex: 1, backgroundColor: "transparent", border: "none",
                color: "#d4d4d4", fontSize: "12px", fontFamily: "inherit", outline: "none"
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#8a8a8a",
                transition: "color 0.15s"
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#d4d4d4")}
              onMouseLeave={e => (e.currentTarget.style.color = "#8a8a8a")}
              title={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                  <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                  <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {error && (
            <div style={{ color: "#f14c4c", fontSize: "11px", paddingLeft: "4px" }}>
              // {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              backgroundColor: loading ? "#252526" : "#007acc",
              border: `1px solid ${loading ? "#3e3e42" : "#007acc"}`,
              borderRadius: "8px",
              color: loading ? "#5a5a5a" : "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "12px", fontFamily: "inherit", fontWeight: "600",
              padding: "10px", width: "100%",
              transition: "all 0.15s", marginTop: "4px"
            }}
          >
            {loading ? "// authenticating..." : mode === "login" ? "► sign in" : "► create account"}
          </button>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: "12px", right: "14px",
            backgroundColor: "transparent", border: "none",
            color: "#5a5a5a", cursor: "pointer", fontSize: "16px",
            fontFamily: "inherit"
          }}
        >×</button>
      </div>
    </>
  )
}