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
        onSubmit={(newSessionId) => {
          setSessionId(newSessionId)
          setIsRunning(true)
          setResult(null)
        }}
      />

      <AgentLog
        sessionId={sessionId}
        isRunning={isRunning}
        onPatchReady={(patchData) => {
          setResult({
            diff: patchData.diff as string,
            explanation: patchData.explanation as string,
            confidence: patchData.confidence as number 
          })
        }}
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