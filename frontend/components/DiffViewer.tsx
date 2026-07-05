"use client"

interface DiffViewerProps {
  diff: string
  explanation?: string
  confidence?: number
}

export default function DiffViewer({
  diff,
  explanation,
  confidence
}: DiffViewerProps) {

  if (!diff) return null

  // parse raw unified diff into lines
  const lines = diff.split("\n")

  // extract fixed code from diff (lines starting with + excluding +++)
  const fixedCode = lines
    .filter(l => l.startsWith("+") && !l.startsWith("+++"))
    .map(l => l.slice(1))
    .join("\n")

  return (
    <div style={{
      width: "100%",
      padding: "0",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace"
    }}>

      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ color: "#dcdcaa", fontSize: "13px" }}>patch</span>
          <span style={{ color: "#d4d4d4", fontSize: "13px" }}>=</span>
          <span style={{ color: "#98c379", fontSize: "13px" }}>ready</span>
        </div>

        {confidence !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "#5a5a5a" }}>confidence</span>
            <span style={{
              fontSize: "12px",
              color: confidence >= 0.8 ? "#98c379" : confidence >= 0.5 ? "#e5c07b" : "#f14c4c"
            }}>
              {Math.round(confidence * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Explanation box */}
      {explanation && (
        <div style={{
          backgroundColor: "#252526",
          border: "1px solid #3e3e42",
          borderLeft: "3px solid #569cd6",
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "12px"
        }}>
          <div style={{ color: "#6a9955", fontSize: "11px", marginBottom: "6px" }}>
            # explanation
          </div>
          <div style={{ color: "#d4d4d4", fontSize: "13px", lineHeight: "1.6" }}>
            {explanation}
          </div>
        </div>
      )}

      {/* Diff container */}
      <div style={{
        backgroundColor: "#1e1e1e",
        border: "1px solid #3e3e42",
        borderRadius: "6px",
        overflow: "hidden"
      }}>

        {/* Tab bar */}
        <div style={{
          backgroundColor: "#2d2d2d",
          borderBottom: "1px solid #3e3e42",
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <div style={{
            padding: "7px 16px",
            fontSize: "13px",
            color: "#d4d4d4",
            borderBottom: "1px solid #007acc",
            backgroundColor: "#1e1e1e"
          }}>
            patch.diff
          </div>

          {/* Legend */}
          <div className="diff-legend" style={{ display: "flex", gap: "16px" }}>
            {[
              { color: "#98c379", label: "added" },
              { color: "#f14c4c", label: "removed" },
              { color: "#5a5a5a", label: "unchanged" }
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <div style={{
                  width: "8px", height: "8px",
                  borderRadius: "2px",
                  backgroundColor: color
                }} />
                <span style={{ fontSize: "11px", color: "#5a5a5a" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Diff lines */}
        <div className="diff-lines" style={{
          padding: "8px 0",
          maxHeight: "400px",
          overflowY: "auto"
        }}>
          {lines.map((line, index) => {
            const isAdded = line.startsWith("+") && !line.startsWith("+++")
            const isRemoved = line.startsWith("-") && !line.startsWith("---")
            const isMeta = line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")

            if (isMeta) return (
              <div key={index} style={{
                padding: "2px 12px",
                color: "#5a5a5a",
                fontSize: "12px",
                fontStyle: "italic"
              }}>
                {line}
              </div>
            )

            return (
              <div key={index} style={{
                display: "flex",
                backgroundColor: isAdded
                  ? "rgba(152, 195, 121, 0.1)"
                  : isRemoved
                    ? "rgba(241, 76, 76, 0.1)"
                    : "transparent",
                borderLeft: isAdded
                  ? "2px solid #98c379"
                  : isRemoved
                    ? "2px solid #f14c4c"
                    : "2px solid transparent"
              }}>
                {/* Sign */}
                <div style={{
                  minWidth: "28px",
                  textAlign: "center",
                  color: isAdded ? "#98c379" : isRemoved ? "#f14c4c" : "#3e3e42",
                  fontSize: "13px",
                  padding: "2px 0",
                  userSelect: "none"
                }}>
                  {isAdded ? "+" : isRemoved ? "-" : " "}
                </div>

                {/* Content */}
                <div className="diff-line-content" style={{
                  flex: 1,
                  color: isAdded ? "#98c379" : isRemoved ? "#f14c4c" : "#d4d4d4",
                  fontSize: "13px",
                  padding: "2px 12px 2px 8px",
                  whiteSpace: "pre",
                  lineHeight: "1.6"
                }}>
                  {isAdded || isRemoved ? line.slice(1) : line || " "}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Copy fixed code */}
      <button
        onClick={() => navigator.clipboard.writeText(fixedCode)}
        style={{
          marginTop: "12px",
          backgroundColor: "transparent",
          border: "1px solid #3e3e42",
          borderRadius: "6px",
          color: "#6a9955",
          cursor: "pointer",
          fontSize: "12px",
          fontFamily: "inherit",
          padding: "8px 16px",
          letterSpacing: "0.04em",
          transition: "all 0.15s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "#98c379"
          e.currentTarget.style.color = "#98c379"
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "#3e3e42"
          e.currentTarget.style.color = "#6a9955"
        }}
      >
        # copy fixed code
      </button>

    </div>
  )
}