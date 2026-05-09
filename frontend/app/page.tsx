"use client"

import { useState } from "react"
import ChatInput from "@/components/ChatInput"
import AgentLog from "@/components/AgentLog"
import DiffViewer from "@/components/DiffViewer"

interface DebugResult {
  originalCode: string
  fixedCode: string
  explanation: string
  confidence: number
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>("")
  const [isRunning, setIsRunning] = useState<boolean>(false)
  const [result, setResult] = useState<DebugResult | null>(null)

  return (
    <div>
      <ChatInput
        onSubmit={(newSessionId) => {
          setSessionId(newSessionId)
          setIsRunning(true)
          setResult(null)
        }}
      />

      <AgentLog
        sessionId={sessionId}
        isRunning={isRunning}
      />

      {result && (
        <DiffViewer
          originalCode={result.originalCode}
          fixedCode={result.fixedCode}
          explanation={result.explanation}
          confidence={result.confidence}
        />
      )}
    </div>
  )
}