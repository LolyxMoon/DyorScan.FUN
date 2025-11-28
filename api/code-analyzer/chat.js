// API Route: /api/code-analyzer/chat
// Streaming chat responses with file selection and AI generation

import OpenAI from "openai";
import { Octokit } from "octokit";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const octokit = new Octokit(
  process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : {}
);

export const config = {
  maxDuration: 60,
};

// System prompt for code analysis
const SYSTEM_PROMPT = `You are CodeAnalyzer, an expert AI assistant specialized in analyzing GitHub repositories and source code. You provide deep insights into codebases, explain architecture, identify patterns, and help developers understand complex projects.

## Your Capabilities
- Analyze code structure and architecture
- Explain how different parts of a codebase interact
- Identify design patterns and anti-patterns
- Suggest improvements and best practices
- Generate documentation and diagrams
- Find potential bugs and security issues
- Answer questions about specific files or functions

## Response Guidelines
1. Be specific: Reference actual file names, function names, and line numbers
2. Use code examples: Show relevant code snippets with syntax highlighting
3. Explain clearly: Break down complex concepts
4. Be honest: If you don't have enough context, say so
5. Format well: Use headers, lists, and code blocks appropriately

## Formatting Rules
- Use \`inline code\` for file names, function names, variables
- Use code blocks with language specification for multi-line code
- Use **bold** for important concepts
- Use headers (##, ###) to organize long responses

## Diagram Generation
When asked to create diagrams, output them in JSON format inside a mermaid-json code block:

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
Supported edge types: arrow, dotted, thick, line`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query, owner, repo, repoDetails, history = [], tree } = req.body;

  if (!query || !owner || !repo) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  try {
    // Step 1: Analyze which files are relevant
    sendEvent("status", { message: "Analyzing query...", progress: 10 });

    const relevantFiles = await selectRelevantFiles(query, tree, owner, repo);
    sendEvent("files", { 
      files: relevantFiles.files, 
      reason: relevantFiles.reason,
      count: relevantFiles.files.length 
    });

    // Step 2: Fetch file contents
    sendEvent("status", { message: `Fetching ${relevantFiles.files.length} files...`, progress: 30 });

    const fileContents = await fetchFileContents(owner, repo, relevantFiles.files);
    const context = buildContext(fileContents);

    sendEvent("status", { message: "Generating response...", progress: 60 });

    // Step 3: Generate streaming response
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `## Repository: ${repoDetails?.full_name || `${owner}/${repo}`}
${repoDetails?.description || ""}

## File Contents
${context}`,
        },
        ...history.map((msg) => ({
          role: msg.role === "model" ? "assistant" : msg.role,
          content: msg.content,
        })),
        { role: "user", content: query },
      ],
      temperature: 0.7,
      max_tokens: 4000,
      stream: true,
    });

    sendEvent("status", { message: "Streaming response...", progress: 80 });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        sendEvent("chunk", { content });
      }
    }

    sendEvent("status", { message: "Complete", progress: 100 });
    sendEvent("done", {});
  } catch (error) {
    console.error("Chat error:", error);
    sendEvent("error", { message: error.message || "Failed to generate response" });
  } finally {
    res.end();
  }
}

// Select relevant files using AI
async function selectRelevantFiles(query, tree, owner, repo) {
  // Check for explicitly mentioned files first
  const mentionedFiles = findMentionedFiles(query, tree);
  if (mentionedFiles.length > 0) {
    return {
      files: mentionedFiles.slice(0, 15),
      reason: "Files mentioned in query",
    };
  }

  // Use AI to select files
  const prompt = `Given this file tree:
${tree}

User's question: "${query}"

Select the most relevant files (max 15) to answer this question.
Return JSON: {"files": ["path/to/file.js"], "reason": "explanation"}
Only output JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You select relevant files from codebases. Output only JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0].message.content.trim();
    const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
    return {
      files: (parsed.files || []).slice(0, 15),
      reason: parsed.reason || "AI selected",
    };
  } catch (error) {
    console.error("File selection error:", error);
    return {
      files: ["README.md", "package.json"],
      reason: "Fallback to default files",
    };
  }
}

// Find files mentioned in query
function findMentionedFiles(query, tree) {
  const files = [];
  const queryLower = query.toLowerCase();
  const lines = tree.split("\n");

  for (const line of lines) {
    const match = line.match(/[├└]── (.+)$/);
    if (match) {
      const fileName = match[1];
      if (queryLower.includes(fileName.toLowerCase())) {
        files.push(fileName);
      }
    }
  }

  return files;
}

// Fetch file contents from GitHub
async function fetchFileContents(owner, repo, paths) {
  const results = [];

  // Batch fetch (5 at a time)
  for (let i = 0; i < paths.length; i += 5) {
    const batch = paths.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (path) => {
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
          });

          if (data.type !== "file") {
            return { path, content: null, error: "Not a file" };
          }

          const content = Buffer.from(data.content, "base64").toString("utf-8");
          return { path, content, size: data.size };
        } catch (error) {
          return { path, content: null, error: error.message };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// Build context string from files
function buildContext(files) {
  const MAX_TOKENS = 80000;
  const CHARS_PER_TOKEN = 4;
  const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;

  let context = "";
  let totalChars = 0;

  for (const file of files) {
    if (!file.content) continue;

    const fileBlock = `\n--- FILE: ${file.path} ---\n${file.content}\n`;
    const blockChars = fileBlock.length;

    if (totalChars + blockChars > MAX_CHARS) {
      // Truncate this file
      const remaining = MAX_CHARS - totalChars - 100;
      if (remaining > 500) {
        context += `\n--- FILE: ${file.path} ---\n${file.content.slice(0, remaining)}\n[truncated]\n`;
      }
      break;
    }

    context += fileBlock;
    totalChars += blockChars;
  }

  return context;
}
