"use client"

import { useState, useEffect } from "react"

const TAGLINES = [
  "paste code. drop screenshot. get the fix.",
  "multimodal debugging powered by AI agents.",
  "vision + static analysis + context = answers.",
  "your code breaks. we find out why.",
]

interface ChatInputProps {
  onSubmit: (sessionId: string) => void
}

export default function ChatInput({ onSubmit }: ChatInputProps) {
  const [code, setCode] = useState<string>("")
  const [description, setDescription] = useState<string>("")
  const [language, setLanguage] = useState<string>("python")
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [dragOver, setDragOver] = useState<boolean>(false)
  const [taglineIndex, setTaglineIndex] = useState<number>(0)
  const [visible, setVisible] = useState<boolean>(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setTaglineIndex(prev => (prev + 1) % TAGLINES.length)
        setVisible(true)
      }, 400)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setImages(prev => [...prev, base64])
    }
    reader.readAsDataURL(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    handleImageUpload(file)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith("image/")) handleImageUpload(file)
  }

  const handleSubmit = async () => {
  const sessionId = crypto.randomUUID()
  setLoading(true)

  // Open WebSocket BEFORE posting (so we don't miss early events)
  onSubmit(sessionId)   // ← this starts AgentLog listening

  const response = await fetch("http://localhost:8000/debug", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_message: description,
      code, language,
      images: images.map(img => img.split(",")[1] || img),
      session_id: sessionId
    })
  })
  const result = await response.json()
  console.log("[ChatInput] result:", result)
  setLoading(false)
}
  const fileExt: Record<string, string> = {
    python: "py", javascript: "js", typescript: "ts",
    java: "java", cpp: "cpp", rust: "rs"
  }

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#1e1e1e",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      color: "#d4d4d4"
    }}>

      {/* TOP BAR */}
      <div style={{
        backgroundColor: "#007acc",
        padding: "4px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <span style={{ fontSize: "12px", color: "#ffffff", letterSpacing: "0.03em" }}>
          debugger-agent
        </span>
        <div style={{ display: "flex", gap: "16px" }}>
          {["perception", "agents", "redis", "sandbox"].map(item => (
            <span key={item} style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)" }}>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* HERO */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "5rem 1rem 3.5rem",
        textAlign: "center",
        borderBottom: "1px solid #3e3e42"
      }}>
        <div style={{
          width: "72px",
          height: "72px",
          borderRadius: "16px",
          backgroundColor: "#252526",
          border: "1px solid #3e3e42",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "1.5rem",
          fontSize: "34px"
        }}>
          🐛
        </div>

        <h1 style={{
          fontSize: "40px",
          fontWeight: "500",
          margin: "0",
          letterSpacing: "-0.02em",
          lineHeight: 1.1
        }}>
          <span style={{ color: "#569cd6" }}>debugger</span>
          <span style={{ color: "#3e3e42" }}>.</span>
          <span style={{ color: "#dcdcaa" }}>agent</span>
          <span style={{ color: "#6a6a6a", fontSize: "28px" }}>()</span>
        </h1>

        <p style={{
          fontSize: "14px",
          color: "#6a9955",
          margin: "1.25rem 0 0 0",
          height: "22px",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.4s ease",
          letterSpacing: "0.02em"
        }}>
           {TAGLINES[taglineIndex]}
        </p>

        <div style={{
          display: "flex",
          gap: "8px",
          marginTop: "2rem",
          flexWrap: "wrap",
          justifyContent: "center"
        }}>
          {[
            { label: "multimodal", color: "#c586c0" },
            { label: "multi-agent", color: "#569cd6" },
            { label: "vision AI", color: "#4ec9b0" },
            { label: "sandboxed execution", color: "#e5c07b" },
            { label: "vector memory", color: "#98c379" },
          ].map(({ label, color }) => (
            <span key={label} style={{
              backgroundColor: "#252526",
              border: "1px solid #3e3e42",
              borderRadius: "20px",
              padding: "4px 14px",
              fontSize: "11px",
              color,
              letterSpacing: "0.04em"
            }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* INPUT SECTION */}
      <div style={{
        maxWidth: "820px",
        margin: "0 auto",
        padding: "3rem 1.5rem 5rem"
      }}>

        {/* Window chrome */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "1.5rem"
        }}>
          {["#f14c4c", "#e5c07b", "#98c379"].map(color => (
            <div key={color} style={{
              width: "12px", height: "12px",
              borderRadius: "50%",
              backgroundColor: color
            }} />
          ))}
          <span style={{ marginLeft: "8px", color: "#5a5a5a", fontSize: "12px" }}>
            debug_session.{fileExt[language] || "py"}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

          {/* Language */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#c586c0", fontSize: "13px" }}>language</span>
            <span style={{ color: "#d4d4d4", fontSize: "13px" }}>=</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={{
                backgroundColor: "#252526",
                border: "1px solid #3e3e42",
                borderRadius: "4px",
                color: "#ce9178",
                padding: "5px 10px",
                fontSize: "13px",
                fontFamily: "inherit",
                cursor: "pointer",
                outline: "none"
              }}
            >
              {Object.keys(fileExt).map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>

          {/* Code editor */}
          <div style={{ border: "1px solid #3e3e42", borderRadius: "6px", overflow: "hidden" }}>
            <div style={{
              backgroundColor: "#252526",
              borderBottom: "1px solid #3e3e42",
              display: "flex"
            }}>
              <div style={{
                padding: "7px 16px",
                fontSize: "13px",
                color: "#d4d4d4",
                borderBottom: "1px solid #007acc",
                backgroundColor: "#1e1e1e"
              }}>
                bug.{fileExt[language] || "py"}
              </div>
            </div>
            <div style={{ display: "flex", backgroundColor: "#1e1e1e" }}>
              <div style={{
                color: "#5a5a5a",
                fontSize: "13px",
                padding: "12px 10px",
                minWidth: "44px",
                textAlign: "right",
                userSelect: "none",
                lineHeight: "1.6",
                borderRight: "1px solid #3e3e42"
              }}>
                {Array.from(
                  { length: Math.max(12, code.split("\n").length + 3) },
                  (_, i) => <div key={i}>{i + 1}</div>
                )}
              </div>
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={`# paste your ${language} code here\n# the agent will analyze it for bugs`}
                style={{
                  flex: 1,
                  backgroundColor: "#1e1e1e",
                  border: "none",
                  color: "#d4d4d4",
                  fontSize: "13px",
                  fontFamily: "inherit",
                  lineHeight: "1.6",
                  padding: "12px",
                  minHeight: "220px",
                  resize: "vertical",
                  outline: "none",
                  caretColor: "#aeafad"
                }}
              />
            </div>
          </div>

          {/* Description */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            backgroundColor: "#252526",
            border: "1px solid #3e3e42",
            borderRadius: "6px",
            padding: "10px 14px"
          }}>
            <span style={{ color: "#6a9955", fontSize: "13px", userSelect: "none" }}>#</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="what's the bug? what did you expect to happen?"
              style={{
                flex: 1,
                backgroundColor: "transparent",
                border: "none",
                color: "#d4d4d4",
                fontSize: "13px",
                fontFamily: "inherit",
                outline: "none"
              }}
            />
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => document.getElementById("fileInput")?.click()}
            style={{
              border: `1px dashed ${dragOver ? "#007acc" : "#3e3e42"}`,
              borderRadius: "6px",
              padding: "24px",
              textAlign: "center",
              backgroundColor: dragOver ? "#04395e" : "#252526",
              transition: "all 0.15s ease",
              cursor: "pointer"
            }}
          >
            <input
              id="fileInput"
              type="file"
              accept="image/*"
              onChange={handleFileInput}
              style={{ display: "none" }}
            />
            {images.length > 0 ? (
              <div style={{ color: "#98c379", fontSize: "13px" }}>
                ✓ {images.length} screenshot{images.length > 1 ? "s" : ""} attached
                <span
                  onClick={(e) => { e.stopPropagation(); setImages([]) }}
                  style={{ marginLeft: "12px", color: "#f14c4c", cursor: "pointer", fontSize: "12px" }}
                >
                  [clear]
                </span>
              </div>
            ) : (
              <div>
                <div style={{ color: "#5a5a5a", fontSize: "13px", marginBottom: "4px" }}>
                  drop error screenshot here
                </div>
                <div style={{ color: "#3e3e42", fontSize: "11px" }}>
                  or <span style={{ color: "#007acc" }}>click to browse</span> — png, jpg, gif
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              backgroundColor: loading ? "#252526" : "#007acc",
              border: `1px solid ${loading ? "#3e3e42" : "#007acc"}`,
              borderRadius: "6px",
              color: loading ? "#5a5a5a" : "#ffffff",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontFamily: "inherit",
              fontWeight: "500",
              padding: "14px 24px",
              width: "100%",
              letterSpacing: "0.06em",
              transition: "all 0.15s ease"
            }}
          >
            {loading ? "► running agents..." : "► run debugger"}
          </button>

        </div>
      </div>
    </div>
  )
}