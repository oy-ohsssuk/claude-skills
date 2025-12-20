#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Octokit } from "@octokit/rest";

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required");
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

const server = new Server(
  {
    name: "github",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: list-repositories - 리포지토리 목록 조회
async function listRepositories(limit = 30, type = "all") {
  try {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      per_page: limit,
      type: type, // all, owner, public, private, member
      sort: "updated",
      direction: "desc",
    });

    const repos = data.map((repo) => ({
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      url: repo.html_url,
      default_branch: repo.default_branch,
      updated_at: repo.updated_at,
      language: repo.language,
    }));

    return { repositories: repos };
  } catch (error) {
    throw new Error(`Failed to list repositories: ${error.message}`);
  }
}

// Tool: get-repository - 리포지토리 정보 조회
async function getRepository(owner, repo) {
  try {
    const { data } = await octokit.repos.get({ owner, repo });

    return {
      name: data.name,
      full_name: data.full_name,
      description: data.description,
      private: data.private,
      default_branch: data.default_branch,
      url: data.html_url,
      language: data.language,
      topics: data.topics,
      open_issues: data.open_issues_count,
      watchers: data.watchers_count,
      forks: data.forks_count,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error) {
    throw new Error(`Failed to get repository: ${error.message}`);
  }
}

// Tool: list-issues - 이슈 목록 조회
async function listIssues(owner, repo, state = "open", limit = 30) {
  try {
    const { data } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: state, // open, closed, all
      per_page: limit,
      sort: "updated",
      direction: "desc",
    });

    const issues = data.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      user: issue.user.login,
      body: issue.body?.substring(0, 500) || "",
      labels: issue.labels.map((l) => l.name),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      url: issue.html_url,
    }));

    return { issues };
  } catch (error) {
    throw new Error(`Failed to list issues: ${error.message}`);
  }
}

// Tool: create-issue - 이슈 생성
async function createIssue(owner, repo, title, body, labels = []) {
  try {
    const { data } = await octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });

    return {
      number: data.number,
      title: data.title,
      url: data.html_url,
      state: data.state,
    };
  } catch (error) {
    throw new Error(`Failed to create issue: ${error.message}`);
  }
}

// Tool: list-pull-requests - PR 목록 조회
async function listPullRequests(owner, repo, state = "open", limit = 30) {
  try {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: state, // open, closed, all
      per_page: limit,
      sort: "updated",
      direction: "desc",
    });

    const prs = data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      user: pr.user.login,
      head: pr.head.ref,
      base: pr.base.ref,
      body: pr.body?.substring(0, 500) || "",
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      url: pr.html_url,
      mergeable: pr.mergeable,
      merged: pr.merged,
    }));

    return { pull_requests: prs };
  } catch (error) {
    throw new Error(`Failed to list pull requests: ${error.message}`);
  }
}

// Tool: get-pull-request - PR 상세 정보 조회
async function getPullRequest(owner, repo, pull_number) {
  try {
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: parseInt(pull_number),
    });

    return {
      number: data.number,
      title: data.title,
      state: data.state,
      user: data.user.login,
      head: data.head.ref,
      base: data.base.ref,
      body: data.body || "",
      created_at: data.created_at,
      updated_at: data.updated_at,
      merged_at: data.merged_at,
      url: data.html_url,
      mergeable: data.mergeable,
      merged: data.merged,
      additions: data.additions,
      deletions: data.deletions,
      changed_files: data.changed_files,
      commits: data.commits,
    };
  } catch (error) {
    throw new Error(`Failed to get pull request: ${error.message}`);
  }
}

// Tool: list-commits - 커밋 목록 조회
async function listCommits(owner, repo, branch = null, limit = 30) {
  try {
    const params = {
      owner,
      repo,
      per_page: limit,
    };

    if (branch) {
      params.sha = branch;
    }

    const { data } = await octokit.repos.listCommits(params);

    const commits = data.map((commit) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author.name,
      date: commit.commit.author.date,
      url: commit.html_url,
    }));

    return { commits };
  } catch (error) {
    throw new Error(`Failed to list commits: ${error.message}`);
  }
}

// Tool: search-code - 코드 검색
async function searchCode(query, owner = null, repo = null, limit = 30) {
  try {
    let searchQuery = query;
    if (owner && repo) {
      searchQuery = `${query} repo:${owner}/${repo}`;
    } else if (owner) {
      searchQuery = `${query} user:${owner}`;
    }

    const { data } = await octokit.search.code({
      q: searchQuery,
      per_page: limit,
    });

    const results = data.items.map((item) => ({
      name: item.name,
      path: item.path,
      repository: item.repository.full_name,
      url: item.html_url,
    }));

    return {
      total_count: data.total_count,
      results,
    };
  } catch (error) {
    throw new Error(`Failed to search code: ${error.message}`);
  }
}

