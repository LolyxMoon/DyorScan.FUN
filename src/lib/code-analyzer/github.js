import { Octokit } from "octokit";

let octokitInstance = null;

function getOctokit() {
  if (!octokitInstance) {
    const token = process.env.GITHUB_TOKEN;
    octokitInstance = new Octokit(token ? { auth: token } : {});
  }
  return octokitInstance;
}

// Fetch user profile data
export async function fetchUserProfile(username) {
  const octokit = getOctokit();
  
  try {
    const { data: user } = await octokit.rest.users.getByUsername({ username });
    
    const { data: repos } = await octokit.rest.repos.listForUser({
      username,
      sort: "updated",
      per_page: 10,
    });

    return {
      login: user.login,
      name: user.name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      company: user.company,
      location: user.location,
      blog: user.blog,
      twitter_username: user.twitter_username,
      public_repos: user.public_repos,
      followers: user.followers,
      following: user.following,
      created_at: user.created_at,
      repos: repos.map((r) => ({
        name: r.name,
        full_name: r.full_name,
        description: r.description,
        language: r.language,
        stargazers_count: r.stargazers_count,
        forks_count: r.forks_count,
        updated_at: r.updated_at,
      })),
    };
  } catch (error) {
    if (error.status === 404) {
      throw new Error(`User "${username}" not found`);
    }
    throw error;
  }
}

// Fetch repository data
export async function fetchRepoData(owner, repo) {
  const octokit = getOctokit();

  try {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

    // Get contributors
    let contributors = [];
    try {
      const { data } = await octokit.rest.repos.listContributors({
        owner,
        repo,
        per_page: 10,
      });
      contributors = data.map((c) => ({
        login: c.login,
        avatar_url: c.avatar_url,
        contributions: c.contributions,
      }));
    } catch (e) {
      // Ignore contributor errors
    }

    // Get languages
    let languages = {};
    try {
      const { data } = await octokit.rest.repos.listLanguages({ owner, repo });
      languages = data;
    } catch (e) {
      // Ignore language errors
    }

    return {
      name: repoData.name,
      full_name: repoData.full_name,
      description: repoData.description,
      owner: {
        login: repoData.owner.login,
        avatar_url: repoData.owner.avatar_url,
      },
      stargazers_count: repoData.stargazers_count,
      forks_count: repoData.forks_count,
      watchers_count: repoData.watchers_count,
      open_issues_count: repoData.open_issues_count,
      default_branch: repoData.default_branch,
      language: repoData.language,
      languages,
      topics: repoData.topics || [],
      created_at: repoData.created_at,
      updated_at: repoData.updated_at,
      pushed_at: repoData.pushed_at,
      license: repoData.license?.name,
      contributors,
      html_url: repoData.html_url,
      clone_url: repoData.clone_url,
    };
  } catch (error) {
    if (error.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" not found`);
    }
    throw error;
  }
}

// Build file tree from repository
export async function buildFileTree(owner, repo, path = "", depth = 0, maxDepth = 5) {
  if (depth > maxDepth) return [];

  const octokit = getOctokit();
  const tree = [];

  try {
    const { data: contents } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });

    const items = Array.isArray(contents) ? contents : [contents];

    for (const item of items) {
      // Skip common non-essential directories
      if (
        item.type === "dir" &&
        ["node_modules", ".git", "dist", "build", ".next", "__pycache__", "vendor"].includes(item.name)
      ) {
        continue;
      }

      const node = {
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size || 0,
      };

      if (item.type === "dir" && depth < maxDepth) {
        node.children = await buildFileTree(owner, repo, item.path, depth + 1, maxDepth);
      }

      tree.push(node);
    }

    return tree.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });
  } catch (error) {
    console.error(`Error fetching tree for ${path}:`, error.message);
    return [];
  }
}

// Convert tree to flat string representation
export function treeToString(tree, prefix = "") {
  let result = "";
  
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    const isLast = i === tree.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    result += `${prefix}${connector}${node.name}\n`;

    if (node.children && node.children.length > 0) {
      result += treeToString(node.children, prefix + childPrefix);
    }
  }

  return result;
}

// Get flat list of file paths from tree
export function getFilePaths(tree, basePath = "") {
  const paths = [];

  for (const node of tree) {
    const fullPath = basePath ? `${basePath}/${node.name}` : node.name;

    if (node.type === "file") {
      paths.push(fullPath);
    } else if (node.children) {
      paths.push(...getFilePaths(node.children, fullPath));
    }
  }

  return paths;
}

// Fetch single file content
export async function fetchFileContent(owner, repo, path) {
  const octokit = getOctokit();

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });

    if (data.type !== "file") {
      throw new Error(`Path "${path}" is not a file`);
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");
    return {
      path,
      content,
      size: data.size,
      sha: data.sha,
    };
  } catch (error) {
    if (error.status === 404) {
      return { path, content: null, error: "File not found" };
    }
    return { path, content: null, error: error.message };
  }
}

// Fetch multiple files in batch
export async function fetchFilesBatch(owner, repo, paths, maxConcurrent = 5) {
  const results = [];
  
  // Process in chunks to avoid rate limiting
  for (let i = 0; i < paths.length; i += maxConcurrent) {
    const chunk = paths.slice(i, i + maxConcurrent);
    const chunkResults = await Promise.all(
      chunk.map((path) => fetchFileContent(owner, repo, path))
    );
    results.push(...chunkResults);
  }

  return results;
}

// Prune file tree - remove non-essential files
export function pruneFileTree(tree) {
  const skipExtensions = [
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
    ".mp3", ".mp4", ".wav", ".avi", ".mov",
    ".zip", ".tar", ".gz", ".rar",
    ".pdf", ".doc", ".docx",
    ".lock", ".log",
    ".woff", ".woff2", ".ttf", ".eot",
  ];

  const skipFiles = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".DS_Store",
    "Thumbs.db",
  ];

  const skipDirs = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "__pycache__",
    "vendor",
    ".cache",
    "coverage",
  ];

  return tree
    .filter((node) => {
      if (node.type === "dir" && skipDirs.includes(node.name)) {
        return false;
      }
      if (node.type === "file") {
        if (skipFiles.includes(node.name)) return false;
        const ext = node.name.substring(node.name.lastIndexOf(".")).toLowerCase();
        if (skipExtensions.includes(ext)) return false;
      }
      return true;
    })
    .map((node) => {
      if (node.children) {
        return { ...node, children: pruneFileTree(node.children) };
      }
      return node;
    });
}

// Check if input is username or owner/repo
export function parseGitHubInput(input) {
  const trimmed = input.trim();
  
  // GitHub URL patterns
  const urlMatch = trimmed.match(/github\.com\/([^\/]+)(?:\/([^\/]+))?/);
  if (urlMatch) {
    if (urlMatch[2]) {
      return { type: "repo", owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, "") };
    }
    return { type: "profile", username: urlMatch[1] };
  }

  // owner/repo pattern
  if (trimmed.includes("/")) {
    const [owner, repo] = trimmed.split("/");
    if (owner && repo) {
      return { type: "repo", owner, repo };
    }
  }

  // Just username
  return { type: "profile", username: trimmed };
}
