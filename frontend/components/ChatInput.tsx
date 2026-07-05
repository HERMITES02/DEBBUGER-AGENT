"use client"

import { useState, useEffect } from "react"
import DiffViewer from "./DiffViewer"

const TAGLINES = [
  "paste code. drop screenshot. get the fix.",
  "multimodal debugging powered by AI agents.",
  "vision + static analysis + context = answers.",
  "your code breaks. we find out why.",
]

interface ChatInputProps {
  appState: "idle" | "running" | "done"
  code: string
  description: string
  result: any
  onStart: (sessionId: string, code: string, description: string, language: string, images: string[]) => void
  onResult: (result: any) => void
  onNewSession: () => void
}

export default function ChatInput({ appState, code: parentCode, description: parentDesc, result, onStart, onResult, onNewSession }: ChatInputProps) {
  const [code, setCode] = useState("")
  const [description, setDescription] = useState("")
  const [language, setLanguage] = useState("python")
  const [images, setImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [taglineIndex, setTaglineIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => { setTaglineIndex(p => (p + 1) % TAGLINES.length); setVisible(true) }, 400)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (appState === "idle") {
      setCode("")
      setDescription("")
      setImages([])
    }
  }, [appState])

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => setImages(prev => [...prev, reader.result as string])
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith("image/")) handleImageUpload(file)
  }

  const handleSubmit = async () => {
    if (!code && images.length === 0) {
      alert("Please provide code or an image")
      return
    }

    const sessionId = crypto.randomUUID()
    setLoading(true)

    onStart(sessionId, code, description, language, images)
  }

  const fileExt: Record<string, string> = {
    python: "py", javascript: "js", typescript: "ts", java: "java", cpp: "cpp", rust: "rs"
  }

  return (
    <div className="chat-container" style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem 1.5rem",
      overflow: "auto",
      backgroundColor: "#1e1e1e",
      position: "relative"
    }}>

      {/* HERO — shown in idle AND running */}
      {(appState === "idle" || appState === "running") && (
        <div className="chat-hero" style={{
          textAlign: "center",
          marginBottom: "2rem",
          width: "100%", maxWidth: "760px",
          flexShrink: 0
        }}>
          <div className="chat-hero-icon" style={{
            width: "56px", height: "56px", borderRadius: "14px",
            backgroundColor: "#252526", border: "1px solid #3e3e42",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "26px", margin: "0 auto 0.75rem"
          }}>🐛</div>
          <h1 style={{ fontSize: "32px", fontWeight: "500", margin: "0 0 0.5rem", letterSpacing: "-0.02em" }}>
            <span style={{ color: "#569cd6" }}>debugger</span>
            <span style={{ color: "#3e3e42" }}>.</span>
            <span style={{ color: "#dcdcaa" }}>agent</span>
            <span style={{ color: "#6a6a6a", fontSize: "22px" }}>()</span>
          </h1>
          {appState === "idle" && (
            <div className="chat-pill-tags" style={{
              display: "flex", gap: "8px",
              flexWrap: "wrap",
              justifyContent: "center",
              marginTop: "0.75rem"
            }}>
              {[
                { label: "multimodal", color: "#c586c0" },
                { label: "multi-agent", color: "#569cd6" },
                { label: "vision AI", color: "#4ec9b0" },
                { label: "sandboxed", color: "#e5c07b" },
                { label: "vector memory", color: "#98c379" },
              ].map(({ label, color }) => (
                <span key={label} style={{
                  backgroundColor: "#252526", border: "1px solid #3e3e42",
                  borderRadius: "20px", padding: "3px 12px",
                  fontSize: "11px", color, letterSpacing: "0.04em"
                }}>{label}</span>
              ))}
            </div>
          )}
          {appState === "running" && (
            <p style={{ color: "#6a9955", fontSize: "12px", margin: "0.5rem 0 0" }}>
              agents analyzing your code...
            </p>
          )}
        </div>
      )}

      {/* MAIN BOX — anchored at bottom, expands upward */}
      <div className="chat-main-box" style={{
        width: "100%", maxWidth: "760px",
        display: "flex", flexDirection: "column",
        maxHeight: "calc(100vh - 140px)",
        overflow: "visible"
      }}>

        {/* RESULTS / CODE — scrollable area above input */}
        {(appState === "running" || appState === "done") && (
          <div className="results-panel" style={{
            backgroundColor: "#1c1c1c",
            border: "1px solid #2a2a2a",
            borderBottom: "none",
            borderRadius: "14px 14px 0 0",
            padding: "1.25rem 1.5rem",
            display: "flex", flexDirection: "column", gap: "12px",
            height: appState === "running" ? "45vh" : "auto",
            maxHeight: "90vh",
            overflowY: "scroll",
            transition: "height 0.8s ease, max-height 0.6s ease",
            scrollbarWidth: "thin" as const,
            scrollbarColor: "#007acc transparent" as any
          }}>

            {/* Running — code display */}
            {appState === "running" && (
              <div style={{
                backgroundColor: "#252526", border: "1px solid #3e3e42",
                borderRadius: "8px", overflow: "hidden"
              }}>
                <div style={{
                  backgroundColor: "#2d2d2d", borderBottom: "1px solid #2a2a2a",
                  padding: "6px 14px", fontSize: "12px", color: "#d4d4d4",
                  display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                  <span style={{ borderBottom: "1px solid #007acc", paddingBottom: "1px" }}>
                    bug.{fileExt[language] || "py"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#007acc", fontSize: "11px" }}>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                    processing...
                  </div>
                </div>
                <div style={{ display: "flex" }}>
                  <div style={{
                    color: "#5a5a5a", fontSize: "12px", padding: "10px 8px",
                    minWidth: "36px", textAlign: "right", userSelect: "none",
                    lineHeight: "1.6", borderRight: "1px solid #2a2a2a",
                    flexShrink: 0
                  }}>
                    {code.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
                  </div>
                  <pre style={{
                    flex: 1, margin: 0, padding: "10px 14px",
                    fontSize: "13px", color: "#d4d4d4",
                    lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word"
                  }}>{code}</pre>
                </div>
              </div>
            )}

            {/* Done — results */}
            {appState === "done" && result && (
              <>
                {result.root_cause && (
                  <div className="result-card" style={{
                    backgroundColor: "#252526", border: "1px solid #3e3e42",
                    borderRadius: "8px", padding: "14px 18px"
                  }}>
                    <div style={{ color: "#f14c4c", fontSize: "10px", letterSpacing: "0.1em", marginBottom: "8px", fontWeight: "600" }}>
                      ROOT CAUSE
                    </div>
                    <div style={{ color: "#d4d4d4", fontSize: "13px", lineHeight: "1.7" }}>
                      {result.root_cause.split("\n")[0].replace("ROOT_CAUSE: ", "")}
                    </div>
                  </div>
                )}

                {result.explanation && (
                  <div className="result-card" style={{
                    backgroundColor: "#252526", border: "1px solid #3e3e42",
                    borderRadius: "8px", padding: "14px 18px"
                  }}>
                    <div style={{ color: "#569cd6", fontSize: "10px", letterSpacing: "0.1em", marginBottom: "8px", fontWeight: "600" }}>
                      EXPLANATION
                    </div>
                    <div style={{ color: "#d4d4d4", fontSize: "13px", lineHeight: "1.7" }}>
                      {result.explanation}
                    </div>
                  </div>
                )}

                {/* DiffViewer */}
                {result.patch && (
                  <DiffViewer diff={result.patch} explanation={undefined} confidence={result.confidence} />
                )}

                {result.tests && result.tests.length > 0 && (
                  <div style={{
                    backgroundColor: "#252526", border: "1px solid #3e3e42",
                    borderLeft: "3px solid #98c379", borderRadius: "8px", overflow: "hidden"
                  }}>
                    <div style={{
                      backgroundColor: "#2d2d2d", padding: "7px 16px",
                      borderBottom: "1px solid #3e3e42",
                      display: "flex", justifyContent: "space-between", alignItems: "center"
                    }}>
                      <span style={{ color: "#98c379", fontSize: "12px" }}>generated tests</span>
                      <span style={{ color: "#5a5a5a", fontSize: "11px" }}>test_fix.py</span>
                    </div>
                    <pre style={{
                      margin: 0, padding: "14px 18px", color: "#d4d4d4",
                      fontSize: "12px", lineHeight: "1.7", whiteSpace: "pre-wrap"
                    }}>{result.tests[0]}</pre>
                  </div>
                )}

                {result.confidence !== undefined && (
                  <div style={{
                    backgroundColor: "#252526", border: "1px solid #3e3e42",
                    borderRadius: "8px", padding: "12px 18px",
                    display: "flex", alignItems: "center", gap: "16px"
                  }}>
                    <span style={{ color: "#5a5a5a", fontSize: "12px", minWidth: "80px" }}>confidence</span>
                    <div style={{ flex: 1, height: "5px", backgroundColor: "#3e3e42", borderRadius: "3px", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${(result.confidence || 0) * 100}%`,
                        backgroundColor: (result.confidence || 0) >= 0.8 ? "#98c379" : "#e5c07b",
                        borderRadius: "3px", transition: "width 0.8s ease"
                      }} />
                    </div>
                    <span style={{
                      fontSize: "12px", minWidth: "35px",
                      color: (result.confidence || 0) >= 0.8 ? "#98c379" : "#e5c07b"
                    }}>
                      {Math.round((result.confidence || 0) * 100)}%
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* INPUT PILL — always at bottom */}
        <div style={{
          backgroundColor: "#252526",
          border: "1px solid #3e3e42",
          borderRadius: appState === "idle" ? "16px" : "0 0 16px 16px",
          overflow: "hidden", flexShrink: 0,
          boxShadow: "0 0 40px rgba(0,122,204,0.06)"
        }}>

          {/* Tab + code — only idle */}
          {appState === "idle" && (
            <>
              <div style={{
                backgroundColor: "#2d2d2d", borderBottom: "1px solid #3e3e42",
                display: "flex", alignItems: "center", padding: "0 12px"
              }}>
                <div style={{
                  padding: "7px 16px", fontSize: "12px", color: "#d4d4d4",
                  borderBottom: "1px solid #007acc", backgroundColor: "#252526"
                }}>
                  bug.{fileExt[language] || "py"}
                </div>
                <div style={{ flex: 1 }} />
                <div style={{
                  width: "100px", height: "8px",
                  background: "radial-gradient(ellipse, rgba(152,195,121,0.25) 0%, transparent 70%)"
                }} />
              </div>
              <div className="chat-code-area" style={{
                display: "flex",
                backgroundColor: "#1e1e1e",
                maxHeight: "260px",
                overflowY: "auto"
              }}>
                <div style={{
                  color: "#5a5a5a", fontSize: "12px", padding: "12px 8px",
                  minWidth: "40px", textAlign: "right", userSelect: "none",
                  lineHeight: "1.6", borderRight: "1px solid #2a2a2a"
                }}>
                  {Array.from({ length: Math.max(8, code.split("\n").length + 2) }, (_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  placeholder={"# paste your code here\n# the agent will analyze it for bugs"}
                  style={{
                    flex: 1, backgroundColor: "transparent", border: "none",
                    color: "#d4d4d4", fontSize: "13px", fontFamily: "inherit",
                    lineHeight: "1.6", padding: "12px", minHeight: "180px",
                    resize: "none", outline: "none", caretColor: "#aeafad",
                    overflow: "hidden"
                  }}
                />
              </div>
            </>
          )}

          {/* Bottom bar */}
          <div className="chat-input-bar" style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "10px 12px", borderTop: "1px solid #2a2a2a",
            backgroundColor: "#252526"
          }}>

            {/* Camera / image attachment area */}
            <div style={{ position: "relative" }}>
              <div
                onDrop={e => {
                  e.preventDefault()
                  setDragOver(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f?.type.startsWith("image/")) handleImageUpload(f)
                }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => document.getElementById("imgInput")?.click()}
                style={{
                  width: "34px", height: "34px", borderRadius: "8px",
                  background: dragOver
                    ? "rgba(197,134,192,0.3)"
                    : images.length > 0
                      ? "rgba(197,134,192,0.2)"
                      : "radial-gradient(ellipse, rgba(197,134,192,0.15) 0%, transparent 70%)",
                  border: `1px solid ${images.length > 0 ? "#c586c0" : dragOver ? "#c586c0" : "#3e3e42"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", flexShrink: 0, transition: "all 0.15s",
                  position: "relative", overflow: "hidden"
                }}
              >
                <input
                  id="imgInput"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleImageUpload(f)
                    e.target.value = ""
                  }}
                />

                {images.length > 0 ? (
                  <img
                    src={images[0]}
                    alt="attached"
                    style={{
                      width: "100%", height: "100%",
                      objectFit: "cover", borderRadius: "7px"
                    }}
                  />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="#c586c0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                )}
              </div>

              {images.length > 0 && (
                <div
                  onClick={e => { e.stopPropagation(); setImages([]) }}
                  style={{
                    position: "absolute", top: "-6px", right: "-6px",
                    width: "14px", height: "14px", borderRadius: "50%",
                    backgroundColor: "#f14c4c", border: "1px solid #1e1e1e",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", fontSize: "9px", color: "#fff", fontWeight: "bold",
                    zIndex: 10
                  }}
                >
                  ×
                </div>
              )}
            </div>

            {/* Description — blue blur */}
            <div className="chat-description-input" style={{
              flex: 1,
              background: "radial-gradient(ellipse at left, rgba(86,156,214,0.08) 0%, transparent 60%)",
              border: "1px solid #3e3e42", borderRadius: "8px",
              display: "flex", alignItems: "center", padding: "0 10px", height: "34px"
            }}>
              <span style={{ color: "#6a9955", fontSize: "12px", marginRight: "6px" }}>#</span>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="describe the bug..."
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && appState === "idle") handleSubmit() }}
                style={{
                  flex: 1, backgroundColor: "transparent", border: "none",
                  color: "#d4d4d4", fontSize: "12px", fontFamily: "inherit", outline: "none",
                  minWidth: 0
                }}
              />
            </div>

            {/* Language */}
            <select className="lang-select" value={language} onChange={e => setLanguage(e.target.value)} style={{
              backgroundColor: "#1e1e1e", border: "1px solid #3e3e42",
              borderRadius: "6px", color: "#ce9178", padding: "6px 8px",
              fontSize: "11px", fontFamily: "inherit", cursor: "pointer", outline: "none"
            }}>
              {Object.keys(fileExt).map(lang => <option key={lang} value={lang}>{lang}</option>)}
            </select>

            {/* Running — code display + image if attached */}
            {appState === "running" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {images.length > 0 && (
                  <div style={{
                    backgroundColor: "#252526", border: "1px solid #3e3e42",
                    borderRadius: "8px", padding: "10px 14px"
                  }}>
                    <div style={{
                      color: "#c586c0", fontSize: "10px", letterSpacing: "0.1em",
                      marginBottom: "8px", fontWeight: "600"
                    }}>
                      SCREENSHOT ({images.length})
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {images.map((img, i) => (
                        <img
                          key={i}
                          src={img}
                          alt={`screenshot ${i + 1}`}
                          style={{
                            maxWidth: "200px", maxHeight: "120px",
                            borderRadius: "4px", border: "1px solid #3e3e42",
                            objectFit: "contain"
                          }}
                        />
                      ))}
                    </div>
                    <div style={{
                      color: "#6a9955", fontSize: "11px", marginTop: "6px",
                      display: "flex", alignItems: "center", gap: "6px"
                    }}>
                      <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span>
                      vision agent extracting error from screenshot...
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Done — results */}
            {appState === "done" && result && (
              <>
                {images.length > 0 && (
                  <div style={{
                    backgroundColor: "#252526", border: "1px solid #3e3e42",
                    borderLeft: "3px solid #c586c0",
                    borderRadius: "8px", padding: "12px 16px",
                    display: "flex", gap: "12px", alignItems: "flex-start",
                    flexWrap: "wrap"
                  }}>
                    <img
                      src={images[0]}
                      alt="analysed screenshot"
                      style={{
                        width: "80px", height: "60px",
                        objectFit: "contain", borderRadius: "4px",
                        border: "1px solid #3e3e42", flexShrink: 0
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{
                        color: "#c586c0", fontSize: "10px",
                        letterSpacing: "0.1em", marginBottom: "4px", fontWeight: "600"
                      }}>
                        VISION ANALYSIS
                      </div>
                      <div style={{ color: "#d4d4d4", fontSize: "12px", lineHeight: "1.5" }}>
                        Screenshot analysed by vision agent ✓
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Debug / new */}
            {appState === "done" ? (
              <button onClick={onNewSession} style={{
                backgroundColor: "transparent", border: "1px solid #3e3e42",
                borderRadius: "8px", color: "#6a9955", cursor: "pointer",
                fontSize: "11px", fontFamily: "inherit", padding: "7px 12px", flexShrink: 0
              }}>+ new</button>
            ) : (
              <button
                onClick={appState === "idle" ? handleSubmit : undefined}
                disabled={appState === "running"}
                style={{
                  backgroundColor: appState === "running" ? "#252526" : "#007acc",
                  border: `1px solid ${appState === "running" ? "#3e3e42" : "#007acc"}`,
                  borderRadius: "8px", color: appState === "running" ? "#5a5a5a" : "#fff",
                  cursor: appState === "running" ? "not-allowed" : "pointer",
                  fontSize: "12px", fontFamily: "inherit", fontWeight: "600",
                  padding: "7px 14px", display: "flex", alignItems: "center",
                  gap: "6px", flexShrink: 0, transition: "all 0.15s"
                }}
              >
                <span>{appState === "running" ? "⟳" : "🐛"}</span>
                <span>{appState === "running" ? "running..." : "Debug"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}