// Tool: get-file-content - 파일 내용 조회
async function getFileContent(owner, repo, path, ref = null) {
  try {
    const params = { owner, repo, path };
    if (ref) {
      params.ref = ref;
    }

    const { data } = await octokit.repos.getContent(params);

    if (data.type !== "file") {
      throw new Error("Path is not a file");
    }

    const content = Buffer.from(data.content, "base64").toString("utf-8");

    return {
      name: data.name,
      path: data.path,
      size: data.size,
      content: content,
      url: data.html_url,
    };
  } catch (error) {
    throw new Error(`Failed to get file content: ${error.message}`);
  }
}

// Tool: get-user - 사용자 정보 조회
async function getUser(username = null) {
  try {
    const { data } = username
      ? await octokit.users.getByUsername({ username })
      : await octokit.users.getAuthenticated();

    return {
      login: data.login,
      name: data.name,
      email: data.email,
      bio: data.bio,
      company: data.company,
      location: data.location,
      public_repos: data.public_repos,
      followers: data.followers,
      following: data.following,
      created_at: data.created_at,
      url: data.html_url,
    };
  } catch (error) {
    throw new Error(`Failed to get user info: ${error.message}`);
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list-repositories",
        description: "List GitHub repositories for the authenticated user",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of repositories to return (default: 30)",
              default: 30,
            },
            type: {
              type: "string",
              description: "Repository type: all, owner, public, private, member (default: all)",
              default: "all",
            },
          },
        },
      },
      {
        name: "get-repository",
        description: "Get detailed information about a specific repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner (username or organization)",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "list-issues",
        description: "List issues in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            state: {
              type: "string",
              description: "Issue state: open, closed, all (default: open)",
              default: "open",
            },
            limit: {
              type: "number",
              description: "Number of issues to return (default: 30)",
              default: 30,
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "create-issue",
        description: "Create a new issue in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            title: {
              type: "string",
              description: "Issue title",
            },
            body: {
              type: "string",
              description: "Issue body/description",
            },
            labels: {
              type: "array",
              items: { type: "string" },
              description: "Array of label names",
            },
          },
          required: ["owner", "repo", "title"],
        },
      },
      {
        name: "list-pull-requests",
        description: "List pull requests in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            state: {
              type: "string",
              description: "PR state: open, closed, all (default: open)",
              default: "open",
            },
            limit: {
              type: "number",
              description: "Number of PRs to return (default: 30)",
              default: 30,
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "get-pull-request",
        description: "Get detailed information about a specific pull request",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            pull_number: {
              type: "string",
              description: "Pull request number",
            },
          },
          required: ["owner", "repo", "pull_number"],
        },
      },
      {
        name: "list-commits",
        description: "List commits in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            branch: {
              type: "string",
              description: "Branch name (optional, defaults to default branch)",
            },
            limit: {
              type: "number",
              description: "Number of commits to return (default: 30)",
              default: 30,
            },
          },
          required: ["owner", "repo"],
        },
      },
      {
        name: "search-code",
        description: "Search for code in GitHub repositories",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (e.g., 'WCareWidget language:java')",
            },
            owner: {
              type: "string",
              description: "Optional: limit to specific user/organization",
            },
            repo: {
              type: "string",
              description: "Optional: limit to specific repository (requires owner)",
            },
            limit: {
              type: "number",
              description: "Number of results to return (default: 30)",
              default: 30,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get-file-content",
        description: "Get the content of a file in a repository",
        inputSchema: {
          type: "object",
          properties: {
            owner: {
              type: "string",
              description: "Repository owner",
            },
            repo: {
              type: "string",
              description: "Repository name",
            },
            path: {
              type: "string",
              description: "File path in the repository",
            },
            ref: {
              type: "string",
              description: "Optional: branch, tag, or commit SHA (defaults to default branch)",
            },
          },
          required: ["owner", "repo", "path"],
        },
      },
      {
        name: "get-user",
        description: "Get information about a GitHub user (defaults to authenticated user)",
        inputSchema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "Optional: GitHub username (omit for authenticated user)",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "list-repositories": {
        const result = await listRepositories(args.limit, args.type);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get-repository": {
        const result = await getRepository(args.owner, args.repo);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list-issues": {
        const result = await listIssues(args.owner, args.repo, args.state, args.limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "create-issue": {
        const result = await createIssue(
          args.owner,
          args.repo,
          args.title,
          args.body,
          args.labels
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list-pull-requests": {
        const result = await listPullRequests(args.owner, args.repo, args.state, args.limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get-pull-request": {
        const result = await getPullRequest(args.owner, args.repo, args.pull_number);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list-commits": {
        const result = await listCommits(args.owner, args.repo, args.branch, args.limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "search-code": {
        const result = await searchCode(args.query, args.owner, args.repo, args.limit);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get-file-content": {
        const result = await getFileContent(args.owner, args.repo, args.path, args.ref);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get-user": {
        const result = await getUser(args.username);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
