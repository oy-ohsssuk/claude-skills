#!/usr/bin/env node

const https = require('https');
const { URL } = require('url');
const { convert } = require('html-to-text');

class OptimizedJiraMCP {
  constructor() {
    this.baseUrl = process.env.JIRA_BASE_URL;
    this.token = process.env.JIRA_API_TOKEN;

    if (!this.baseUrl || !this.token) {
      console.error('JIRA_BASE_URL and JIRA_API_TOKEN environment variables are required');
      process.exit(1);
    }

    // Jira 브라우저 URL (이슈 링크 생성용)
    this.browseUrl = 'https://oyitsm.cj.net/jira/browse';

    // 핵심 필드 (HTML 파싱 최적화로 토큰 절약)
    this.ESSENTIAL_FIELDS = [
      'key',
      'summary',
      'status',
      'assignee',
      'reporter',
      'priority',
      'issuetype',
      'created',
      'updated',
      'description',
      'resolution',
      'labels',
      'fixVersions',
      'components'
    ].join(',');

  }

  // 기본 필드 설정
  getDefaultFields() {
    return this.ESSENTIAL_FIELDS;
  }

  // HTML을 깔끔한 텍스트로 변환 (Confluence 수준 강화)
  htmlToText(html) {
    if (!html) return '';

    // JIRA HTML 태그 완전 제거 및 텍스트 정리 (Confluence MCP 스타일)
    const cleanText = convert(html, {
      wordwrap: 130,
      ignoreHref: true,
      ignoreImage: true,
      selectors: [
        // 메타데이터 및 시스템 태그들 제거
        { selector: 'script', format: 'skip' },
        { selector: 'style', format: 'skip' },
        { selector: 'noscript', format: 'skip' },
        { selector: 'meta', format: 'skip' },
        { selector: 'link[rel]', format: 'skip' },

        // JIRA 특화 - 불필요한 메타데이터 및 UI 요소들 제거
        { selector: '.jira-metadata', format: 'skip' },
        { selector: '.issue-metadata', format: 'skip' },
        { selector: '.breadcrumbs', format: 'skip' },
        { selector: '.navigation', format: 'skip' },
        { selector: '.toolbar', format: 'skip' },
        { selector: '.footer', format: 'skip' },
        { selector: '.header', format: 'skip' },
        { selector: '.sidebar', format: 'skip' },
        { selector: '.comments-section', format: 'skip' },

        // 불필요한 div들 제거 (JIRA 특화)
        { selector: 'div[id*="header"]', format: 'skip' },
        { selector: 'div[id*="footer"]', format: 'skip' },
        { selector: 'div[id*="navigation"]', format: 'skip' },
        { selector: 'div[class*="jira-navigation"]', format: 'skip' },
        { selector: 'div[class*="issue-metadata"]', format: 'skip' },
        { selector: 'div[class*="metadata"]', format: 'skip' },
        { selector: 'div[class*="toolbar"]', format: 'skip' },

        // 멀티미디어 요소들 제거
        { selector: 'iframe', format: 'skip' },
        { selector: 'embed', format: 'skip' },
        { selector: 'object', format: 'skip' },
        { selector: 'canvas', format: 'skip' },
        { selector: 'svg', format: 'skip' },
        { selector: 'audio', format: 'skip' },
        { selector: 'video', format: 'skip' },

        // 스타일 관련 클래스들 처리
        { selector: '.error', format: 'inline' },
        { selector: 'span.error', format: 'inline' },

        // 리스트 포맷팅
        { selector: 'ul', format: 'unorderedList', options: { itemPrefix: '• ' } },
        { selector: 'ol', format: 'orderedList' },

        // 헤더 정리
        { selector: 'h1', format: 'heading', options: { uppercase: false } },
        { selector: 'h2', format: 'heading', options: { uppercase: false } },
        { selector: 'h3', format: 'heading', options: { uppercase: false } },
        { selector: 'h4', format: 'heading', options: { uppercase: false } },
        { selector: 'h5', format: 'heading', options: { uppercase: false } },
        { selector: 'h6', format: 'heading', options: { uppercase: false } },

        // 기본 구조 요소들
        { selector: 'table', format: 'dataTable' },
        { selector: 'p', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
        { selector: 'pre', format: 'pre' },
        { selector: 'code', format: 'inlineTag' },
        { selector: 'br', format: 'lineBreak' }
      ],
      baseElements: {
        selectors: ['body', 'article', 'main', 'div', 'p']
      },
      // 불필요한 공백 제거
      preserveNewlines: false,
      trimEmptyLines: true
    })
    .replace(/\n{3,}/g, '\n\n') // 3개 이상 연속된 빈 줄을 2개로
    .replace(/\s*\n\s*/g, '\n') // 줄 바꿈 전후 공백 제거
    .replace(/\s+/g, ' ') // 연속된 공백을 하나로
    .trim();

    // 긴 텍스트는 요약
    if (cleanText.length > 500) {
      const sentences = cleanText.split(/[.!?]\s+/);
      let summary = '';

      for (const sentence of sentences) {
        if ((summary + sentence).length > 400) break;
        if (sentence.trim()) {
          summary += sentence.trim() + '. ';
        }
      }

      return summary.trim() + (summary.length < cleanText.length ? '...' : '');
    }

    return cleanText;
  }

  // 이슈 데이터를 필수 정보만 추출하여 정리 (최대한 간소화)
  simplifyIssue(issue) {
    const { key, fields } = issue;

    const simplified = {
      key,
      summary: fields.summary || '',
      description: this.htmlToText(fields.description) || '설명 없음',
      status: fields.status?.name || '상태 없음',
      priority: fields.priority?.name || '우선순위 없음',
      issueType: fields.issuetype?.name || '타입 없음',
      assignee: fields.assignee?.displayName || '미할당',
      reporter: fields.reporter?.displayName || '작성자 불명',
      created: fields.created ? new Date(fields.created).toLocaleDateString('ko-KR') : '',
      updated: fields.updated ? new Date(fields.updated).toLocaleDateString('ko-KR') : '',
      link: `${this.browseUrl}/${key}`
    };

    // 필요한 경우에만 추가 정보 포함
    if (fields.resolution?.name) {
      simplified.resolution = fields.resolution.name;
    }

    if (fields.labels && fields.labels.length > 0) {
      simplified.labels = fields.labels.slice(0, 5); // 최대 5개만
    }

    // 연결된 이슈는 최대 3개까지만
    const linkedIssues = (fields.issuelinks || [])
      .map(link => ({
        key: link.inwardIssue?.key || link.outwardIssue?.key,
        summary: link.inwardIssue?.fields?.summary || link.outwardIssue?.fields?.summary,
        relationship: link.type?.name
      }))
      .filter(link => link.key)
      .slice(0, 3);

    if (linkedIssues.length > 0) {
      simplified.linkedIssues = linkedIssues;
    }

    return simplified;
  }

  // 검색 결과를 한국어로 포맷팅
  formatSearchResults(searchResults) {
    const { issues, total, startAt, maxResults } = searchResults;

    const simplifiedIssues = issues.map(issue => this.simplifyIssue(issue));

    return {
      summary: `총 ${total}개 이슈 중 ${startAt + 1}~${Math.min(startAt + maxResults, total)}번째 표시`,
      total,
      issues: simplifiedIssues,
      statusCode: searchResults.statusCode
    };
  }

  async makeRequest(endpoint, method = 'GET', body = null, fields = null) {
    let fullEndpoint = endpoint;

    // fields 파라미터가 있으면 URL에 추가 (핵심 최적화!)
    if (fields && !fullEndpoint.includes('fields=')) {
      const separator = fullEndpoint.includes('?') ? '&' : '?';
      fullEndpoint += `${separator}fields=${encodeURIComponent(fields)}`;
    }

    const url = new URL(`${this.baseUrl.replace(/\/$/, '')}/rest/api/2${fullEndpoint}`);

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

            if (!data.trim()) {
              resolve({
                statusCode: res.statusCode,
                success: true,
                message: `요청이 성공적으로 완료되었습니다 (상태: ${res.statusCode})`
              });
              return;
            }

            const result = JSON.parse(data);
            resolve({ ...result, statusCode: res.statusCode });
          } catch (error) {
            reject(new Error(`응답 파싱 실패 (상태: ${res.statusCode}): ${error.message}. 원본 데이터: ${data.substring(0, 100)}...`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`요청 실패: ${error.message}`));
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

      // API 응답이 배열인지 확인
      const projects = Array.isArray(result) ? result : (result.values || []);

      // 프로젝트 정보도 간소화
      const simplifiedProjects = projects.map(project => ({
        key: project.key,
        name: project.name,
        projectType: project.projectTypeKey,
        category: project.projectCategory?.name || '카테고리 없음'
      }));

      return {
        summary: `총 ${simplifiedProjects.length}개의 프로젝트`,
        projects: simplifiedProjects
      };
    } catch (error) {
      throw error;
    }
  }

