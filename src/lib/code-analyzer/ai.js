import OpenAI from "openai";

let openaiInstance = null;

function getOpenAI() {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiInstance;
}

// System prompt for code analysis
const CODE_ANALYZER_SYSTEM_PROMPT = `You are CodeAnalyzer, an expert AI assistant specialized in analyzing GitHub repositories and source code. You provide deep insights into codebases, explain architecture, identify patterns, and help developers understand complex projects.

## Your Capabilities
- Analyze code structure and architecture
- Explain how different parts of a codebase interact
- Identify design patterns and anti-patterns
- Suggest improvements and best practices
- Generate documentation and diagrams
- Find potential bugs and security issues
- Answer questions about specific files or functions

## Response Guidelines
1. **Be specific**: Reference actual file names, function names, and line numbers when relevant
2. **Use code examples**: Show relevant code snippets with syntax highlighting
3. **Explain clearly**: Break down complex concepts into understandable parts
4. **Be honest**: If you don't have enough context, say so
5. **Format well**: Use headers, lists, and code blocks appropriately

## Formatting Rules
- Use \`inline code\` for file names, function names, variables
- Use code blocks with language specification for multi-line code
- Use **bold** for important concepts
- Use headers (##, ###) to organize long responses
- Keep paragraphs concise

## Diagram Generation
When asked to create diagrams or visualize architecture, output them in this JSON format inside a mermaid-json code block:

\`\`\`mermaid-json
{
  "title": "Diagram Title",
  "direction": "TB",
  "nodes": [
    {"id": "a", "label": "Node A", "shape": "rect"},
    {"id": "b", "label": "Node B", "shape": "rounded"}
  ],
  "edges": [
    {"from": "a", "to": "b", "label": "connects to", "type": "arrow"}
  ]
}
\`\`\`

Supported shapes: rect, rounded, circle, diamond, database, cloud, hexagon
Supported edge types: arrow, dotted, thick, line

## Current Context
You are analyzing a repository. Use the provided file contents to give accurate, specific answers.`;

