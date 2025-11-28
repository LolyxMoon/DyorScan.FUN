import React, { useEffect, useRef, useState, useId } from "react";
import mermaid from "mermaid";

// Initialize mermaid with config
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "inherit",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis",
  },
  themeVariables: {
    primaryColor: "#6366f1",
    primaryTextColor: "#fff",
    primaryBorderColor: "#4f46e5",
    lineColor: "#64748b",
    secondaryColor: "#1e293b",
    tertiaryColor: "#0f172a",
    background: "#0f172a",
    mainBkg: "#1e293b",
    nodeBorder: "#4f46e5",
    clusterBkg: "#1e293b",
    titleColor: "#f1f5f9",
    edgeLabelBackground: "#1e293b",
  },
});

function MermaidDiagram({ code }) {
  const containerRef = useRef(null);
  const uniqueId = useId().replace(/:/g, "");
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [svgContent, setSvgContent] = useState("");

  useEffect(() => {
    const renderDiagram = async () => {
      if (!code || !containerRef.current) return;

      setError(null);

      try {
        // Clear previous content
        containerRef.current.innerHTML = "";

        // Validate syntax first
        const isValid = await mermaid.parse(code, { suppressErrors: true });
        if (!isValid) {
          throw new Error("Invalid Mermaid syntax");
        }

        // Render the diagram
        const { svg } = await mermaid.render(`mermaid-${uniqueId}`, code);
        setSvgContent(svg);
        containerRef.current.innerHTML = svg;

        // Make SVG responsive
        const svgElement = containerRef.current.querySelector("svg");
        if (svgElement) {
          svgElement.style.maxWidth = "100%";
          svgElement.style.height = "auto";
        }
      } catch (err) {
        console.error("Mermaid render error:", err);
        setError(err.message || "Failed to render diagram");
        
        // Show the raw code as fallback
        containerRef.current.innerHTML = `<pre class="mermaid-fallback">${escapeHtml(code)}</pre>`;
      }
    };

    renderDiagram();
  }, [code, uniqueId]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownloadSvg = () => {
    if (!svgContent) return;

    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "diagram.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mermaid-wrapper">
      <div className="mermaid-header">
        <span className="mermaid-label">📊 Diagram</span>
        <div className="mermaid-actions">
          <button onClick={handleCopyCode} className="mermaid-btn" title="Copy code">
            {copied ? "✓" : "📋"}
          </button>
          {svgContent && (
            <button onClick={handleDownloadSvg} className="mermaid-btn" title="Download SVG">
              ⬇️
            </button>
          )}
        </div>
      </div>
      
      {error && (
        <div className="mermaid-error">
          ⚠️ {error}
        </div>
      )}
      
      <div ref={containerRef} className="mermaid-container" />
    </div>
  );
}

// Helper to escape HTML
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export default MermaidDiagram;