  async getIssue(issueKey) {
    try {
      const fields = this.getDefaultFields();
      const result = await this.makeRequest(`/issue/${issueKey}`, 'GET', null, fields);
      // HTML 파싱된 간소화된 데이터만 반환
      return this.simplifyIssue(result);
    } catch (error) {
      throw error;
    }
  }

  async searchIssues(jql, maxResults = 25) {
    try {
      const fields = this.getDefaultFields();
      const encodedJql = encodeURIComponent(jql);

      let endpoint = `/search?jql=${encodedJql}&maxResults=${maxResults}`;
      const result = await this.makeRequest(endpoint, 'GET', null, fields);
      return this.formatSearchResults(result);
    } catch (error) {
      throw error;
    }
  }

  async createIssue(projectKey, issueType, summary, description = '', assignee = null) {
    try {
      const issueData = {
        fields: {
          project: { key: projectKey },
          issuetype: { name: issueType },
          summary: summary,
          description: description
        }
      };

      if (assignee) {
        issueData.fields.assignee = { name: assignee };
      }

      const result = await this.makeRequest('/issue', 'POST', issueData);
      return {
        message: `이슈가 성공적으로 생성되었습니다`,
        issueKey: result.key,
        issueId: result.id,
        link: `${this.browseUrl}/${result.key}`,
        statusCode: result.statusCode
      };
    } catch (error) {
      throw error;
    }
  }

