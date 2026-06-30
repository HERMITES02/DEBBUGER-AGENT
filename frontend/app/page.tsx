"use client"

import { useRef } from "react"
import Sidebar from "@/components/SideBar"
import AuthModal from "@/components/AuthModal"
import ChatInput from "@/components/ChatInput"
import AgentFlowChart from "@/components/AgentFlowChart"
import SessionsView from "../components/SessionsView"
import { useDebugger } from "@/hooks/usedebugger"
import { apiLogin, apiRegister } from "@/hooks/usedebugger"

export default function Home() {
  const wsReadyResolveRef = useRef<(() => void) | null>(null)

  const {
    appState, sessionId, code, description,
    result, sessions, showAuth, user, error,showLoginPrompt, showSessionsView,
    setShowAuth,
    handleStart, handleResult, handleNewSession,
    handleLogin, handleLogout, setShowLoginPrompt,handleSelectSession,setShowSessionsView
  } = useDebugger(wsReadyResolveRef)

  const showFlowchart = appState === "running" || appState === "done"

  return (
    <div style={{
      display: "flex", height: "100vh", overflow: "hidden",
      backgroundColor: "#1e1e1e",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      color: "#d4d4d4"
    }}>

      <Sidebar
        sessions={sessions}
        onNewSession={() => { handleNewSession(); setShowSessionsView(false) }}
        onSelectSession={(id) => { handleSelectSession(id); setShowSessionsView(false) }}
        currentSessionId={sessionId}
        user={user}
        onOpenSessions={() => setShowSessionsView(true)}
        onLoginClick={() => setShowAuth(true)}
        onLogout={handleLogout}
      />

      {/* Show error banner if something went wrong */}
      {error && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          backgroundColor: "#5a1d1d", borderBottom: "1px solid #f14c4c",
          padding: "10px 20px", fontSize: "13px", color: "#f14c4c",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <span>⚠ {error}</span>
          <span
            onClick={handleNewSession}
            style={{ cursor: "pointer", color: "#f14c4c", fontSize: "16px" }}
          >×</span>
        </div>
      )}


      {showSessionsView ? (
        <SessionsView
          sessions={sessions}
          currentSessionId={sessionId}
          onSelectSession={(id: string) => { handleSelectSession(id); setShowSessionsView(false) }}
          onNewSession={() => { handleNewSession(); setShowSessionsView(false) }}
          onClose={() => setShowSessionsView(false)}
        />
      ) : (
          <>
            <ChatInput
        appState={appState}
        code={code}
        description={description}
        result={result}
        onStart={handleStart}
        onResult={handleResult}
        onNewSession={handleNewSession}
      />

      {/* Always mounted — hidden via CSS when not running so WebSocket connects before API call */}
      <div style={{
        width: showFlowchart ? "300px" : "0px",
        overflow: "hidden",
        borderLeft: showFlowchart ? "1px solid #2a2a2a" : "none",
        backgroundColor: "#1a1a1a",
        overflowY: "auto",
        padding: showFlowchart ? "2rem 2rem 1rem 2rem" : "0",
        transition: "width 0.3s ease",
        flexShrink: 0,
      }}>
        <AgentFlowChart
          sessionId={sessionId}
          isRunning={appState === "running"}
          onReady={() => {
            // Resolve the promise that handleStart is waiting on
            if (wsReadyResolveRef.current) {
              wsReadyResolveRef.current()
              wsReadyResolveRef.current = null
            }
          }}
        />
      </div>
            

          </>
          
      )}

      {showAuth && (
        <AuthModal
  onClose={() => setShowAuth(false)}
  onLogin={handleLogin}
  onApiLogin={apiLogin}          // import from usedebugger
  onApiRegister={apiRegister}    // import from usedebugger
/>
      )}

      {showLoginPrompt && (
  <div style={{
    position: "fixed", inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200
  }}>
    <div style={{
      backgroundColor: "#252526",
      border: "1px solid #3e3e42",
      borderRadius: "12px",
      padding: "2rem",
      maxWidth: "320px",
      textAlign: "center",
      fontFamily: "'JetBrains Mono', monospace"
    }}>
      <div style={{ fontSize: "24px", marginBottom: "1rem" }}>🐛</div>
      <div style={{ color: "#d4d4d4", fontSize: "13px", marginBottom: "0.5rem" }}>
         session not saved
      </div>
      <div style={{ color: "#5a5a5a", fontSize: "12px", marginBottom: "1.5rem", lineHeight: "1.6" }}>
        Sign in to save your debug sessions and access them later.
      </div>
      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
        <button
          onClick={() => { setShowLoginPrompt(false); setShowAuth(true) }}
          style={{
            backgroundColor: "#007acc", border: "none",
            borderRadius: "6px", color: "#fff",
            padding: "8px 16px", fontSize: "12px",
            fontFamily: "inherit", cursor: "pointer"
          }}
        >sign in</button>
        <button
          onClick={() => setShowLoginPrompt(false)}
          style={{
            backgroundColor: "transparent", border: "1px solid #3e3e42",
            borderRadius: "6px", color: "#5a5a5a",
            padding: "8px 16px", fontSize: "12px",
            fontFamily: "inherit", cursor: "pointer"
          }}
        >ok</button>
      </div>
    </div>
  </div>
)}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #007acc; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #1a9fff; }
        ::-webkit-scrollbar-corner { background: transparent; }
      `}</style>
    </div>
  )
}