// Analyze which files are relevant to a query
export async function analyzeFileSelection(query, fileTree, owner, repo) {
  const openai = getOpenAI();

  // Tier 1: Check for explicitly mentioned files
  const mentionedFiles = extractMentionedFiles(query, fileTree);
  if (mentionedFiles.length > 0) {
    return {
      files: mentionedFiles.slice(0, 15),
      reason: "Files explicitly mentioned in query",
      tier: "explicit",
    };
  }

  // Tier 2: AI selection
  const prompt = `Given this file tree of the repository ${owner}/${repo}:

${fileTree}

The user is asking: "${query}"

Select the most relevant files (maximum 15) that would help answer this question. Consider:
- Entry points (index.js, main.js, app.js, etc.)
- Configuration files (package.json, config files)
- Files that match keywords in the query
- Core business logic files
- Related test files if asking about testing

Respond with a JSON object:
{
  "files": ["path/to/file1.js", "path/to/file2.js"],
  "reason": "Brief explanation of why these files were selected"
}

IMPORTANT: Only output the JSON, nothing else.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that selects relevant files from a codebase. Always respond with valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = response.choices[0].message.content.trim();
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));

    return {
      files: parsed.files.slice(0, 15),
      reason: parsed.reason,
      tier: "ai",
    };
  } catch (error) {
    console.error("AI file selection failed:", error);
    // Fallback to common files
    return {
      files: ["README.md", "package.json", "src/index.js", "src/App.jsx"],
      reason: "Fallback to common entry files",
      tier: "fallback",
    };
  }
}

// Extract files mentioned in query
function extractMentionedFiles(query, fileTreeString) {
  const files = [];
  const lines = fileTreeString.split("\n");
  
  for (const line of lines) {
    // Extract file name from tree line (e.g., "├── file.js" -> "file.js")
    const match = line.match(/[├└]── (.+)$/);
    if (match) {
      const fileName = match[1];
      // Check if file name appears in query (case insensitive)
      if (query.toLowerCase().includes(fileName.toLowerCase())) {
        // Find full path - this is simplified, actual path extraction would be more complex
        files.push(fileName);
      }
    }
  }

  return files;
}

// Generate streaming answer with context
export async function* generateAnswerStream(query, context, repoDetails, history = []) {
  const openai = getOpenAI();

  const contextMessage = `## Repository: ${repoDetails.full_name}
${repoDetails.description || "No description"}

**Languages:** ${Object.keys(repoDetails.languages || {}).join(", ") || repoDetails.language || "Unknown"}
**Stars:** ${repoDetails.stargazers_count} | **Forks:** ${repoDetails.forks_count}

## File Contents
${context}`;

  const messages = [
    { role: "system", content: CODE_ANALYZER_SYSTEM_PROMPT },
    { role: "user", content: contextMessage },
    ...history.map((msg) => ({
      role: msg.role === "model" ? "assistant" : msg.role,
      content: msg.content,
    })),
    { role: "user", content: query },
  ];

  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 4000,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } catch (error) {
    console.error("OpenAI streaming error:", error);
    yield `Error generating response: ${error.message}`;
  }
}

// Non-streaming answer for simpler use cases
export async function generateAnswer(query, context, repoDetails, history = []) {
  const openai = getOpenAI();

  const contextMessage = `## Repository: ${repoDetails.full_name}
${repoDetails.description || "No description"}

## File Contents
${context}`;

  const messages = [
    { role: "system", content: CODE_ANALYZER_SYSTEM_PROMPT },
    { role: "user", content: contextMessage },
    ...history.map((msg) => ({
      role: msg.role === "model" ? "assistant" : msg.role,
      content: msg.content,
    })),
    { role: "user", content: query },
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens: 4000,
  });

  return response.choices[0].message.content;
}

// Analyze code for security vulnerabilities
export async function analyzeSecurityWithAI(files, owner, repo) {
  const openai = getOpenAI();

  const fileContents = files
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join("\n\n");

  const prompt = `Analyze these code files for security vulnerabilities:

${fileContents}

For each vulnerability found, provide:
1. File and line number (if identifiable)
2. Vulnerability type (e.g., SQL Injection, XSS, Hardcoded Secrets)
3. Severity (critical, high, medium, low)
4. Description of the issue
5. Recommended fix

Respond with JSON:
{
  "findings": [
    {
      "file": "path/to/file.js",
      "line": 42,
      "type": "Hardcoded Secret",
      "severity": "high",
      "title": "API key exposed in source code",
      "description": "An API key is hardcoded in the source file",
      "fix": "Move the API key to environment variables"
    }
  ],
  "summary": "Brief overall security assessment"
}

If no vulnerabilities found, return empty findings array.
IMPORTANT: Only output valid JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a security expert analyzing code for vulnerabilities. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
  } catch (error) {
    console.error("Security analysis error:", error);
    return { findings: [], summary: "Analysis failed: " + error.message };
  }
}

// Analyze code quality
export async function analyzeCodeQuality(fileContent, filePath) {
  const openai = getOpenAI();

  const prompt = `Analyze this code file for quality:

File: ${filePath}
\`\`\`
${fileContent.slice(0, 10000)}
\`\`\`

Evaluate:
1. Code organization and structure
2. Naming conventions
3. Error handling
4. Performance considerations
5. Best practices adherence
6. Potential improvements

Respond with JSON:
{
  "score": 75,
  "grade": "B",
  "metrics": {
    "organization": 80,
    "naming": 70,
    "errorHandling": 60,
    "performance": 75,
    "bestPractices": 70
  },
  "strengths": ["Good modular structure", "Clear function names"],
  "improvements": ["Add error handling for async operations", "Consider memoization"],
  "summary": "Brief quality assessment"
}

IMPORTANT: Only output valid JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a code quality expert. Respond only with valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0].message.content.trim();
    return JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
  } catch (error) {
    console.error("Quality analysis error:", error);
    return { score: 0, error: error.message };
  }
}

// Fix Mermaid syntax errors
export async function fixMermaidSyntax(code) {
  const openai = getOpenAI();

  const prompt = `Fix any syntax errors in this Mermaid diagram code and return ONLY the corrected code:

${code}

Rules:
- Ensure proper node definitions
- Quote labels with special characters
- Fix arrow syntax
- Return ONLY the corrected Mermaid code, no explanations`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You fix Mermaid diagram syntax. Return only corrected code." },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    return response.choices[0].message.content.trim().replace(/```mermaid\n?|\n?```/g, "");
  } catch (error) {
    console.error("Mermaid fix error:", error);
    return code; // Return original if fix fails
  }
}