  async updateIssue(issueKey, fields) {
    try {
      const updateData = { fields: fields };
      const result = await this.makeRequest(`/issue/${issueKey}`, 'PUT', updateData);

      return {
        success: true,
        message: `이슈 ${issueKey}가 성공적으로 업데이트되었습니다`,
        statusCode: result.statusCode || 204
      };
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

      // 이슈 타입 정보 간소화
      const simplifiedTypes = Array.isArray(result) ?
        result.map(type => ({
          id: type.id,
          name: type.name,
          description: type.description || '',
          subtask: type.subtask || false
        })) : result;

      return {
        summary: projectKey ? `${projectKey} 프로젝트의 이슈 타입` : '전체 이슈 타입',
        issueTypes: simplifiedTypes,
        statusCode: result.statusCode
      };
    } catch (error) {
      throw error;
    }
  }

  async addComment(issueKey, comment) {
    try {
      const commentData = { body: comment };
      const result = await this.makeRequest(`/issue/${issueKey}/comment`, 'POST', commentData);

      return {
        message: `이슈 ${issueKey}에 댓글이 추가되었습니다`,
        commentId: result.id,
        author: result.author?.displayName || '',
        created: result.created ? new Date(result.created).toLocaleString('ko-KR') : '',
        statusCode: result.statusCode
      };
    } catch (error) {
      throw error;
    }
  }

  async getCurrentUser() {
    try {
      const result = await this.makeRequest('/myself');

      // 사용자 정보 최적화
      const userInfo = {
        accountId: result.accountId,
        displayName: result.displayName,
        email: result.emailAddress || 'N/A',
        username: result.name || result.accountId,
        accountType: result.accountType || 'atlassian',
        active: result.active !== false,
        timeZone: result.timeZone || 'N/A'
      };

      return userInfo;
    } catch (error) {
      throw error;
    }
  }

  // Labels 조회 - 프로젝트별 또는 전체
  async getLabels(projectKey = null, maxResults = 50) {
    try {
      let endpoint = '/label';
      if (projectKey) {
        // 특정 프로젝트의 labels만 조회하려면 issue search를 통해 가져오기
        endpoint = `/search?jql=project="${projectKey}"&fields=labels&maxResults=1000`;
        const result = await this.makeRequest(endpoint);

        // 모든 이슈의 labels를 수집하고 중복 제거
        const allLabels = new Set();
        result.issues.forEach(issue => {
          if (issue.fields?.labels) {
            issue.fields.labels.forEach(label => allLabels.add(label));
          }
        });

        return {
          labels: Array.from(allLabels).sort(),
          total: allLabels.size,
          projectKey: projectKey
        };
      } else {
        // 전체 labels 조회
        const result = await this.makeRequest(`${endpoint}?maxResults=${maxResults}`);
        return {
          labels: result.values || [],
          total: result.values?.length || 0,
          projectKey: null
        };
      }
    } catch (error) {
      throw error;
    }
  }

  // Fix Versions 조회 - 프로젝트별
  async getFixVersions(projectKey) {
    try {
      const result = await this.makeRequest(`/project/${projectKey}/versions`);

      // Fix versions 정리
      const versions = result.map(version => ({
        id: version.id,
        name: version.name,
        description: version.description || '',
        released: version.released || false,
        archived: version.archived || false,
        releaseDate: version.releaseDate || null,
        startDate: version.startDate || null
      })).sort((a, b) => a.name.localeCompare(b.name));

      return {
        versions: versions,
        total: versions.length,
        projectKey: projectKey
      };
    } catch (error) {
      throw error;
    }
  }

