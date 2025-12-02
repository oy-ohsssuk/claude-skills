#!/usr/bin/env node

const https = require('https');
const { URL } = require('url');

class ConfluenceEnhancedMCP {
  constructor() {
    this.baseUrl = process.env.CONFLUENCE_BASE_URL;
    this.token = process.env.CONFLUENCE_API_TOKEN;

    if (!this.baseUrl || !this.token) {
      console.error('CONFLUENCE_BASE_URL and CONFLUENCE_API_TOKEN environment variables are required');
      process.exit(1);
    }
  }

  async makeRequest(endpoint, method = 'GET', body = null) {
    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/rest/api${endpoint}`);

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
              reject(new Error(`Confluence API Error: ${res.statusCode} - ${data}`));
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

  // 기존 기능들
  async getSpaces(limit = 25) {
    try {
      const result = await this.makeRequest(`/space?limit=${limit}`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async getPage(pageId, expand = 'body.storage,version,space,ancestors') {
    try {
      let result;
      try {
        result = await this.makeRequest(`/content/${pageId}?expand=${expand}`);
      } catch (expandError) {
        console.error('Expand failed, trying without expand:', expandError.message);
        result = await this.makeRequest(`/content/${pageId}`);
      }
      return result;
    } catch (error) {
      throw error;
    }
  }

  async searchPages(query, limit = 10) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const result = await this.makeRequest(`/content/search?cql=${encodedQuery}&limit=${limit}`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  async createPage(spaceKey, title, content, parentPageId = null) {
    try {
      const pageData = {
        type: 'page',
        title: title,
        space: {
          key: spaceKey
        },
        body: {
          storage: {
            value: content,
            representation: 'storage'
          }
        }
      };

      if (parentPageId) {
        pageData.ancestors = [{
          id: parentPageId
        }];
      }

      const result = await this.makeRequest('/content', 'POST', pageData);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 새로운 유용한 기능들

  // 페이지 업데이트
  async updatePage(pageId, title, content, version) {
    try {
      const updateData = {
        id: pageId,
        type: 'page',
        title: title,
        body: {
          storage: {
            value: content,
            representation: 'storage'
          }
        },
        version: {
          number: version + 1
        }
      };

      const result = await this.makeRequest(`/content/${pageId}`, 'PUT', updateData);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지 삭제
  async deletePage(pageId) {
    try {
      const result = await this.makeRequest(`/content/${pageId}`, 'DELETE');
      return { success: true, message: `Page ${pageId} deleted successfully` };
    } catch (error) {
      throw error;
    }
  }

  // 페이지 히스토리
  async getPageHistory(pageId, limit = 10) {
    try {
      const result = await this.makeRequest(`/content/${pageId}/history?limit=${limit}`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지 자식들 조회
  async getChildPages(pageId, limit = 25) {
    try {
      const result = await this.makeRequest(`/content/${pageId}/child/page?limit=${limit}`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지 댓글 조회
  async getPageComments(pageId, limit = 25) {
    try {
      const result = await this.makeRequest(`/content/${pageId}/child/comment?limit=${limit}&expand=body.storage,version`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지에 댓글 추가
  async addPageComment(pageId, comment) {
    try {
      const commentData = {
        type: 'comment',
        container: {
          id: pageId
        },
        body: {
          storage: {
            value: comment,
            representation: 'storage'
          }
        }
      };

      const result = await this.makeRequest('/content', 'POST', commentData);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 스페이스의 모든 페이지 조회
  async getSpacePages(spaceKey, limit = 50, start = 0) {
    try {
      const result = await this.makeRequest(`/content?spaceKey=${spaceKey}&limit=${limit}&start=${start}&expand=space,version`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지 라벨 조회
  async getPageLabels(pageId) {
    try {
      const result = await this.makeRequest(`/content/${pageId}/label`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지에 라벨 추가
  async addPageLabel(pageId, labels) {
    try {
      const labelData = labels.map(label => ({ name: label }));
      const result = await this.makeRequest(`/content/${pageId}/label`, 'POST', labelData);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지 첨부파일 조회
  async getPageAttachments(pageId, limit = 25) {
    try {
      const result = await this.makeRequest(`/content/${pageId}/child/attachment?limit=${limit}&expand=version`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 최근 업데이트된 페이지들
  async getRecentPages(spaceKey = null, limit = 25) {
    try {
      let cql = `type=page AND lastModified >= -30d order by lastModified desc`;
      if (spaceKey) {
        cql = `space=${spaceKey} AND ${cql}`;
      }
      const result = await this.searchPages(cql, limit);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 내가 생성한 페이지들
  async getMyPages(spaceKey = null, limit = 25) {
    try {
      let cql = `type=page AND creator=currentUser() order by created desc`;
      if (spaceKey) {
        cql = `space=${spaceKey} AND ${cql}`;
      }
      const result = await this.searchPages(cql, limit);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 특정 라벨이 있는 페이지들
  async getPagesByLabel(label, spaceKey = null, limit = 25) {
    try {
      let cql = `type=page AND label="${label}" order by lastModified desc`;
      if (spaceKey) {
        cql = `space=${spaceKey} AND ${cql}`;
      }
      const result = await this.searchPages(cql, limit);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 페이지 템플릿 조회
  async getPageTemplates(spaceKey) {
    try {
      const result = await this.makeRequest(`/template?spaceKey=${spaceKey}&expand=body.storage`);
      return result;
    } catch (error) {
      throw error;
    }
  }

  // 스페이스 정보 상세 조회
  async getSpaceDetails(spaceKey) {
    try {
      const result = await this.makeRequest(`/space/${spaceKey}?expand=permissions,homepage,description.plain`);
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
            name: 'confluence-enhanced',
            version: '2.0.0'
          }
        };

      case 'tools/list':
        return {
          tools: [
            // 기존 도구들
            {
              name: 'get_spaces',
              description: 'Get Confluence spaces',
              inputSchema: {
                type: 'object',
                properties: {
                  limit: {
                    type: 'number',
                    description: 'Maximum number of spaces to return',
                    default: 25
                  }
                }
              }
            },
            {
              name: 'get_page',
              description: 'Get a Confluence page by ID',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page to retrieve'
                  },
                  expand: {
                    type: 'string',
                    description: 'Expand options (default: body.storage,version,space,ancestors)',
                    default: 'body.storage,version,space,ancestors'
                  }
                },
                required: ['pageId']
              }
            },
            {
              name: 'search_pages',
              description: 'Search Confluence pages using CQL',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'CQL query string'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of results',
                    default: 10
                  }
                },
                required: ['query']
              }
            },
            {
              name: 'create_page',
              description: 'Create a new Confluence page',
              inputSchema: {
                type: 'object',
                properties: {
                  spaceKey: {
                    type: 'string',
                    description: 'Space key where to create the page'
                  },
                  title: {
                    type: 'string',
                    description: 'Title of the new page'
                  },
                  content: {
                    type: 'string',
                    description: 'HTML content of the page (storage format)'
                  },
                  parentPageId: {
                    type: 'string',
                    description: 'ID of parent page (optional)'
                  }
                },
                required: ['spaceKey', 'title', 'content']
              }
            },
            // 새로운 도구들
            {
              name: 'update_page',
              description: 'Update an existing Confluence page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page to update'
                  },
                  title: {
                    type: 'string',
                    description: 'New title of the page'
                  },
                  content: {
                    type: 'string',
                    description: 'New HTML content of the page (storage format)'
                  },
                  version: {
                    type: 'number',
                    description: 'Current version number of the page'
                  }
                },
                required: ['pageId', 'title', 'content', 'version']
              }
            },
            {
              name: 'delete_page',
              description: 'Delete a Confluence page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page to delete'
                  }
                },
                required: ['pageId']
              }
            },
            {
              name: 'get_page_history',
              description: 'Get page version history',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of versions to return',
                    default: 10
                  }
                },
                required: ['pageId']
              }
            },
            {
              name: 'get_child_pages',
              description: 'Get child pages of a page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the parent page'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of child pages to return',
                    default: 25
                  }
                },
                required: ['pageId']
              }
            },
            {
              name: 'get_page_comments',
              description: 'Get comments on a page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of comments to return',
                    default: 25
                  }
                },
                required: ['pageId']
              }
            },
            {
              name: 'add_page_comment',
              description: 'Add a comment to a page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page'
                  },
                  comment: {
                    type: 'string',
                    description: 'Comment content (HTML format)'
                  }
                },
                required: ['pageId', 'comment']
              }
            },
            {
              name: 'get_space_pages',
              description: 'Get all pages in a space',
              inputSchema: {
                type: 'object',
                properties: {
                  spaceKey: {
                    type: 'string',
                    description: 'Space key'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of pages to return',
                    default: 50
                  },
                  start: {
                    type: 'number',
                    description: 'Start index for pagination',
                    default: 0
                  }
                },
                required: ['spaceKey']
              }
            },
            {
              name: 'get_page_labels',
              description: 'Get labels on a page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page'
                  }
                },
                required: ['pageId']
              }
            },
            {
              name: 'add_page_label',
              description: 'Add labels to a page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page'
                  },
                  labels: {
                    type: 'array',
                    items: {
                      type: 'string'
                    },
                    description: 'Array of label names to add'
                  }
                },
                required: ['pageId', 'labels']
              }
            },
            {
              name: 'get_page_attachments',
              description: 'Get attachments on a page',
              inputSchema: {
                type: 'object',
                properties: {
                  pageId: {
                    type: 'string',
                    description: 'ID of the page'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of attachments to return',
                    default: 25
                  }
                },
                required: ['pageId']
              }
            },
            {
              name: 'get_recent_pages',
              description: 'Get recently modified pages',
              inputSchema: {
                type: 'object',
                properties: {
                  spaceKey: {
                    type: 'string',
                    description: 'Space key (optional, if not provided will search all spaces)'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of pages to return',
                    default: 25
                  }
                }
              }
            },
            {
              name: 'get_my_pages',
              description: 'Get pages created by current user',
              inputSchema: {
                type: 'object',
                properties: {
                  spaceKey: {
                    type: 'string',
                    description: 'Space key (optional, if not provided will search all spaces)'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of pages to return',
                    default: 25
                  }
                }
              }
            },
            {
              name: 'get_pages_by_label',
              description: 'Get pages with specific label',
              inputSchema: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'Label name to search for'
                  },
                  spaceKey: {
                    type: 'string',
                    description: 'Space key (optional, if not provided will search all spaces)'
                  },
                  limit: {
                    type: 'number',
                    description: 'Maximum number of pages to return',
                    default: 25
                  }
                },
                required: ['label']
              }
            },
            {
              name: 'get_page_templates',
              description: 'Get page templates in a space',
              inputSchema: {
                type: 'object',
                properties: {
                  spaceKey: {
                    type: 'string',
                    description: 'Space key'
                  }
                },
                required: ['spaceKey']
              }
            },
            {
              name: 'get_space_details',
              description: 'Get detailed information about a space',
              inputSchema: {
                type: 'object',
                properties: {
                  spaceKey: {
                    type: 'string',
                    description: 'Space key'
                  }
                },
                required: ['spaceKey']
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
        // 기존 기능들
        case 'get_spaces':
          const spaces = await this.getSpaces(args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(spaces, null, 2)
              }
            ]
          };

        case 'get_page':
          const page = await this.getPage(args.pageId, args.expand);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(page, null, 2)
              }
            ]
          };

        case 'search_pages':
          const results = await this.searchPages(args.query, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2)
              }
            ]
          };

        case 'create_page':
          const newPage = await this.createPage(args.spaceKey, args.title, args.content, args.parentPageId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(newPage, null, 2)
              }
            ]
          };

        // 새로운 기능들
        case 'update_page':
          const updatedPage = await this.updatePage(args.pageId, args.title, args.content, args.version);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(updatedPage, null, 2)
              }
            ]
          };

        case 'delete_page':
          const deleteResult = await this.deletePage(args.pageId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(deleteResult, null, 2)
              }
            ]
          };

        case 'get_page_history':
          const history = await this.getPageHistory(args.pageId, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(history, null, 2)
              }
            ]
          };

        case 'get_child_pages':
          const childPages = await this.getChildPages(args.pageId, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(childPages, null, 2)
              }
            ]
          };

        case 'get_page_comments':
          const comments = await this.getPageComments(args.pageId, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(comments, null, 2)
              }
            ]
          };

        case 'add_page_comment':
          const newComment = await this.addPageComment(args.pageId, args.comment);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(newComment, null, 2)
              }
            ]
          };

        case 'get_space_pages':
          const spacePages = await this.getSpacePages(args.spaceKey, args.limit, args.start);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(spacePages, null, 2)
              }
            ]
          };

        case 'get_page_labels':
          const labels = await this.getPageLabels(args.pageId);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(labels, null, 2)
              }
            ]
          };

        case 'add_page_label':
          const labelResult = await this.addPageLabel(args.pageId, args.labels);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(labelResult, null, 2)
              }
            ]
          };

        case 'get_page_attachments':
          const attachments = await this.getPageAttachments(args.pageId, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(attachments, null, 2)
              }
            ]
          };

        case 'get_recent_pages':
          const recentPages = await this.getRecentPages(args.spaceKey, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(recentPages, null, 2)
              }
            ]
          };

        case 'get_my_pages':
          const myPages = await this.getMyPages(args.spaceKey, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(myPages, null, 2)
              }
            ]
          };

        case 'get_pages_by_label':
          const labeledPages = await this.getPagesByLabel(args.label, args.spaceKey, args.limit);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(labeledPages, null, 2)
              }
            ]
          };

        case 'get_page_templates':
          const templates = await this.getPageTemplates(args.spaceKey);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(templates, null, 2)
              }
            ]
          };

        case 'get_space_details':
          const spaceDetails = await this.getSpaceDetails(args.spaceKey);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(spaceDetails, null, 2)
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
    console.error('Confluence Enhanced MCP Server running on stdio');

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
const server = new ConfluenceEnhancedMCP();
server.start();
