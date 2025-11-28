import React, { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

function CodeBlock({ code, language }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Map common language aliases
  const languageMap = {
    js: "javascript",
    ts: "typescript",
    jsx: "jsx",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    yml: "yaml",
    sh: "bash",
    shell: "bash",
    json5: "json",
  };

  const normalizedLang = languageMap[language] || language || "text";

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{normalizedLang}</span>
        <button
          onClick={handleCopy}
          className="code-block-copy"
          title={copied ? "Copied!" : "Copy code"}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={normalizedLang}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: "0 0 8px 8px",
          fontSize: "13px",
          padding: "16px",
        }}
        showLineNumbers={code.split("\n").length > 5}
        lineNumberStyle={{ opacity: 0.5, minWidth: "2.5em" }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default CodeBlock;