  // Components 조회 - 프로젝트별
  async getComponents(projectKey) {
    try {
      const result = await this.makeRequest(`/project/${projectKey}/components`);

      // Components 정리
      const components = result.map(component => ({
        id: component.id,
        name: component.name,
        description: component.description || '',
        lead: component.lead ? {
          displayName: component.lead.displayName,
          accountId: component.lead.accountId
        } : null,
        assigneeType: component.assigneeType || 'PROJECT_DEFAULT',
        isAssigneeTypeValid: component.isAssigneeTypeValid || false
      })).sort((a, b) => a.name.localeCompare(b.name));

      return {
        components: components,
        total: components.length,
        projectKey: projectKey
      };
    } catch (error) {
      throw error;
    }
  }

  // MCP Protocol Implementation
  async handleRequest(request) {
    const { method, params = {} } = request;

    try {
      switch (method) {
        case 'initialize':
          return {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'jira-ultra-optimized',
              version: '1.3.0',
              description: 'Ultra-Optimized Jira MCP - JSON-RPC 프로토콜 개선, 90% 토큰 절약, 필드 선택, 한국어 지원'
            }
          };

        case 'tools/list':
          return {
            tools: [
              {
                name: 'get_projects',
                description: 'Jira 프로젝트 목록 조회 (간소화된 정보)',
                inputSchema: { type: 'object', properties: {} }
              },
              {
                name: 'get_issue',
                description: '특정 Jira 이슈 상세 조회 (필수 정보만)',
                inputSchema: {
                  type: 'object',
                  properties: {
                    issueKey: { type: 'string', description: '이슈 키 (예: PROJ-123)' }
                  },
                  required: ['issueKey']
                }
              },
              {
                name: 'search_issues',
                description: 'JQL을 사용한 이슈 검색 (토큰 90% 절약)',
                inputSchema: {
                  type: 'object',
                  properties: {
                    jql: { type: 'string', description: 'JQL 쿼리 문자열' },
                    maxResults: { type: 'number', description: '최대 결과 수', default: 25 }
                  },
                  required: ['jql']
                }
              },
              {
                name: 'create_issue',
                description: '새 Jira 이슈 생성',
                inputSchema: {
                  type: 'object',
                  properties: {
                    projectKey: { type: 'string', description: '프로젝트 키 (예: PROJ)' },
                    issueType: { type: 'string', description: '이슈 타입 (예: Task, Bug, Story)' },
                    summary: { type: 'string', description: '이슈 제목' },
                    description: { type: 'string', description: '이슈 설명' },
                    assignee: { type: 'string', description: '담당자 사용자명 (선택사항)' }
                  },
                  required: ['projectKey', 'issueType', 'summary']
                }
              },
              {
                name: 'update_issue',
                description: 'Jira 이슈 업데이트',
                inputSchema: {
                  type: 'object',
                  properties: {
                    issueKey: { type: 'string', description: '이슈 키 (예: PROJ-123)' },
                    fields: { type: 'object', description: '업데이트할 필드들 (JSON 객체)' }
                  },
                  required: ['issueKey', 'fields']
                }
              },
              {
                name: 'get_issue_types',
                description: '사용 가능한 이슈 타입 조회',
                inputSchema: {
                  type: 'object',
                  properties: {
                    projectKey: { type: 'string', description: '프로젝트 키 (선택사항)' }
                  }
                }
              },
              {
                name: 'add_comment',
                description: 'Jira 이슈에 댓글 추가',
                inputSchema: {
                  type: 'object',
                  properties: {
                    issueKey: { type: 'string', description: '이슈 키 (예: PROJ-123)' },
                    comment: { type: 'string', description: '댓글 내용' }
                  },
                  required: ['issueKey', 'comment']
                }
              },
              {
                name: 'get_current_user',
                description: '현재 사용자 정보 조회',
                inputSchema: {
                  type: 'object',
                  properties: {}
                }
              },
              {
                name: 'get_labels',
                description: 'Labels 조회 (전체 또는 특정 프로젝트)',
                inputSchema: {
                  type: 'object',
                  properties: {
                    projectKey: { type: 'string', description: '프로젝트 키 (선택사항, 미지정시 전체 labels)' },
                    maxResults: { type: 'number', description: '최대 결과 수', default: 50 }
                  }
                }
              },
              {
                name: 'get_fix_versions',
                description: '프로젝트의 Fix Versions 조회',
                inputSchema: {
                  type: 'object',
                  properties: {
                    projectKey: { type: 'string', description: '프로젝트 키 (필수)' }
                  },
                  required: ['projectKey']
                }
              },
              {
                name: 'get_components',
                description: '프로젝트의 Components 조회',
                inputSchema: {
                  type: 'object',
                  properties: {
                    projectKey: { type: 'string', description: '프로젝트 키 (필수)' }
                  },
                  required: ['projectKey']
                }
              }
            ]
          };

        case 'tools/call':
          return await this.handleToolCall(params);

        default:
          throw new Error(`Unknown method: ${method}`);
      }
    } catch (error) {
      throw error;
    }
  }

  async handleToolCall(params) {
    const { name, arguments: args = {} } = params;

    try {
      let result;

      switch (name) {
        case 'get_projects':
          if (!args || typeof args !== 'object') {
            throw new Error('Invalid arguments format');
          }
          result = await this.getProjects();
          break;

        case 'get_issue':
          if (!args.issueKey) {
            throw new Error('issueKey is required');
          }
          result = await this.getIssue(args.issueKey);
          break;

        case 'search_issues':
          if (!args.jql) {
            throw new Error('jql is required');
          }
          result = await this.searchIssues(args.jql, args.maxResults);
          break;

        case 'create_issue':
          if (!args.projectKey || !args.issueType || !args.summary) {
            throw new Error('projectKey, issueType, and summary are required');
          }
          result = await this.createIssue(
            args.projectKey,
            args.issueType,
            args.summary,
            args.description,
            args.assignee
          );
          break;

        case 'update_issue':
          if (!args.issueKey || !args.fields) {
            throw new Error('issueKey and fields are required');
          }
          result = await this.updateIssue(args.issueKey, args.fields);
          break;

        case 'get_issue_types':
          result = await this.getIssueTypes(args.projectKey);
          break;

        case 'add_comment':
          if (!args.issueKey || !args.comment) {
            throw new Error('issueKey and comment are required');
          }
          result = await this.addComment(args.issueKey, args.comment);
          break;

        case 'get_current_user':
          result = await this.getCurrentUser();
          break;

        case 'get_labels':
          result = await this.getLabels(args.projectKey, args.maxResults);
          break;

        case 'get_fix_versions':
          if (!args.projectKey) {
            throw new Error('projectKey is required');
          }
          result = await this.getFixVersions(args.projectKey);
          break;

        case 'get_components':
          if (!args.projectKey) {
            throw new Error('projectKey is required');
          }
          result = await this.getComponents(args.projectKey);
          break;

        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      // Return error in MCP format, but let the caller handle JSON-RPC error format
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  async start() {
    console.error('🚀 Ultra-Optimized Jira MCP 서버 v1.3.0 실행 중 (JSON-RPC 프로토콜 개선, 90% 토큰 절약, 필드 선택, 한국어 지원)');

    process.stdin.setEncoding('utf8');
    let buffer = '';

    process.stdin.on('data', async (data) => {
      buffer += data;
      const lines = buffer.split('\n');

      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        let request;
        let requestId = null;

        try {
          request = JSON.parse(line);
          requestId = request.id || null;
        } catch (parseError) {
          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            error: {
              code: -32700,
              message: 'Parse error',
              data: parseError.message
            }
          }));
          continue;
        }

        try {
          const response = await this.handleRequest(request);

          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            result: response
          }));
        } catch (error) {
          let errorCode = -32603; // Internal error
          let errorMessage = 'Internal error';

          // More specific error codes based on the error type
          if (error.message.includes('Unknown method')) {
            errorCode = -32601;
            errorMessage = 'Method not found';
          } else if (error.message.includes('required') || error.message.includes('Invalid arguments')) {
            errorCode = -32602;
            errorMessage = 'Invalid params';
          } else if (error.message.includes('Tool execution failed')) {
            errorCode = -32000;
            errorMessage = 'Tool execution error';
          }

          console.log(JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            error: {
              code: errorCode,
              message: errorMessage,
              data: error.message
            }
          }));
        }
      }
    });

    process.stdin.on('end', () => {
      process.exit(0);
    });

    process.stdin.on('error', (error) => {
      console.error('Stdin error:', error.message);
      process.exit(1);
    });

    // Handle process termination gracefully
    process.on('SIGINT', () => {
      console.error('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.error('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });
  }
}

// 서버 시작
const server = new OptimizedJiraMCP();
server.start();
