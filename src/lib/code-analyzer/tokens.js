// Simple token estimation (GPT-4 uses ~4 chars per token on average)
// For production, consider using tiktoken or gpt-tokenizer package

const CHARS_PER_TOKEN = 4;
const MAX_CONTEXT_TOKENS = 100000; // GPT-4o context window
const MAX_OUTPUT_TOKENS = 4000;
const SAFE_CONTEXT_TOKENS = 80000; // Leave room for system prompt and response

// Estimate token count from text
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Count tokens in a message
export function countMessageTokens(message) {
  if (!message) return 0;
  
  // Account for message overhead (role, formatting)
  const overhead = 4;
  return estimateTokens(message.content || message) + overhead;
}

// Count total tokens in conversation history
export function countHistoryTokens(history) {
  if (!history || !Array.isArray(history)) return 0;
  return history.reduce((total, msg) => total + countMessageTokens(msg), 0);
}

// Check if context fits within limits
export function checkContextFits(context, history = []) {
  const contextTokens = estimateTokens(context);
  const historyTokens = countHistoryTokens(history);
  const totalTokens = contextTokens + historyTokens;

  return {
    contextTokens,
    historyTokens,
    totalTokens,
    fits: totalTokens < SAFE_CONTEXT_TOKENS,
    remaining: SAFE_CONTEXT_TOKENS - totalTokens,
    percentUsed: Math.round((totalTokens / SAFE_CONTEXT_TOKENS) * 100),
  };
}

// Truncate text to fit token limit
export function truncateToTokenLimit(text, maxTokens = SAFE_CONTEXT_TOKENS) {
  const currentTokens = estimateTokens(text);
  
  if (currentTokens <= maxTokens) {
    return { text, truncated: false, originalTokens: currentTokens };
  }

  // Truncate to approximate character limit
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const truncated = text.slice(0, maxChars);
  
  // Try to truncate at a newline for cleaner cut
  const lastNewline = truncated.lastIndexOf("\n");
  const cleanTruncated = lastNewline > maxChars * 0.8 ? truncated.slice(0, lastNewline) : truncated;

  return {
    text: cleanTruncated + "\n\n[... content truncated due to length ...]",
    truncated: true,
    originalTokens: currentTokens,
    truncatedTokens: estimateTokens(cleanTruncated),
  };
}

// Build context string from files with token limit
export function buildContextWithLimit(files, maxTokens = SAFE_CONTEXT_TOKENS) {
  let context = "";
  let totalTokens = 0;
  const includedFiles = [];
  const skippedFiles = [];

  for (const file of files) {
    if (!file.content) continue;

    const fileHeader = `\n--- FILE: ${file.path} ---\n`;
    const fileContent = fileHeader + file.content + "\n";
    const fileTokens = estimateTokens(fileContent);

    if (totalTokens + fileTokens > maxTokens) {
      // Try to include partial content
      const remainingTokens = maxTokens - totalTokens - 100; // Buffer
      if (remainingTokens > 500) {
        const { text } = truncateToTokenLimit(file.content, remainingTokens);
        context += fileHeader + text + "\n";
        includedFiles.push({ path: file.path, truncated: true });
      } else {
        skippedFiles.push(file.path);
      }
      break;
    }

    context += fileContent;
    totalTokens += fileTokens;
    includedFiles.push({ path: file.path, truncated: false });
  }

  return {
    context,
    totalTokens,
    includedFiles,
    skippedFiles,
  };
}

// Get token usage status for UI
export function getTokenStatus(used, max = SAFE_CONTEXT_TOKENS) {
  const percentage = (used / max) * 100;

  if (percentage < 50) {
    return { level: "safe", color: "green", message: "Plenty of context space" };
  } else if (percentage < 75) {
    return { level: "moderate", color: "yellow", message: "Context moderately used" };
  } else if (percentage < 90) {
    return { level: "warning", color: "orange", message: "Context getting full" };
  } else {
    return { level: "danger", color: "red", message: "Near context limit" };
  }
}

// Format token count for display
export function formatTokenCount(tokens) {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 10000) return (tokens / 1000).toFixed(1) + "k";
  return Math.round(tokens / 1000) + "k";
}

// Constants export
export const TOKEN_LIMITS = {
  MAX_CONTEXT: MAX_CONTEXT_TOKENS,
  MAX_OUTPUT: MAX_OUTPUT_TOKENS,
  SAFE_CONTEXT: SAFE_CONTEXT_TOKENS,
  CHARS_PER_TOKEN,
};
