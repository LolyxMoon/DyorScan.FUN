import React, { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import ChatInterface from "../components/code-analyzer/ChatInterface";
import "../styles/code-analyzer.css";

function CodeAnalyzer() {
  const navigate = useNavigate();
  const { owner, repo } = useParams();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [repoData, setRepoData] = useState(null);

  // If we have owner/repo params, fetch repo data
  useEffect(() => {
    if (owner && repo) {
      fetchRepoData(owner, repo);
    }
  }, [owner, repo]);

  const fetchRepoData = async (owner, repo) => {
    setLoading(true);
    setError("");
    
    try {
      const response = await fetch("/api/code-analyzer/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: `${owner}/${repo}` }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to fetch repository");
      }

      const result = await response.json();
      if (result.type === "repo") {
        setRepoData(result.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/code-analyzer/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to fetch");
      }

      const result = await response.json();

      if (result.type === "repo") {
        // Navigate to repo chat
        const [owner, repo] = result.data.full_name.split("/");
        navigate(`/code-analyzer/${owner}/${repo}`);
      } else {
        // For now, just show profile info
        setError("Profile analysis coming soon. Please enter a repository (owner/repo).");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // If we're on a repo page, show the chat interface
  if (owner && repo && repoData) {
    return (
      <div className="code-analyzer-page">
        <ChatInterface 
          owner={owner} 
          repo={repo} 
          repoData={repoData} 
        />
      </div>
    );
  }

  // Otherwise show the search page
  return (
    <div className="code-analyzer-page">
      <header className="ca-header">
        <Link to="/" className="ca-back-link">
          ← Back to DYOR
        </Link>
        <h1 className="ca-logo">
          <span className="ca-logo-icon">⚡</span>
          Code Analyzer
        </h1>
      </header>

      <main className="ca-main">
        <section className="ca-hero">
          <h2 className="ca-title">Analyze Any GitHub Repository</h2>
          <p className="ca-subtitle">
            Ask questions about code, understand architecture, find security issues, 
            and get AI-powered insights about any public repository.
          </p>

          <form onSubmit={handleSubmit} className="ca-search-form">
            <div className="ca-input-wrapper">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter GitHub repo (e.g., facebook/react)"
                className="ca-input"
                disabled={loading}
              />
              <button 
                type="submit" 
                className="ca-submit-btn"
                disabled={loading || !input.trim()}
              >
                {loading ? (
                  <span className="ca-spinner"></span>
                ) : (
                  "Analyze"
                )}
              </button>
            </div>
            {error && <p className="ca-error">{error}</p>}
          </form>

          <div className="ca-examples">
            <p>Try these:</p>
            <div className="ca-example-links">
              <button onClick={() => setInput("vercel/next.js")}>vercel/next.js</button>
              <button onClick={() => setInput("facebook/react")}>facebook/react</button>
              <button onClick={() => setInput("microsoft/vscode")}>microsoft/vscode</button>
            </div>
          </div>
        </section>

        <section className="ca-features">
          <div className="ca-feature-grid">
            <div className="ca-feature-card">
              <div className="ca-feature-icon">💬</div>
              <h3>Chat with Code</h3>
              <p>Ask questions about any file, function, or concept in the repository</p>
            </div>
            <div className="ca-feature-card">
              <div className="ca-feature-icon">🏗️</div>
              <h3>Architecture Analysis</h3>
              <p>Understand project structure and how components interact</p>
            </div>
            <div className="ca-feature-card">
              <div className="ca-feature-icon">🔒</div>
              <h3>Security Scanning</h3>
              <p>Detect vulnerabilities, hardcoded secrets, and security issues</p>
            </div>
            <div className="ca-feature-card">
              <div className="ca-feature-icon">📊</div>
              <h3>Visual Diagrams</h3>
              <p>Generate architecture and flow diagrams automatically</p>
            </div>
          </div>
        </section>

        <section className="ca-how-it-works">
          <h3>How It Works</h3>
          <div className="ca-steps">
            <div className="ca-step">
              <span className="ca-step-number">1</span>
              <p>Enter a GitHub repository URL or owner/repo</p>
            </div>
            <div className="ca-step-arrow">→</div>
            <div className="ca-step">
              <span className="ca-step-number">2</span>
              <p>AI analyzes the codebase structure</p>
            </div>
            <div className="ca-step-arrow">→</div>
            <div className="ca-step">
              <span className="ca-step-number">3</span>
              <p>Chat to explore and understand the code</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default CodeAnalyzer;
