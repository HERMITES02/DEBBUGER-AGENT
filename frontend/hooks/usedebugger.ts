import { useState,useEffect } from "react"

export type AppState = "idle" | "running" | "done"
export interface Session { id: string; title: string; timestamp: string; confidence?: number }
export interface User { name: string; email: string; token: string; user_id: string }
export interface DebugResult {
  root_cause?: string
  patch?: string
  explanation?: string
  tests?: string[]
  confidence?: number
  session_id?: string
}

// ── set this to false to use real backend ───────────────────────────────

const API_BASE = "http://localhost:8000"

// ── helper: get stored token ───────────────────────────────────────────────
function getToken(): string | null {
  if (typeof window === "undefined") return null
  const user = localStorage.getItem("debugger_user")
  if (!user) return null
  try { return JSON.parse(user).token } catch { return null }
}

// ── helper: authenticated fetch ───────────────────────────────────────────
async function authFetch(url: string, options: RequestInit = {}) {
  const token = getToken()
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
}

// ── auth API calls ─────────────────────────────────────────────────────────
export async function apiRegister(
  email: string, username: string, password: string
): Promise<{ token: string; user_id: string; username: string }> {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || "Registration failed")
  }
  return res.json()
}

export async function apiLogin(
  email: string, password: string
): Promise<{ token: string; user_id: string; username: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || "Login failed")
  }
  return res.json()
}

export async function apiGetSessions(): Promise<Session[]> {
  const res = await authFetch(`${API_BASE}/sessions`)
  if (!res.ok) return []
  const data = await res.json()
  return (data.sessions || []).map((s: any) => ({
    id:         s.session_id,
    title:      s.summary || "Debug session",
    timestamp:  new Date(s.timestamp * 1000).toLocaleTimeString(),
    confidence: s.confidence,
  }))
}

// ── main debug call ────────────────────────────────────────────────────────
export async function apiDebug(
  userMessage: string,
  code:        string,
  language:    string,
  images:      string[],
  sessionId:   string,
): Promise<DebugResult> {
  const res = await authFetch(`${API_BASE}/debug`, {
    method: "POST",
    body: JSON.stringify({
      user_message: userMessage,
      code:         code || null,
      language,
      // strip data:image/png;base64, prefix if present
      images:       images.map(img => img.includes(",") ? img.split(",")[1] : img),
      session_id:   sessionId,
    }),
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Not authenticated — please log in")
    }
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Server error ${res.status}`)
  }
  return res.json()
}

// ── the hook ───────────────────────────────────────────────────────────────
export function useDebugger() {
  const [appState, setAppState]       = useState<AppState>("idle")
  const [sessionId, setSessionId]     = useState("")
  const [code, setCode]               = useState("")
  const [description, setDescription] = useState("")
  const [language, setLanguage]       = useState("python")
  const [images, setImages]           = useState<string[]>([])
  const [result, setResult]           = useState<DebugResult | null>(null)
  const [sessions, setSessions]       = useState<Session[]>([])
  const [showAuth, setShowAuth]       = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("debugger_user")
      return stored ? JSON.parse(stored) : null
    }
    return null
  })

  // Called by ChatInput when user clicks "run debugger"
  const handleStart = async (
    sid:  string,
    c:    string,
    desc: string,
    lang: string = "python",
    imgs: string[] = [],
  ) => {
    // Block if not logged in
    if (!user) {
      setShowAuth(true)
      return
    }

    setSessionId(sid)
    setCode(c)
    setDescription(desc)
    setLanguage(lang)
    setImages(imgs)
    setResult(null)
    setError(null)
    setAppState("running")

    try {
      const data = await apiDebug(desc, c, lang, imgs, sid)
      handleResult(data)
    } catch (err: any) {
      console.error("[useDebugger] error:", err)
      setError(err.message || "Something went wrong")
      setAppState("idle")
    }
  }

  // usedebugger.ts — deduplicate when setting sessions
const handleResult = (data: DebugResult) => {
  setResult(data)
  setAppState("done")
  if (user) {
    setSessions(prev => {
      const newSession = {
        id: sessionId,
        title: description || code.split("\n")[0].slice(0, 40) || "Debug session",
        timestamp: new Date().toLocaleTimeString(),
        confidence: data.confidence,
      }
      // deduplicate by id
      const filtered = prev.filter(s => s.id !== newSession.id)
      return [newSession, ...filtered.slice(0, 49)]
    })
  }
}

  const handleNewSession = () => {
    setAppState("idle")
    setResult(null)
    setCode("")
    setDescription("")
    setImages([])
    setError(null)
  }

  const handleLogin = (u: User) => {
    setUser(u)
    localStorage.setItem("debugger_user", JSON.stringify(u))
    setShowAuth(false)
    // Load session history
    apiGetSessions().then(incoming => {
  setSessions(prev => {
    const existingIds = new Set(prev.map(s => s.id))
    const merged = [...prev, ...incoming.filter(s => !existingIds.has(s.id))]
    return merged.slice(0, 50)
  })
})
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem("debugger_user")
    setSessions([])
    handleNewSession()
  }
useEffect(() => {
  if (user?.token) {
    apiGetSessions()
      .then(setSessions)
      .catch(() => {}) // silently ignore — backend may not be up yet
  }
}, [user?.token])
  return {
    appState, sessionId, code, description, language, images,
    result, sessions, showAuth, user, error,
    setShowAuth,
    handleStart, handleResult, handleNewSession,
    handleLogin, handleLogout,
  }
}