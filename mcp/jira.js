#!/usr/bin/env node

const https = require('https');
const { URL } = require('url');

class JiraMCP {
  constructor() {
    this.baseUrl = process.env.JIRA_BASE_URL;
    this.token = process.env.JIRA_API_TOKEN;

    if (!this.baseUrl || !this.token) {
      console.error('JIRA_BASE_URL and JIRA_API_TOKEN environment variables are required');
      process.exit(1);
    }
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/rest/api/2${endpoint}`);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode >= 400) {
              reject(new Error(`Jira API Error: ${res.statusCode} - ${data}`));
              return;
            }

            const result = JSON.parse(data);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  async getProjects() {
    try {
      const result = await this.makeRequest('/project');
      return result;
    } catch (error) {
      throw error;
    }
  }

  async getIssue(issueKey) {
    try {
      const result = await this.makeRequest(`/issue/${issueKey}`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async searchIssues(jql, maxResults = 50) {
    try {
      const encodedJql = encodeURIComponent(jql);
      const result = await this.makeRequest(`/search?jql=${encodedJql}&maxResults=${maxResults}`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async createIssue(projectKey, issueType, summary, description = '', assignee = null) {
    try {
      const issueData = {
        fields: {
          project: {
            key: projectKey
          },
          issuetype: {
            name: issueType
          },
          summary: summary,
          description: description
        }
      };

      if (assignee) {
        issueData.fields.assignee = {
          name: assignee
        };
      }

      const result = await this.makeRequest('/issue', 'POST', issueData);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async updateIssue(issueKey, fields) {
    try {
      const updateData = {
        fields: fields
      };

      const result = await this.makeRequest(`/issue/${issueKey}`, 'PUT', updateData);
      return { success: true, message: `Issue ${issueKey} updated successfully` };
    } catch (error) {
      throw error;
    }
  }

  async getIssueTypes(projectKey = null) {
    try {
      let endpoint = '/issuetype';
      if (projectKey) {
        endpoint = `/project/${projectKey}/statuses`;
      }
      const result = await this.makeRequest(endpoint);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async addComment(issueKey, comment) {
    try {
      const commentData = {
        body: comment
      };

      const result = await this.makeRequest(`/issue/${issueKey}/comment`, 'POST', commentData);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // MCP Protocol Implementation
  async handleRequest(request) {
    const { method, params = {} } = request;

    switch (method) {
      case 'initialize':
        return {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'jira-bearer',
            version: '1.0.0'
          }
        };

      case 'tools/list':
        return {
          tools: [
            {
              name: 'get_projects',
              description: 'Get Jira projects',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'get_issue',
              description: 'Get a Jira issue by key',
              inputSchema: {
                type: 'object',
                properties: {
                  issueKey: {
                    type: 'string',
                    description: 'Issue key (e.g., PROJ-123)'
                  }
                },
                required: ['issueKey']
              }
            },
            {
              name: 'search_issues',
              description: 'Search Jira issues using JQL',
              inputSchema: {
                type: 'object',
                properties: {
                  jql: {
                    type: 'string',
                    description: 'JQL query string'
                  },
                  maxResults: {
                    type: 'number',
                    description: 'Maximum number of results',
                    default: 50
                  }
                },
                required: ['jql']
              }
            },
            {
              name: 'create_issue',
              description: 'Create a new Jira issue',
              inputSchema: {
                type: 'object',
                properties: {
                  projectKey: {
                    type: 'string',
                    description: 'Project key (e.g., PROJ)'
                  },
                  issueType: {
                    type: 'string',
                    description: 'Issue type (e.g., Task, Bug, Story)'
                  },
                  summary: {
                    type: 'string',
                    description: 'Issue summary/title'
                  },
                  description: {
                    type: 'string',
                    description: 'Issue description'
                  },
                  assignee: {
                    type: 'string',
                    description: 'Assignee username (optional)'
                  }
                },
                required: ['projectKey', 'issueType', 'summary']
              }
            },
            {
              name: 'update_issue',
              description: 'Update a Jira issue',
              inputSchema: {
                type: 'object',
                properties: {
                  issueKey: {
                    type: 'string',
                    description: 'Issue key (e.g., PROJ-123)'
                  },
                  fields: {
                    type: 'object',
                    description: 'Fields to update (JSON object)'
                  }
                },
                required: ['issueKey', 'fields']
              }
            },
            {
              name: 'get_issue_types',
              description: 'Get available issue types',
              inputSchema: {
                type: 'object',
                properties: {
                  projectKey: {
                    type: 'string',
                    description: 'Project key (optional)'
                  }
                }
              }
            },
            {
              name: 'add_comment',
              description: 'Add a comment to a Jira issue',
              inputSchema: {
                type: 'object',
                properties: {
                  issueKey: {
                    type: 'string',
                    description: 'Issue key (e.g., PROJ-123)'
                  },
                  comment: {
                    type: 'string',
                    description: 'Comment text'
                  }
                },
                required: ['issueKey', 'comment']
              }
            }
          ]
        };

      case 'tools/call':
        return await this.handleToolCall(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  async handleToolCall(params) {
    const { name, arguments: args = {} } = params;

    try {
      switch (name) {
        case 'get_projects':
          const projects = await this.getProjects();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(projects, null, 2)
              }
            ]
          };

        case 'get_issue':
          const issue = await this.getIssue(args.issueKey);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(issue, null, 2)
              }
            ]
          };

        case 'search_issues':
          const searchResults = await this.searchIssues(args.jql, args.maxResults);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(searchResults, null, 2)
              }
            ]
          };

        case 'create_issue':
          const newIssue = await this.createIssue(
            args.projectKey,
            args.issueType,
            args.summary,
            args.description,
            args.assignee
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(newIssue, null, 2)
              }
            ]
          };

        case 'update_issue':
          const updateResult = await this.updateIssue(args.issueKey, args.fields);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(updateResult, null, 2)
              }
            ]
          };

        case 'get_issue_types':
          const issueTypes = await this.getIssueTypes(args.projectKey);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(issueTypes, null, 2)
              }
            ]
          };

        case 'add_comment':
          const comment = await this.addComment(args.issueKey, args.comment);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(comment, null, 2)
              }
            ]
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  }

  async start() {
    console.error('Jira MCP Server with Bearer Token running on stdio');

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', async (data) => {
      try {
        const lines = data.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;

          const request = JSON.parse(line);
          const response = await this.handleRequest(request);

          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: response
          }));
        }
      } catch (error) {
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: error.message
          }
        }));
      }
    });
  }
}

// Start the server
const server = new JiraMCP();
server.start();
