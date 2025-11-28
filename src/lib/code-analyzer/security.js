// Security vulnerability scanner with pattern-based detection
// Adapted from RepoMind's security-scanner.ts

// Vulnerability patterns to scan for
const SECURITY_PATTERNS = [
  // Hardcoded Secrets
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
    id: "private-key",
    type: "Hardcoded Secret",
    severity: "critical",
    pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    title: "Private Key Exposed",
    description: "Private key found in source code",
    fix: "Remove private key and store securely outside repo",
  },
  {
    id: "jwt-secret",
    type: "Hardcoded Secret",
    severity: "high",
    pattern: /(jwt[_-]?secret|token[_-]?secret)\s*[:=]\s*['"][^'"]+['"]/gi,
    title: "Hardcoded JWT Secret",
    description: "JWT signing secret is hardcoded",
    fix: "Move to environment variables",
  },

  // SQL Injection
  {
    id: "sql-injection",
    type: "SQL Injection",
    severity: "high",
    pattern: /(\$\{|\+\s*)\s*(req\.|request\.|params\.|query\.|body\.)[^}]+\}?\s*(\+|`)/g,
    title: "Potential SQL Injection",
    description: "User input may be directly concatenated into SQL query",
    fix: "Use parameterized queries or prepared statements",
  },
  {
    id: "raw-query",
    type: "SQL Injection",
    severity: "medium",
    pattern: /\.raw\s*\(\s*['"`]/g,
    title: "Raw SQL Query",
    description: "Raw SQL queries may be vulnerable to injection",
    fix: "Prefer ORM methods or use parameterized queries",
  },

  // XSS
  {
    id: "innerhtml",
    type: "XSS",
    severity: "high",
    pattern: /\.innerHTML\s*=\s*[^;]+/g,
    title: "innerHTML Assignment",
    description: "Direct innerHTML assignment may enable XSS",
    fix: "Use textContent or sanitize HTML before insertion",
  },
  {
    id: "dangerously-set-html",
    type: "XSS",
    severity: "high",
    pattern: /dangerouslySetInnerHTML/g,
    title: "dangerouslySetInnerHTML Usage",
    description: "React's dangerouslySetInnerHTML bypasses XSS protection",
    fix: "Sanitize content with DOMPurify before rendering",
  },
  {
    id: "document-write",
    type: "XSS",
    severity: "high",
    pattern: /document\.write\s*\(/g,
    title: "document.write Usage",
    description: "document.write can introduce XSS vulnerabilities",
    fix: "Use DOM manipulation methods instead",
  },

  // Command Injection
  {
    id: "exec-injection",
    type: "Command Injection",
    severity: "critical",
    pattern: /(exec|execSync|spawn|spawnSync)\s*\([^)]*(\$\{|req\.|request\.|params\.)/g,
    title: "Command Injection Risk",
    description: "User input may be passed to shell command",
    fix: "Sanitize input and avoid shell execution with user data",
  },
  {
    id: "eval-usage",
    type: "Code Injection",
    severity: "critical",
    pattern: /\beval\s*\([^)]+\)/g,
    title: "eval() Usage",
    description: "eval() can execute arbitrary code",
    fix: "Avoid eval(); use safer alternatives like JSON.parse()",
  },

  // Path Traversal
  {
    id: "path-traversal",
    type: "Path Traversal",
    severity: "high",
    pattern: /(readFile|readFileSync|writeFile|writeFileSync)\s*\([^)]*(\$\{|req\.|request\.|params\.)/g,
    title: "Path Traversal Risk",
    description: "User input in file path may allow directory traversal",
    fix: "Validate and sanitize file paths; use path.resolve()",
  },

  // Insecure Configuration
  {
    id: "cors-wildcard",
    type: "Misconfiguration",
    severity: "medium",
    pattern: /cors\s*\(\s*\{\s*origin\s*:\s*['"]?\*['"]?/gi,
    title: "CORS Wildcard Origin",
    description: "CORS allows requests from any origin",
    fix: "Restrict to specific trusted origins",
  },
  {
    id: "https-disabled",
    type: "Misconfiguration",
    severity: "medium",
    pattern: /https?\s*:\s*false|secure\s*:\s*false/gi,
    title: "HTTPS/Secure Disabled",
    description: "Security feature appears to be disabled",
    fix: "Enable HTTPS and secure flags in production",
  },
  {
    id: "debug-enabled",
    type: "Misconfiguration",
    severity: "low",
    pattern: /debug\s*[:=]\s*true|DEBUG\s*=\s*['"]?true/gi,
    title: "Debug Mode Enabled",
    description: "Debug mode should be disabled in production",
    fix: "Use environment-based configuration",
  },

  // Deprecated/Insecure Functions
  {
    id: "md5-usage",
    type: "Weak Cryptography",
    severity: "medium",
    pattern: /createHash\s*\(\s*['"]md5['"]\)/gi,
    title: "MD5 Hash Usage",
    description: "MD5 is cryptographically broken",
    fix: "Use SHA-256 or stronger hashing algorithms",
  },
  {
    id: "sha1-usage",
    type: "Weak Cryptography",
    severity: "low",
    pattern: /createHash\s*\(\s*['"]sha1['"]\)/gi,
    title: "SHA1 Hash Usage",
    description: "SHA1 is considered weak for security purposes",
    fix: "Use SHA-256 or stronger algorithms",
  },

  // Authentication Issues
  {
    id: "no-auth-check",
    type: "Authentication",
    severity: "medium",
    pattern: /\/\/\s*TODO:?\s*(add|implement)?\s*auth/gi,
    title: "Missing Authentication",
    description: "TODO comment suggests authentication not implemented",
    fix: "Implement proper authentication before deployment",
  },
];

// File extensions to scan
const CODE_EXTENSIONS = [
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".rb", ".php", ".java", ".go", ".rs",
  ".vue", ".svelte",
];

// Scan a single file for vulnerabilities
export function scanFile(filePath, content) {
  const findings = [];
  
  if (!content || typeof content !== "string") {
    return findings;
  }

  // Check if file should be scanned
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  if (!CODE_EXTENSIONS.includes(ext)) {
    return findings;
  }

  const lines = content.split("\n");

  for (const pattern of SECURITY_PATTERNS) {
    pattern.pattern.lastIndex = 0; // Reset regex
    
    let match;
    while ((match = pattern.pattern.exec(content)) !== null) {
      // Find line number
      const position = match.index;
      let lineNumber = 1;
      let charCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        charCount += lines[i].length + 1; // +1 for newline
        if (charCount > position) {
          lineNumber = i + 1;
          break;
        }
      }

      // Get code snippet
      const snippetStart = Math.max(0, lineNumber - 2);
      const snippetEnd = Math.min(lines.length, lineNumber + 1);
      const snippet = lines.slice(snippetStart, snippetEnd).join("\n");

      findings.push({
        id: `${pattern.id}-${filePath}-${lineNumber}`,
        file: filePath,
        line: lineNumber,
        type: pattern.type,
        severity: pattern.severity,
        title: pattern.title,
        description: pattern.description,
        fix: pattern.fix,
        match: match[0].slice(0, 100), // Limit match length
        snippet,
        confidence: "high",
      });
    }
  }

  return findings;
}

// Scan multiple files
export function scanFiles(files) {
  const allFindings = [];

  for (const file of files) {
    if (!file.content) continue;
    const findings = scanFile(file.path, file.content);
    allFindings.push(...findings);
  }

  // Deduplicate by unique key
  const seen = new Set();
  const deduplicated = allFindings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  deduplicated.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return deduplicated;
}

// Group findings by severity
export function groupBySeverity(findings) {
  return {
    critical: findings.filter((f) => f.severity === "critical"),
    high: findings.filter((f) => f.severity === "high"),
    medium: findings.filter((f) => f.severity === "medium"),
    low: findings.filter((f) => f.severity === "low"),
  };
}

// Generate summary
export function generateSummary(findings) {
  const grouped = groupBySeverity(findings);
  const total = findings.length;

  if (total === 0) {
    return "No security vulnerabilities detected in the scanned files.";
  }

  const parts = [];
  if (grouped.critical.length > 0) {
    parts.push(`${grouped.critical.length} critical`);
  }
  if (grouped.high.length > 0) {
    parts.push(`${grouped.high.length} high`);
  }
  if (grouped.medium.length > 0) {
    parts.push(`${grouped.medium.length} medium`);
  }
  if (grouped.low.length > 0) {
    parts.push(`${grouped.low.length} low`);
  }

  return `Found ${total} potential security issue${total !== 1 ? "s" : ""}: ${parts.join(", ")}`;
}

// Get severity emoji
export function getSeverityEmoji(severity) {
  const emojis = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🔵",
  };
  return emojis[severity] || "⚪";
}

// Get severity color (for UI)
export function getSeverityColor(severity) {
  const colors = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
  };
  return colors[severity] || "#6b7280";
}

// Filter files for security scan
export function filterCodeFiles(files, maxFiles = 20) {
  return files
    .filter((file) => {
      const ext = file.path.substring(file.path.lastIndexOf(".")).toLowerCase();
      return CODE_EXTENSIONS.includes(ext);
    })
    .slice(0, maxFiles);
}

export default {
  scanFile,
  scanFiles,
  groupBySeverity,
  generateSummary,
  getSeverityEmoji,
  getSeverityColor,
  filterCodeFiles,
  CODE_EXTENSIONS,
};
