// Mermaid diagram utilities
// Adapted from RepoMind's diagram-utils.ts

// Shape mappings for Mermaid syntax
const SHAPE_MAP = {
  rect: { open: "[", close: "]" },
  rounded: { open: "(", close: ")" },
  circle: { open: "((", close: "))" },
  diamond: { open: "{", close: "}" },
  database: { open: "[(", close: ")]" },
  cloud: { open: "))", close: "((" },
  hexagon: { open: "{{", close: "}}" },
};

// Edge type mappings
const EDGE_MAP = {
  arrow: "-->",
  dotted: "-.->",
  thick: "==>",
  line: "---",
};

// Sanitize text for use in Mermaid labels
export function sanitizeMermaidText(text) {
  if (!text) return "";
  
  return text
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/`/g, "'") // Replace backticks
    .replace(/"/g, "'") // Replace double quotes
    .replace(/'/g, "'") // Normalize quotes
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/[\\/]/g, " ") // Replace slashes
    .replace(/[\n\r]/g, " ") // Remove newlines
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .slice(0, 50); // Limit length
}

// Sanitize ID for Mermaid nodes
export function sanitizeNodeId(id) {
  if (!id) return "node" + Math.random().toString(36).slice(2, 8);
  
  return id
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^[0-9]/, "_$&") // IDs can't start with number
    .slice(0, 30);
}

// Generate Mermaid code from JSON structure
export function generateMermaidFromJSON(data) {
  if (!data || !data.nodes || !Array.isArray(data.nodes)) {
    return "graph TD\n  A[Invalid Data]";
  }

  const direction = data.direction || "TD";
  const lines = [`graph ${direction}`];

  // Add title as comment if provided
  if (data.title) {
    lines.unshift(`%% ${sanitizeMermaidText(data.title)}`);
  }

  // Generate node definitions
  for (const node of data.nodes) {
    const id = sanitizeNodeId(node.id);
    const label = sanitizeMermaidText(node.label || node.id);
    const shape = SHAPE_MAP[node.shape] || SHAPE_MAP.rect;
    
    lines.push(`  ${id}${shape.open}"${label}"${shape.close}`);
  }

  // Generate edges
  if (data.edges && Array.isArray(data.edges)) {
    for (const edge of data.edges) {
      const from = sanitizeNodeId(edge.from);
      const to = sanitizeNodeId(edge.to);
      const edgeType = EDGE_MAP[edge.type] || EDGE_MAP.arrow;
      
      if (edge.label) {
        const label = sanitizeMermaidText(edge.label);
        lines.push(`  ${from} ${edgeType}|"${label}"| ${to}`);
      } else {
        lines.push(`  ${from} ${edgeType} ${to}`);
      }
    }
  }

  return lines.join("\n");
}

// Parse JSON from mermaid-json code block
export function parseMermaidJSON(content) {
  try {
    // Try to extract JSON from code block
    const jsonMatch = content.match(/```mermaid-json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }

    // Try direct JSON parse
    return JSON.parse(content);
  } catch (error) {
    console.error("Failed to parse Mermaid JSON:", error);
    return null;
  }
}

// Validate basic Mermaid syntax
export function validateMermaidSyntax(code) {
  if (!code || typeof code !== "string") {
    return { valid: false, error: "Empty or invalid code" };
  }

  const lines = code.trim().split("\n").filter((l) => l.trim());
  
  if (lines.length < 2) {
    return { valid: false, error: "Diagram too short" };
  }

  // Check for valid diagram type
  const validTypes = [
    "graph", "flowchart", "sequenceDiagram", "classDiagram",
    "stateDiagram", "erDiagram", "gantt", "pie", "gitGraph",
  ];
  
  const firstLine = lines[0].trim().toLowerCase();
  const hasValidType = validTypes.some((type) => firstLine.startsWith(type));

  if (!hasValidType) {
    return { valid: false, error: "Invalid diagram type" };
  }

  return { valid: true };
}

// Sanitize and fix common Mermaid syntax issues
export function sanitizeMermaidCode(code) {
  if (!code) return "graph TD\n  A[No content]";

  let cleaned = code
    .replace(/\r\n/g, "\n") // Normalize line endings
    .replace(/%%[^\n]*/g, "") // Remove comments
    .trim();

  // Ensure proper graph declaration
  const lines = cleaned.split("\n");
  if (!lines[0].match(/^(graph|flowchart|sequenceDiagram|classDiagram)/i)) {
    cleaned = "graph TD\n" + cleaned;
  }

  // Fix common issues
  cleaned = cleaned
    // Fix arrow syntax
    .replace(/-->\|([^|]+)\|>/g, "-->|$1|")
    .replace(/-\.->/g, "-.->")
    // Fix node labels with special chars
    .replace(/\[([^\]]*[<>][^\]]*)\]/g, (_, label) => `["${sanitizeMermaidText(label)}"]`)
    // Fix unquoted labels with spaces
    .replace(/(\w+)\[([^\]"]+)\]/g, (match, id, label) => {
      if (label.includes(" ")) {
        return `${id}["${sanitizeMermaidText(label)}"]`;
      }
      return match;
    });

  return cleaned;
}

// Template: Basic flow diagram
export function createFlowDiagram(steps) {
  const nodes = steps.map((step, i) => ({
    id: `step${i}`,
    label: step,
    shape: i === 0 ? "rounded" : i === steps.length - 1 ? "rounded" : "rect",
  }));

  const edges = nodes.slice(0, -1).map((_, i) => ({
    from: `step${i}`,
    to: `step${i + 1}`,
    type: "arrow",
  }));

  return generateMermaidFromJSON({ direction: "TD", nodes, edges });
}

// Template: Architecture diagram
export function createArchitectureDiagram(layers) {
  // layers = { frontend: [...], backend: [...], database: [...] }
  const nodes = [];
  const edges = [];

  Object.entries(layers).forEach(([layer, items], layerIndex) => {
    items.forEach((item, itemIndex) => {
      const id = `${layer}_${itemIndex}`;
      const shape = layer === "database" ? "database" : 
                    layer === "frontend" ? "rounded" : "rect";
      nodes.push({ id, label: item, shape });

      // Connect to next layer
      if (layerIndex < Object.keys(layers).length - 1) {
        const nextLayer = Object.keys(layers)[layerIndex + 1];
        const nextItems = layers[nextLayer];
        if (nextItems && nextItems.length > 0) {
          edges.push({ from: id, to: `${nextLayer}_0`, type: "arrow" });
        }
      }
    });
  });

  return generateMermaidFromJSON({ direction: "TB", nodes, edges });
}

// Template: Component dependency diagram
export function createDependencyDiagram(components) {
  // components = [{ name: "App", depends: ["Header", "Footer"] }, ...]
  const nodes = components.map((c) => ({
    id: sanitizeNodeId(c.name),
    label: c.name,
    shape: "rect",
  }));

  const edges = [];
  components.forEach((component) => {
    if (component.depends) {
      component.depends.forEach((dep) => {
        edges.push({
          from: sanitizeNodeId(component.name),
          to: sanitizeNodeId(dep),
          type: "dotted",
          label: "uses",
        });
      });
    }
  });

  return generateMermaidFromJSON({ direction: "LR", nodes, edges });
}

// Default export
export default {
  generateMermaidFromJSON,
  parseMermaidJSON,
  validateMermaidSyntax,
  sanitizeMermaidCode,
  sanitizeMermaidText,
  sanitizeNodeId,
  createFlowDiagram,
  createArchitectureDiagram,
  createDependencyDiagram,
};
