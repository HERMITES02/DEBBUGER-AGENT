"use client"

import Sidebar from "@/components/SideBar"
import AuthModal from "@/components/AuthModal"
import ChatInput from "@/components/ChatInput"
import AgentFlowChart from "@/components/AgentFlowChart"
import { useDebugger } from "@/hooks/usedebugger"   // ← only import useDebugger
import { apiLogin, apiRegister } from "@/hooks/usedebugger"  // ← import API functions for AuthModal

export default function Home() {
  const {
    appState, sessionId, code, description,
    result, sessions, showAuth, user, error,
    setShowAuth,
    handleStart, handleResult, handleNewSession,
    handleLogin, handleLogout,
  } = useDebugger()

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
        onNewSession={handleNewSession}
        onSelectSession={() => {}}
        currentSessionId={sessionId}
        user={user}
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

      <ChatInput
        appState={appState}
        code={code}
        description={description}
        result={result}
        onStart={handleStart}
        onResult={handleResult}
        onNewSession={handleNewSession}
      />

      {showFlowchart && (
        <div style={{
          width: "300px",
          borderLeft: "1px solid #2a2a2a",
          backgroundColor: "#1a1a1a",
          overflowY: "auto",
          padding: "2rem 2rem 1rem 2rem"
        }}>
          <AgentFlowChart
            sessionId={sessionId}
            isRunning={appState === "running"}
          />
        </div>
      )}

      {showAuth && (
        <AuthModal
  onClose={() => setShowAuth(false)}
  onLogin={handleLogin}
  onApiLogin={apiLogin}          // import from usedebugger
  onApiRegister={apiRegister}    // import from usedebugger
/>
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