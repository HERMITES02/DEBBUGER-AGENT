"use client"

import { useState } from "react"
import ChatInput from "@/components/ChatInput"
import AgentLog from "@/components/AgentLog"
import DiffViewer from "@/components/DiffViewer"

interface DebugResult {
  diff: string
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
      onStart={(newSessionId) => {
    setSessionId(newSessionId)
    setIsRunning(true)
    setResult(null)
  }}
  onResult={(data) => {
    console.log("[page] result received:", data)
    if (data?.patch) {
      setResult({
        diff: data.patch,
        explanation: data.explanation || "",
        confidence: data.confidence || 0.6
      })
      setIsRunning(false)
    }
  }}
      />

      <AgentLog
        sessionId={sessionId}
        isRunning={isRunning}
      />

      {result && (
        <DiffViewer
          diff={result.diff}
          explanation={result.explanation}
          confidence={result.confidence}
        />
      )}
    </div>
  )
}