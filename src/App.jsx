import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import ScanForm from "./components/ScanForm.jsx";
import ScanResult from "./components/ScanResult.jsx";
import UnicornBackground from "./components/UnicornBackground.jsx";
import Documentation from "./pages/Documentation.jsx";
import ApiKeys from "./pages/ApiKeys.jsx";
import CodeAnalyzer from "./pages/CodeAnalyzer.jsx";

const loadingMessages = [
  "Analyzing contract data...",
  "Extracting narrative claims...",
  "Identifying entities...",
  "Cross-referencing sources...",
  "Generating insights...",
  "Finalizing report..."
];

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const scanSectionRef = useRef(null);
  const howItWorksRef = useRef(null);

  useEffect(() => {
    if (loading) {
      let index = 0;
      const interval = setInterval(() => {
        index = (index + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[index]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  useEffect(() => {
    // Handle hash navigation when on home page
    if (location.pathname === '/' && window.location.hash === '#how-it-works') {
      setTimeout(() => {
        const element = document.getElementById('how-it-works');
        element?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location]);

  const scrollToScan = () => {
    scanSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToHowItWorks = (e) => {
    if (e) {
      e.preventDefault();
    }
    
    const scrollToElement = () => {
      const element = howItWorksRef.current || document.getElementById('how-it-works');
      if (element) {
        const headerOffset = 80;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    };
    
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(scrollToElement, 500);
    } else {
      scrollToElement();
    }
  };

  const handleScan = async (contractAddress) => {
    setLoading(true);
    setErrorMsg("");
    setResult(null);
    
    try {
      const response = await fetch("/api/scan-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAddress }),
      });

      if (!response.ok) {
        throw new Error(`Scan failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let partialResult = { _streaming: true };

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
                  setLoadingMessage(data.message);
                  break;
                case "tokenInfo":
                  partialResult = { ...partialResult, ...data };
                  setResult({ ...partialResult });
                  break;
                case "marketData":
                  partialResult.marketData = data;
                  setResult({ ...partialResult });
                  break;
                case "securityData":
                  partialResult.securityData = data;
                  setResult({ ...partialResult });
                  break;
                case "fundamentals":
                  partialResult.fundamentals = data;
                  setResult({ ...partialResult });
                  break;
                case "socials":
                  partialResult.socials = data;
                  setResult({ ...partialResult });
                  break;
                case "twitterData":
                  partialResult.twitterData = data;
                  setResult({ ...partialResult });
                  break;
                case "tickerTweets":
                  partialResult.tickerTweets = data;
                  setResult({ ...partialResult });
                  break;
                case "sentimentScore":
                  partialResult.sentimentScore = data.sentimentScore;
                  setResult({ ...partialResult });
                  break;
                case "tokenScore":
                  partialResult.tokenScore = data.tokenScore;
                  setResult({ ...partialResult });
                  break;
                case "narrative":
                  partialResult.narrativeClaim = data.narrativeClaim;
                  setResult({ ...partialResult });
                  break;
                case "summary":
                  partialResult.summary = data.summary;
                  setResult({ ...partialResult });
                  break;
                case "fundamentalsAnalysis":
                  partialResult.fundamentalsAnalysis = data.fundamentalsAnalysis;
                  setResult({ ...partialResult });
                  break;
                case "hypeAnalysis":
                  partialResult.hypeAnalysis = data.hypeAnalysis;
                  setResult({ ...partialResult });
                  break;
                case "complete":
                  partialResult._streaming = false;
                  partialResult.tokenScore = data.tokenScore || partialResult.tokenScore;
                  setResult({ ...partialResult });
                  break;
                case "error":
                  throw new Error(data.message);
              }
            } catch (parseErr) {
              console.warn("Parse error:", parseErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("Scan error:", err);
      setErrorMsg(err.message || "Something went wrong. Please try again.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <UnicornBackground />
      <header className="site-header">
        <div className="site-header-content">
          <Link to="/" className="logo">
            <img src="/logo.png" alt="DYOR" className="logo-image" />
            <span className="logo-text">DYOR</span>
          </Link>
          <nav className="site-nav">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Home</Link>
            <Link to="/code-analyzer" className={location.pathname.startsWith('/code-analyzer') ? 'active' : ''}>Code Analyzer</Link>
            <Link to="/docs" className={location.pathname === '/docs' ? 'active' : ''}>Documentation</Link>
            <a href="#how-it-works" onClick={scrollToHowItWorks}>How It Works</a>
            <Link to="/api-keys" className={location.pathname === '/api-keys' ? 'active' : ''}>API</Link>
          </nav>

          <div className="site-header-actions">
            <Link to="/code-analyzer" className="btn-secondary">
              ⚡ Code Analyzer
            </Link>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">
              <span className="gradient-text">Verify Token Narratives</span>
              <br />
              Before You Invest
            </h1>
            <p className="hero-description">
              AI-powered token analysis that extracts claims, verifies narratives, 
              and assesses risks. Get comprehensive intelligence on any Solana or BNB token in seconds.
            </p>
            <div className="hero-buttons">
              <button onClick={scrollToScan} className="btn-primary">
                Scan Token
              </button>
              <Link to="/code-analyzer" className="btn-outline">
                ⚡ Analyze Code
              </Link>
            </div>
          </div>

          <div className="hero-visual">
            {result ? (
              <ScanResult result={result} />
            ) : (
              <div className="preview-card">
                <div className="preview-header">
                  <div className="preview-title">Sample Analysis</div>
                  <div className="preview-badge-container">
                    <span className="preview-badge confirmed">AI Verified</span>
                  </div>
                </div>

                <div className="preview-content-grid">
                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Narrative Extraction</div>
                      <div className="preview-detail">AI-powered claim identification</div>
                    </div>
                  </div>

                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Reality Check</div>
                      <div className="preview-detail">Verified against real data</div>
                    </div>
                  </div>

                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Security Scan</div>
                      <div className="preview-detail">Risk assessment & red flags</div>
                    </div>
                  </div>

                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="6"></circle>
                        <circle cx="12" cy="12" r="2"></circle>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Overall Score</div>
                      <div className="preview-detail">0-100 rating based on all metrics</div>
                    </div>
                  </div>
                </div>

                <div className="preview-footer">
                  <div className="preview-badge">
                    <span className="badge-icon">⚡</span>
                    <span className="badge-text">Results in ~10 seconds</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="features-section">
          <div className="section-header">
            <h2 className="section-title">Advanced Token Intelligence</h2>
            <p className="section-subtitle">Multi-source data aggregation with AI-powered narrative analysis</p>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <h3>Market Data</h3>
              <p>Real-time price, liquidity, and volume from DexScreener. Track 24h changes and trading metrics across Solana and BNB DEXs.</p>
            </div>
            
            <div className="feature-card">
              <h3>Narrative Extraction</h3>
              <p>AI analyzes token descriptions to extract core claims, identify key entities, and understand the project's story.</p>
            </div>
            
            <div className="feature-card">
              <h3>Security Analysis</h3>
              <p>Automated risk assessment from RugCheck. Detect potential vulnerabilities and security concerns before investing.</p>
            </div>
            
            <div className="feature-card">
              <h3>AI Verification</h3>
              <p>GPT-4 powered classification system that evaluates narratives as CONFIRMED, PARTIAL, or UNVERIFIED with detailed reasoning.</p>
            </div>
            
            <div className="feature-card highlight-card">
              <h3>⚡ Code Analyzer</h3>
              <p>NEW: Analyze any GitHub repository with AI. Understand architecture, find security issues, and chat with code.</p>
              <Link to="/code-analyzer" className="feature-link">Try it now →</Link>
            </div>
            
            <div className="feature-card">
              <h3>Instant Results</h3>
              <p>Sub-5 second analysis with cached results. Get comprehensive insights without waiting for slow data aggregation.</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" ref={howItWorksRef} className="how-it-works-section">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">From contract address to verified intelligence in seconds</p>
          </div>
          
          <div className="steps-container">
            <div className="step">
              <div className="step-number">01</div>
              <div className="step-content">
                <h3>Enter Contract Address</h3>
                <p>Paste any Solana or BNB token contract address into the scanner</p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step">
              <div className="step-number">02</div>
              <div className="step-content">
                <h3>AI-Powered Analysis</h3>
                <p>Aggregate data from multiple sources and extract narrative claims with AI verification</p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step">
              <div className="step-number">03</div>
              <div className="step-content">
                <h3>Verified Report</h3>
                <p>Receive comprehensive analysis with actionable insights</p>
              </div>
            </div>
          </div>
        </section>

        <section className="api-section">
          <div className="section-header">
            <h2 className="section-title">API Access</h2>
            <p className="section-subtitle">Integrate DYOR Scanner into your platform with our REST API</p>
          </div>
          
          <div className="api-content">
            <div className="api-description">
              <p>
                Build token analysis into your application with our simple REST API. 
                No setup required - just make HTTP requests and get comprehensive token intelligence.
              </p>
              <ul>
                <li>Simple REST API - works with any programming language</li>
                <li>No database setup required on your end</li>
                <li>Real-time token analysis with AI-powered verification</li>
                <li>Rate limits based on your tier</li>
                <li>Comprehensive documentation and examples</li>
              </ul>
              <Link to="/api-keys" className="btn-cta" style={{ display: 'inline-block', marginTop: '20px' }}>
                Get Your API Key
              </Link>
            </div>
            
            <div className="api-example">
              <h3>Quick Example</h3>
              <pre className="code-block">{`fetch('https://your-domain.com/api/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    contractAddress: 'So11111111111111111111111111111111111111112'
  })
})
.then(res => res.json())
.then(data => {
  console.log('Verdict:', data.verdict);
  console.log('Score:', data.tokenScore);
});`}</pre>
            </div>
          </div>
        </section>

        <section className="scan-section" ref={scanSectionRef}>
          <div className="scan-container">
            <div className="scan-header">
              <h2 className="scan-title">Token Scanner</h2>
              <p className="scan-subtitle">Enter a Solana or BNB contract address to analyze token claims, extract entities, and verify narratives</p>
            </div>
            
            <ScanForm onScan={handleScan} loading={loading} />

            {loading && (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p className="loading-message">{loadingMessage}</p>
              </div>
            )}

            {errorMsg && <div className="error">{errorMsg}</div>}
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-content">
            <h2>Ready to Verify Token Narratives?</h2>
            <p>Join thousands of traders making smarter decisions with AI-powered token intelligence</p>
            <button onClick={scrollToScan} className="btn-cta">Scan Your First Token</button>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <div className="app-footer-content">
          <div className="app-footer-logo">
            <img src="/logo.png" alt="DYOR" className="footer-logo-image" />
          </div>
          <div className="app-footer-links">
            <Link to="/">Home</Link>
            <Link to="/code-analyzer">Code Analyzer</Link>
            <Link to="/docs">Documentation</Link>
            <a href="#how-it-works" onClick={scrollToHowItWorks}>How It Works</a>
            <a href="https://github.com/DyorScanFUN" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <div className="app-footer-text">
            Built with React, Vite, OpenAI & Supabase • Always DYOR
          </div>
        </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/docs" element={<Documentation />} />
        <Route path="/api-keys" element={<ApiKeys />} />
        <Route path="/code-analyzer" element={<CodeAnalyzer />} />
        <Route path="/code-analyzer/:owner/:repo" element={<CodeAnalyzer />} />
        <Route path="/" element={<AppContent />} />
      </Routes>
    </Router>
  );
}

export default App;
