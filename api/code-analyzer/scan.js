// API Route: /api/code-analyzer/scan
// Security vulnerability scanning

import OpenAI from "openai";
import { Octokit } from "octokit";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const octokit = new Octokit(
  process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : {}
);

export const config = {
  maxDuration: 60,
};

// Security patterns to scan for
const SECURITY_PATTERNS = [
  {
    id: "hardcoded-api-key",
    type: "Hardcoded Secret",
    severity: "critical",
    pattern: /(api[_-]?key|apikey)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/gi,
    title: "Hardcoded API Key",
    description: "API key appears to be hardcoded in source code",
    fix: "Move API keys to environment variables",
  },
  {
    id: "hardcoded-secret",
    type: "Hardcoded Secret",
    severity: "critical",
    pattern: /(secret|password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    title: "Hardcoded Secret/Password",
    description: "Secret or password appears to be hardcoded",
    fix: "Use environment variables or a secrets manager",
  },
  {
    id: "aws-key",
    type: "Hardcoded Secret",
    severity: "critical",
    pattern: /AKIA[0-9A-Z]{16}/g,
    title: "AWS Access Key",
    description: "AWS access key ID found in source code",
    fix: "Remove and rotate the AWS key immediately",
  },
  {
    id: "eval-usage",
    type: "Code Injection",
    severity: "critical",
    pattern: /\beval\s*\([^)]+\)/g,
    title: "eval() Usage",
    description: "eval() can execute arbitrary code",
    fix: "Avoid eval(); use safer alternatives",
  },
  {
    id: "innerhtml",
    type: "XSS",
    severity: "high",
    pattern: /\.innerHTML\s*=\s*[^;]+/g,
    title: "innerHTML Assignment",
    description: "Direct innerHTML assignment may enable XSS",
    fix: "Use textContent or sanitize HTML",
  },
  {
    id: "dangerously-set-html",
    type: "XSS",
    severity: "high",
    pattern: /dangerouslySetInnerHTML/g,
    title: "dangerouslySetInnerHTML Usage",
    description: "Bypasses React's XSS protection",
    fix: "Sanitize content with DOMPurify",
  },
  {
    id: "sql-injection",
    type: "SQL Injection",
    severity: "high",
    pattern: /(\$\{|\+\s*)(req\.|request\.|params\.|query\.|body\.)/g,
    title: "Potential SQL Injection",
    description: "User input may be concatenated into SQL",
    fix: "Use parameterized queries",
  },
  {
    id: "exec-injection",
    type: "Command Injection",
    severity: "critical",
    pattern: /(exec|execSync|spawn)\s*\([^)]*(\$\{|req\.|params\.)/g,
    title: "Command Injection Risk",
    description: "User input may be passed to shell",
    fix: "Sanitize input; avoid shell execution",
  },
  {
    id: "cors-wildcard",
    type: "Misconfiguration",
    severity: "medium",
    pattern: /cors\s*\(\s*\{\s*origin\s*:\s*['"]?\*['"]?/gi,
    title: "CORS Wildcard Origin",
    description: "CORS allows any origin",
    fix: "Restrict to trusted origins",
  },
  {
    id: "md5-usage",
    type: "Weak Cryptography",
    severity: "medium",
    pattern: /createHash\s*\(\s*['"]md5['"]\)/gi,
    title: "MD5 Hash Usage",
    description: "MD5 is cryptographically broken",
    fix: "Use SHA-256 or stronger",
  },
];

const CODE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".php", ".go"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { owner, repo, filePaths } = req.body;

  if (!owner || !repo) {
    return res.status(400).json({ error: "Missing owner or repo" });
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  try {
    // Filter to code files only
    const codeFiles = (filePaths || [])
      .filter((path) => {
        const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
        return CODE_EXTENSIONS.includes(ext);
      })
      .slice(0, 20); // Limit to 20 files

    if (codeFiles.length === 0) {
      sendEvent("error", { message: "No code files found to scan" });
      return res.end();
    }

    sendEvent("status", { 
      message: `Scanning ${codeFiles.length} files...`, 
      progress: 10 
    });

    // Fetch file contents
    const files = await fetchFiles(owner, repo, codeFiles, sendEvent);

    sendEvent("status", { 
      message: "Running pattern-based scan...", 
      progress: 40 
    });

    // Pattern-based scan
    const patternFindings = runPatternScan(files);

    sendEvent("status", { 
      message: "Running AI analysis...", 
      progress: 60 
    });

    // AI-powered scan for more nuanced issues
    const aiFindings = await runAIScan(files);

    // Combine and deduplicate
    const allFindings = deduplicateFindings([...patternFindings, ...aiFindings]);

    // Filter to high confidence only
    const filteredFindings = allFindings.filter(
      (f) => f.severity === "critical" || f.severity === "high" || f.confidence === "high"
    );

    sendEvent("status", { message: "Generating summary...", progress: 90 });

    const grouped = groupBySeverity(filteredFindings);
    const summary = generateSummary(filteredFindings);

    sendEvent("complete", {
      findings: filteredFindings,
      grouped,
      summary,
      scannedFiles: codeFiles.length,
      totalFindings: filteredFindings.length,
    });

    sendEvent("status", { message: "Complete", progress: 100 });
  } catch (error) {
    console.error("Scan error:", error);
    sendEvent("error", { message: error.message || "Scan failed" });
  } finally {
    res.end();
  }
}

// Fetch files from GitHub
async function fetchFiles(owner, repo, paths, sendEvent) {
  const results = [];

  for (let i = 0; i < paths.length; i += 5) {
    const batch = paths.slice(i, i + 5);
    const progress = Math.round(10 + (i / paths.length) * 30);
    sendEvent("status", { 
      message: `Fetching files (${i + batch.length}/${paths.length})...`, 
      progress 
    });

    const batchResults = await Promise.all(
      batch.map(async (path) => {
        try {
          const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
          if (data.type !== "file") return { path, content: null };
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          return { path, content };
        } catch (e) {
          return { path, content: null };
        }
      })
    );

    results.push(...batchResults.filter((f) => f.content));
  }

  return results;
}

// Pattern-based security scan
function runPatternScan(files) {
  const findings = [];

  for (const file of files) {
    if (!file.content) continue;
    const lines = file.content.split("\n");

    for (const pattern of SECURITY_PATTERNS) {
      pattern.pattern.lastIndex = 0;
      let match;

      while ((match = pattern.pattern.exec(file.content)) !== null) {
        // Find line number
        const position = match.index;
        let lineNumber = 1;
        let charCount = 0;

        for (let i = 0; i < lines.length; i++) {
          charCount += lines[i].length + 1;
          if (charCount > position) {
            lineNumber = i + 1;
            break;
          }
        }

        findings.push({
          id: `${pattern.id}-${file.path}-${lineNumber}`,
          file: file.path,
          line: lineNumber,
          type: pattern.type,
          severity: pattern.severity,
          title: pattern.title,
          description: pattern.description,
          fix: pattern.fix,
          confidence: "high",
          source: "pattern",
        });
      }
    }
  }

  return findings;
}

// AI-powered security analysis
async function runAIScan(files) {
  const fileContents = files
    .slice(0, 10) // Limit for AI analysis
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 5000)}`)
    .join("\n\n");

  const prompt = `Analyze these code files for security vulnerabilities:

${fileContents}

Find security issues not caught by simple patterns. Look for:
- Logic flaws in authentication/authorization
- Insecure data handling
- Race conditions
- Information leakage
- Improper error handling exposing sensitive data

Return JSON only:
{
  "findings": [
    {
      "file": "path/to/file.js",
      "line": 42,
      "type": "Category",
      "severity": "critical|high|medium|low",
      "title": "Short title",
      "description": "What's wrong",
      "fix": "How to fix"
    }
  ]
}

If no issues found, return {"findings": []}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a security expert. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content.trim();
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));

    return (parsed.findings || []).map((f) => ({
      ...f,
      id: `ai-${f.file}-${f.line}-${Date.now()}`,
      confidence: "medium",
      source: "ai",
    }));
  } catch (error) {
    console.error("AI scan error:", error);
    return [];
  }
}

// Deduplicate findings
function deduplicateFindings(findings) {
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Group by severity
function groupBySeverity(findings) {
  return {
    critical: findings.filter((f) => f.severity === "critical"),
    high: findings.filter((f) => f.severity === "high"),
    medium: findings.filter((f) => f.severity === "medium"),
    low: findings.filter((f) => f.severity === "low"),
  };
}

// Generate summary
function generateSummary(findings) {
  const total = findings.length;
  if (total === 0) return "No security vulnerabilities detected.";

  const grouped = groupBySeverity(findings);
  const parts = [];

  if (grouped.critical.length) parts.push(`${grouped.critical.length} critical`);
  if (grouped.high.length) parts.push(`${grouped.high.length} high`);
  if (grouped.medium.length) parts.push(`${grouped.medium.length} medium`);
  if (grouped.low.length) parts.push(`${grouped.low.length} low`);

  return `Found ${total} potential issue${total !== 1 ? "s" : ""}: ${parts.join(", ")}`;
}
