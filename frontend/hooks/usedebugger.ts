import { useState } from "react"

export type AppState = "idle" | "running" | "done"
export interface Session { id: string; title: string; timestamp: string }
export interface User { name: string; email: string }
export interface DebugResult {
  root_cause?: string; patch?: string; explanation?: string
  tests?: string[]; confidence?: number
}

export const MOCK_MODE = true

export const MOCK_RESULT: DebugResult = {
  root_cause: "ROOT_CAUSE: ZeroDivisionError in get_average_transaction() when transactions list is empty.\n\nCONFIDENCE: 1.0",
  patch: "--- original\n+++ fixed\n@@ -13,6 +13,8 @@\n     def get_average_transaction(self):\n+        if len(self.transactions) == 0:\n+            return 0\n         total = sum(self.transactions)\n         return total / len(self.transactions)",
  explanation: "The bug occurs because get_average_transaction() divides by len(self.transactions) when the list is empty. Fixed by adding an empty check that returns 0.",
  tests: ["def test_empty_account():\n    acc = BankAccount('Test', 0)\n    assert acc.get_average_transaction() == 0"],
  confidence: 0.9,
}

export const MOCK_AGENTS = [
  { agent_id: "router",                type: "thinking", payload: "Analyzing input modalities...",           timestamp: 300  },
  { agent_id: "code_analysis_agent",   type: "thinking", payload: "Parsing AST with tree-sitter...",        timestamp: 900  },
  { agent_id: "code_analysis_agent",   type: "result",   payload: "ZeroDivisionError detected",            timestamp: 2200 },
  { agent_id: "context_builder_agent", type: "thinking", payload: "Assembling debug brief...",              timestamp: 2500 },
  { agent_id: "context_builder_agent", type: "result",   payload: "Context assembled with 95% confidence", timestamp: 3800 },
  { agent_id: "orchestrator",          type: "thinking", payload: "Routing to action agents...",            timestamp: 4100 },
  { agent_id: "analyse",               type: "thinking", payload: "Searching Stack Overflow...",            timestamp: 4500 },
  { agent_id: "analyse",               type: "result",   payload: "Found 3 relevant solutions",            timestamp: 6000 },
  { agent_id: "patch_agent",           type: "thinking", payload: "Generating code fix...",                 timestamp: 6300 },
  { agent_id: "patch_agent",           type: "result",   payload: "Patch generated successfully",          timestamp: 8000 },
  { agent_id: "test_agent",            type: "thinking", payload: "Running tests in E2B sandbox...",        timestamp: 8300 },
  { agent_id: "test_agent",            type: "result",   payload: "All tests passed ✓",                    timestamp: 9500 },
]

export function useDebugger() {
  const [appState, setAppState]       = useState<AppState>("idle")
  const [sessionId, setSessionId]     = useState("")
  const [code, setCode]               = useState("")
  const [description, setDescription] = useState("")
  const [result, setResult]           = useState<DebugResult | null>(null)
  const [sessions, setSessions]       = useState<Session[]>([])
  const [showAuth, setShowAuth]       = useState(false)
  const [user, setUser]               = useState<User | null>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("debugger_user")
      return stored ? JSON.parse(stored) : null
    }
    return null
  })

  const handleStart = (sid: string, c: string, desc: string) => {
    setSessionId(sid); setCode(c); setDescription(desc)
    setResult(null); setAppState("running")
  }

  const handleResult = (data: DebugResult) => {
    setResult(data); setAppState("done")
    if (user) {
      setSessions(prev => [{
        id: sessionId,
        title: description || code.split("\n")[0].slice(0, 40) || "Debug session",
        timestamp: new Date().toLocaleTimeString()
      }, ...prev])
    }
  }

  const handleNewSession = () => {
    setAppState("idle"); setResult(null); setCode(""); setDescription("")
  }

  const handleLogin = (u: User) => {
    setUser(u); localStorage.setItem("debugger_user", JSON.stringify(u))
  }

  const handleLogout = () => {
    setUser(null); localStorage.removeItem("debugger_user")
    setSessions([]); handleNewSession()
  }

  return {
    appState, sessionId, code, description,
    result, sessions, showAuth, user,
    setShowAuth,
    handleStart, handleResult, handleNewSession,
    handleLogin, handleLogout,
  }
}