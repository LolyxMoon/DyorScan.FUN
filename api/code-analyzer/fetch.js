// API Route: /api/code-analyzer/fetch
// Fetches GitHub user or repository data

import { Octokit } from "octokit";

const octokit = new Octokit(
  process.env.GITHUB_TOKEN ? { auth: process.env.GITHUB_TOKEN } : {}
);

export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { input } = req.body;

  if (!input || typeof input !== "string") {
    return res.status(400).json({ error: "Input is required" });
  }

  try {
    const parsed = parseGitHubInput(input.trim());

    if (parsed.type === "repo") {
      const data = await fetchRepoData(parsed.owner, parsed.repo);
      return res.json({ type: "repo", data });
    } else {
      const data = await fetchUserProfile(parsed.username);
      return res.json({ type: "profile", data });
    }
  } catch (error) {
    console.error("Fetch error:", error);
    return res.status(error.status || 500).json({
      error: error.message || "Failed to fetch GitHub data",
    });
  }
}

// Parse input to determine if it's a username or repo
function parseGitHubInput(input) {
  // GitHub URL patterns
  const urlMatch = input.match(/github\.com\/([^\/]+)(?:\/([^\/\s]+))?/);
  if (urlMatch) {
    if (urlMatch[2]) {
      return {
        type: "repo",
        owner: urlMatch[1],
        repo: urlMatch[2].replace(/\.git$/, ""),
      };
    }
    return { type: "profile", username: urlMatch[1] };
  }

  // owner/repo pattern
  if (input.includes("/")) {
    const [owner, repo] = input.split("/");
    if (owner && repo) {
      return { type: "repo", owner, repo };
    }
  }

  // Just username
  return { type: "profile", username: input };
}

// Fetch repository data
async function fetchRepoData(owner, repo) {
  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });

  // Get file tree
  const tree = await buildFileTree(owner, repo);
  const treeString = treeToString(tree);
  const filePaths = getFilePaths(tree);

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
    // Ignore
  }

  // Get languages
  let languages = {};
  try {
    const { data } = await octokit.rest.repos.listLanguages({ owner, repo });
    languages = data;
  } catch (e) {
    // Ignore
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
    license: repoData.license?.name,
    contributors,
    html_url: repoData.html_url,
    clone_url: repoData.clone_url,
    tree: treeString,
    filePaths,
    fileCount: filePaths.length,
  };
}

// Fetch user profile
async function fetchUserProfile(username) {
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
}

// Build file tree recursively
async function buildFileTree(owner, repo, path = "", depth = 0) {
  if (depth > 4) return [];

  const skipDirs = [
    "node_modules", ".git", "dist", "build", ".next",
    "__pycache__", "vendor", ".cache", "coverage",
  ];

  try {
    const { data: contents } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
    });

    const items = Array.isArray(contents) ? contents : [contents];
    const tree = [];

    for (const item of items) {
      if (item.type === "dir" && skipDirs.includes(item.name)) continue;

      const node = {
        name: item.name,
        path: item.path,
        type: item.type,
        size: item.size || 0,
      };

      if (item.type === "dir" && depth < 4) {
        node.children = await buildFileTree(owner, repo, item.path, depth + 1);
      }

      tree.push(node);
    }

    return tree.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "dir" ? -1 : 1;
    });
  } catch (error) {
    console.error(`Tree error for ${path}:`, error.message);
    return [];
  }
}

// Convert tree to string
function treeToString(tree, prefix = "") {
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

// Get flat list of file paths
function getFilePaths(tree, basePath = "") {
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
