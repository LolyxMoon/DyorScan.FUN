import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./CodeBlock";
import MermaidDiagram from "./Mermaid";

// Token estimation
const estimateTokens = (text) => Math.ceil((text || "").length / 4);
const MAX_TOKENS = 80000;

// Parse mermaid-json blocks
const parseMermaidJSON = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
};

// Generate Mermaid from JSON
const generateMermaidFromJSON = (data) => {
  if (!data?.nodes) return "graph TD\n  A[Invalid]";
  
  const shapeMap = {
    rect: ["[", "]"],
    rounded: ["(", ")"],
    circle: ["((", "))"],
    diamond: ["{", "}"],
    database: ["[(", ")]"],
  };
  
  const edgeMap = {
    arrow: "-->",
    dotted: "-.->",
    thick: "==>",
    line: "---",
  };

  const lines = [`graph ${data.direction || "TD"}`];

  for (const node of data.nodes) {
    const [open, close] = shapeMap[node.shape] || shapeMap.rect;
    const label = (node.label || node.id).replace(/"/g, "'");
    lines.push(`  ${node.id}${open}"${label}"${close}`);
  }

  for (const edge of data.edges || []) {
    const type = edgeMap[edge.type] || edgeMap.arrow;
    if (edge.label) {
      lines.push(`  ${edge.from} ${type}|"${edge.label}"| ${edge.to}`);
    } else {
      lines.push(`  ${edge.from} ${type} ${edge.to}`);
    }
  }

  return lines.join("\n");
};

// Message content renderer
const MessageContent = memo(({ content }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const language = match ? match[1] : "";
          const codeString = String(children).replace(/\n$/, "");

          if (!inline && language) {
            // Handle mermaid-json
            if (language === "mermaid-json") {
              const jsonData = parseMermaidJSON(codeString);
              if (jsonData) {
                const mermaidCode = generateMermaidFromJSON(jsonData);
                return <MermaidDiagram code={mermaidCode} />;
              }
            }

            // Handle regular mermaid
            if (language === "mermaid") {
              return <MermaidDiagram code={codeString} />;
            }

            // Regular code block
            return <CodeBlock code={codeString} language={language} />;
          }

          // Inline code
          return (
            <code className="inline-code" {...props}>
              {children}
            </code>
          );
        },
        table({ children }) {
          return (
            <div className="table-wrapper">
              <table className="markdown-table">{children}</table>
            </div>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});

MessageContent.displayName = "MessageContent";

// Suggestion chips
const SUGGESTIONS = [
  "Explain the project architecture",
  "What are the main entry points?",
  "Find security vulnerabilities",
  "How does authentication work?",
  "Generate a diagram of the data flow",
];

function ChatInterface({ owner, repo, repoData }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [status, setStatus] = useState({ message: "", progress: 0 });
  const [relevantFiles, setRelevantFiles] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [scanning, setScanning] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Load conversation from localStorage
  useEffect(() => {
    const key = `code-analyzer-${owner}-${repo}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMessages(parsed.messages || []);
        setShowSuggestions(parsed.messages?.length === 0);
      } catch {
        // Ignore parse errors
      }
    }
  }, [owner, repo]);

  // Save conversation to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      const key = `code-analyzer-${owner}-${repo}`;
      localStorage.setItem(key, JSON.stringify({ messages }));
    }
  }, [messages, owner, repo]);

  // Calculate token usage
  const tokenUsage = messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0
  );
  const tokenPercentage = (tokenUsage / MAX_TOKENS) * 100;

  // Clear conversation
  const clearConversation = () => {
    if (confirm("Clear conversation history?")) {
      setMessages([]);
      setShowSuggestions(true);
      const key = `code-analyzer-${owner}-${repo}`;
      localStorage.removeItem(key);
    }
  };

  // Handle security scan
  const handleSecurityScan = async () => {
    if (scanning) return;
    setScanning(true);
    setLoading(true);
    setStatus({ message: "Preparing security scan...", progress: 5 });

    // Add user message
    const userMessage = {
      id: Date.now(),
      role: "user",
      content: "🔒 Run a security scan on this repository",
    };
    setMessages((prev) => [...prev, userMessage]);
    setShowSuggestions(false);

    try {
      const response = await fetch("/api/code-analyzer/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner,
          repo,
          filePaths: repoData.filePaths,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let scanResult = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const { type, data } = JSON.parse(line.slice(6));
              
              if (type === "status") {
                setStatus(data);
              } else if (type === "complete") {
                scanResult = data;
              } else if (type === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              // Parse error, continue
            }
          }
        }
      }

      // Format scan results as message
      if (scanResult) {
        let content = `## 🔒 Security Scan Results\n\n`;
        content += `**${scanResult.summary}**\n\n`;
        content += `Scanned ${scanResult.scannedFiles} files.\n\n`;

        if (scanResult.findings.length > 0) {
          const severityEmoji = {
            critical: "🔴",
            high: "🟠",
            medium: "🟡",
            low: "🔵",
          };

          // Show top 10 findings
          const topFindings = scanResult.findings.slice(0, 10);
          
          for (const finding of topFindings) {
            content += `### ${severityEmoji[finding.severity]} ${finding.title}\n`;
            content += `**File:** \`${finding.file}\` (line ${finding.line})\n`;
            content += `**Type:** ${finding.type} | **Severity:** ${finding.severity}\n\n`;
            content += `${finding.description}\n\n`;
            content += `**Fix:** ${finding.fix}\n\n`;
            content += `---\n\n`;
          }

          if (scanResult.findings.length > 10) {
            content += `\n*...and ${scanResult.findings.length - 10} more findings*\n`;
          }
        } else {
          content += `✅ No significant security issues found!\n`;
        }

        const assistantMessage = {
          id: Date.now() + 1,
          role: "model",
          content,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        role: "model",
        content: `❌ Security scan failed: ${error.message}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setScanning(false);
      setLoading(false);
      setStatus({ message: "", progress: 0 });
    }
  };

  // Handle chat submission
  const handleSubmit = async (e) => {
    e?.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    // Check for security scan trigger
    if (
      query.toLowerCase().includes("security") &&
      (query.toLowerCase().includes("scan") || query.toLowerCase().includes("vulnerabilit"))
    ) {
      setInput("");
      handleSecurityScan();
      return;
    }

    setInput("");
    setLoading(true);
    setStreamingContent("");
    setRelevantFiles([]);
    setShowSuggestions(false);

    // Add user message
    const userMessage = {
      id: Date.now(),
      role: "user",
      content: query,
    };
    setMessages((prev) => [...prev, userMessage]);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/code-analyzer/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          owner,
          repo,
          repoDetails: repoData,
          history: messages.slice(-10), // Last 10 messages for context
          tree: repoData.tree,
        }),
        signal: abortControllerRef.current.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const { type, data } = JSON.parse(line.slice(6));

              switch (type) {
                case "status":
                  setStatus(data);
                  break;
                case "files":
                  setRelevantFiles(data.files || []);
                  break;
                case "chunk":
                  fullContent += data.content;
                  setStreamingContent(fullContent);
                  break;
                case "done":
                  // Add final message
                  const assistantMessage = {
                    id: Date.now() + 1,
                    role: "model",
                    content: fullContent,
                    relevantFiles: relevantFiles,
                  };
                  setMessages((prev) => [...prev, assistantMessage]);
                  setStreamingContent("");
                  break;
                case "error":
                  throw new Error(data.message);
              }
            } catch (e) {
              if (e.name !== "AbortError") {
                console.error("Parse error:", e);
              }
            }
          }
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        const errorMessage = {
          id: Date.now() + 1,
          role: "model",
          content: `❌ Error: ${error.message}`,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } finally {
      setLoading(false);
      setStatus({ message: "", progress: 0 });
      abortControllerRef.current = null;
    }
  };

  // Handle suggestion click
  const handleSuggestion = (suggestion) => {
    setInput(suggestion);
    // Auto-submit after a brief delay
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} };
      setInput(suggestion);
      handleSubmit(fakeEvent);
    }, 100);
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <header className="chat-header">
        <div className="chat-header-left">
          <Link to="/code-analyzer" className="chat-back-btn">
            ← Back
          </Link>
          <div className="chat-repo-info">
            <img
              src={repoData.owner?.avatar_url}
              alt={owner}
              className="chat-owner-avatar"
            />
            <div>
              <h1 className="chat-repo-name">{repoData.full_name}</h1>
              <p className="chat-repo-desc">
                {repoData.description || "No description"}
              </p>
            </div>
          </div>
        </div>
        <div className="chat-header-right">
          <div className="chat-token-counter" title={`${tokenUsage} / ${MAX_TOKENS} tokens`}>
            <div 
              className="chat-token-bar"
              style={{ 
                width: `${Math.min(tokenPercentage, 100)}%`,
                backgroundColor: tokenPercentage > 80 ? "#ef4444" : tokenPercentage > 50 ? "#eab308" : "#22c55e"
              }}
            />
            <span className="chat-token-text">
              {Math.round(tokenUsage / 1000)}k tokens
            </span>
          </div>
          <button onClick={clearConversation} className="chat-clear-btn" title="Clear conversation">
            🗑️
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="chat-messages">
        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="chat-welcome">
            <h2>👋 Welcome to Code Analyzer</h2>
            <p>
              Ask me anything about <strong>{repoData.full_name}</strong>. I can help you understand 
              the architecture, find bugs, explain code, and more.
            </p>
            <div className="chat-repo-stats">
              <span>⭐ {repoData.stargazers_count}</span>
              <span>🍴 {repoData.forks_count}</span>
              <span>📁 {repoData.fileCount} files</span>
              <span>🔤 {repoData.language}</span>
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-message ${msg.role === "user" ? "chat-message-user" : "chat-message-assistant"}`}
          >
            <div className="chat-message-avatar">
              {msg.role === "user" ? "👤" : "🤖"}
            </div>
            <div className="chat-message-content">
              <MessageContent content={msg.content} />
              {msg.relevantFiles && msg.relevantFiles.length > 0 && (
                <details className="chat-relevant-files">
                  <summary>📁 {msg.relevantFiles.length} files analyzed</summary>
                  <ul>
                    {msg.relevantFiles.map((file, i) => (
                      <li key={i}><code>{file}</code></li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streamingContent && (
          <div className="chat-message chat-message-assistant">
            <div className="chat-message-avatar">🤖</div>
            <div className="chat-message-content">
              <MessageContent content={streamingContent} />
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {loading && !streamingContent && (
          <div className="chat-loading">
            <div className="chat-loading-spinner"></div>
            <p>{status.message || "Thinking..."}</p>
            {status.progress > 0 && (
              <div className="chat-progress-bar">
                <div 
                  className="chat-progress-fill"
                  style={{ width: `${status.progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {showSuggestions && messages.length === 0 && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((suggestion, i) => (
            <button
              key={i}
              onClick={() => handleSuggestion(suggestion)}
              className="chat-suggestion-chip"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this repository..."
          className="chat-input"
          disabled={loading}
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={loading || !input.trim()}
        >
          {loading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

export default ChatInterface;
