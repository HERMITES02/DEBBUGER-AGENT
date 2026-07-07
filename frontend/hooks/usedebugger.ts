import React, { useState, useEffect } from "react"

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
  user_message?: string
  code?: string
  language?: string
  images?: string[]
  request?: any
}

// ── set this to false to use real backend ───────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"

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
  return (data.sessions || []).map((s: any) => {
    const raw = (s.summary || "")
      .replace("ROOT_CAUSE:", "")
      .trim()
    const title = raw.split(/\s+/).slice(0, 4).join(" ") || "Debug session"
    return {
      id:         s.session_id,
      title,
      timestamp:  new Date(s.timestamp * 1000).toLocaleTimeString(),
      confidence: s.confidence,
    }
  })
}

// ── main debug call ────────────────────────────────────────────────────────
export async function apiDebug(
  userMessage: string,
  code: string,
  language: string,
  images: string[],
  sessionId: string,
  token?: string
): Promise<DebugResult> {
  const res = await fetch(`${API_BASE}/debug`, {  // ← direct fetch, not authFetch
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})  // ← use passed token
    },
    body: JSON.stringify({
      user_message: userMessage,
      code: code || null,
      language,
      images: images,
      session_id: sessionId,
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
export function useDebugger(wsReadyResolveRef?: React.MutableRefObject<(() => void) | null>) {
  const [appState, setAppState]       = useState<AppState>("idle")
  const [sessionId, setSessionId]     = useState("")
  const [code, setCode]               = useState("")
  const [description, setDescription] = useState("")
  const [language, setLanguage]       = useState("python")
  const [images, setImages]           = useState<string[]>([])
  const [result, setResult]           = useState<DebugResult | null>(null)
  const [sessions, setSessions]       = useState<Session[]>([])
  const [showAuth, setShowAuth]       = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)
  const [showSessionsView, setShowSessionsView] = useState(false)

  const [user, setUser] = useState<User | null>(null)

useEffect(() => {
  const stored = localStorage.getItem("debugger_user")
  if (stored) setUser(JSON.parse(stored))
}, [])

  

  // Called by ChatInput when user clicks "run debugger"
  const handleStart = async (
    sid:  string,
    c:    string,
    desc: string,
    lang: string = "python",
    imgs: string[] = [],
  ) => {
    

    setSessionId(sid)
    setCode(c)
    setDescription(desc)
    setLanguage(lang)
    setImages(imgs)
    setResult(null)
    setError(null)
    setAppState("running")

    // Wait for WebSocket to connect before calling API
    // This prevents the race condition where router events are missed
    if (wsReadyResolveRef) {
      await new Promise<void>((resolve) => {
        wsReadyResolveRef.current = resolve
        // Fallback timeout — don't block forever if WebSocket fails
        setTimeout(resolve, 2000)
      })
    }

    try {
      const token = user?.token || getToken() || undefined
      console.log("[handleStart] token being sent:", token?.slice(0, 30) || "NONE")
      const data = await apiDebug(desc, c, lang, imgs, sid, token)
      handleResult(data, sid, desc)
    } catch (err: any) {
      console.error("[useDebugger] error:", err)
      setError(err.message || "Something went wrong")
      setAppState("idle")
    }
  }

  // usedebugger.ts — deduplicate when setting sessions
const handleResult = (data: DebugResult, overrideSid?: string, overrideDesc?: string) => {
  if (!data.images) data.images = images
  if (!data.user_message) data.user_message = overrideDesc || description
  if (!data.code) data.code = code
  if (!data.language) data.language = language
  if (!data.request) data.request = { code: data.code || code, user_message: data.user_message || description }
  setResult(data)
  setAppState("done")

  const sidToUse = overrideSid || data.session_id || sessionId
  if (!sidToUse) return

  const rawCause = data.root_cause || ""
  const cleaned = rawCause
    .replace("ROOT_CAUSE:", "")
    .replace(/CONFIDENCE:[\s\S]*$/, "")
    .replace(/NEEDS_MORE_INFO:[\s\S]*$/, "")
    .replace(/FIX_APPROACH:[\s\S]*$/, "")
    .trim()
  const words = cleaned.split(/\s+/).slice(0, 4).join(" ")
  const title = words || overrideDesc || description || "Debug session"

  const newSession = {
    id: sidToUse,
    title,
    timestamp: new Date().toLocaleTimeString(),
    confidence: data.confidence,
  }

  // Always add to local sidebar immediately
  setSessions(prev => {
    const filtered = prev.filter(s => s.id !== newSession.id)
    return [newSession, ...filtered.slice(0, 49)]
  })

  if (!user) {
    setTimeout(() => {
      setShowLoginPrompt(true)
    }, 1000)
  }
}
  
  const handleSelectSession = async (id: string) => {
  if (!id) return
  try {
    const res = await authFetch(`${API_BASE}/sessions/${id}`)
    if (!res.ok) {
      console.error("[handleSelectSession] failed:", res.status)
      return
    }
    const data = await res.json()
    setSessionId(id)
    setCode(data.request?.code || "")
    setDescription(data.request?.user_message || "")
    setLanguage(data.language || "python")
    setImages(data.images || [])
    setResult({
      root_cause:   data.root_cause,
      patch:        data.patch,
      explanation:  data.explanation,
      tests:        data.tests,
      confidence:   data.confidence,
      images:       data.images || [],
      user_message: data.request?.user_message || data.user_message || "",
      code:         data.request?.code || data.code || "",
      language:     data.language || "python",
      request:      data.request || { code: data.code, user_message: data.user_message },
    })
    setAppState("done")
  } catch (e) {
    console.error("[handleSelectSession] error:", e)
  }
}
  

  const handleNewSession = async () => {

  if (user && result && sessionId) {
    try {
      await authFetch(`${API_BASE}/sessions/save`, {
        method: "POST",
        body: JSON.stringify({
          session_id:   sessionId,
          root_cause:   result.root_cause  || "",
          patch:        result.patch        || "",
          explanation:  result.explanation  || "",
          tests:        result.tests        || [],
          confidence:   result.confidence   || 0.0,
          code:         code                || "",
          language:     language            || "python",
          user_message: description         || "",
          images:       images              || [],
        }),
      })
      console.log("[handleNewSession] session saved before clearing")
    } catch (err) {
      console.error("[handleNewSession] save failed:", err)
    }
  }

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
    console.log("[sessions] fetching for user:", user.email)
    apiGetSessions()
      .then(incoming => {
        console.log("[sessions] received:", incoming)
        // Merge with existing local sessions instead of replacing
        setSessions(prev => {
          const incomingIds = new Set(incoming.map(s => s.id))
          // Keep local sessions not yet on server + all server sessions
          const localOnly = prev.filter(s => !incomingIds.has(s.id))
          return [...localOnly, ...incoming].slice(0, 50)
        })
      })
      .catch(e => console.error("[sessions] error:", e))
  }
}, [user?.token])
  
  
  return {
    appState, sessionId, code, description, language, images,
    result, sessions, showAuth, user, error, showLoginPrompt, showSessionsView,
    setShowAuth,
    handleStart, handleResult, handleNewSession,
    handleLogin, handleLogout, setShowLoginPrompt,handleSelectSession, setShowSessionsView
  }
}