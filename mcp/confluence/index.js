#!/usr/bin/env node

const https = require("https");
const { URL } = require("url");
const { convert } = require("html-to-text");

class ConfluenceOptimizedMCP {
  constructor() {
    this.baseUrl = process.env.CONFLUENCE_BASE_URL;
    this.token = process.env.CONFLUENCE_API_TOKEN;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5분 캐시

    // 성능 최적화를 위한 정규식 미리 컴파일
    this.regexPatterns = {
      confluenceTags: /<\/?(?:ac|ri):[^>]*>/gi,
      emptyTags: /<(\w+)\s*>\s*<\/\1>/gi,
      styleAttributes: /\s*(style|class|id)="[^"]*"/gi,
      dataAttributes: /\s*data-[^=]*="[^"]*"/gi,
      metaTags:
        /<(?:script|style|noscript|meta|link)[^>]*>.*?<\/(?:script|style|noscript|meta|link)>/gis,
      selfClosingMeta: /<(?:script|style|noscript|meta|link)[^>]*\/>/gi,
      multimedia:
        /<(?:iframe|embed|object|canvas|svg|audio|video)[^>]*>.*?<\/(?:iframe|embed|object|canvas|svg|audio|video)>/gis,
      selfClosingMultimedia:
        /<(?:iframe|embed|object|canvas|svg|audio|video)[^>]*\/>/gi,
      comments: /<!--.*?-->/gis,
      confluenceClasses:
        /<div[^>]*class="[^"]*confluence[^"]*"[^>]*>.*?<\/div>/gis,
      metadataSpans: /<span[^>]*class="[^"]*metadata[^"]*"[^>]*>.*?<\/span>/gis,
      multipleSpaces: /\s+/g,
      tagSpaces: />\s+</g,
      sentenceSplit: /[.!?]+\s+/,
      multipleNewlines: /\n{3,}/g,
      leadingTrailingSpaces: /^\s*\n|\n\s*$/g,
    };

    // HTML to text converter 설정 - 극도로 강화된 HTML 태그 제거
    this.htmlToTextOptions = {
      wordwrap: 130,
      ignoreHref: true,
      ignoreImage: true,
      selectors: [
        // Confluence 특수 태그들 처리 (JIRA, 링크는 이미 파싱됨)
        { selector: "ac\\:parameter", format: "skip" },
        { selector: "ac\\:rich-text-body", format: "skip" },
        { selector: "ac\\:inline-comment-marker", format: "skip" },
        { selector: "ac\\:image", format: "skip" },
        { selector: "ac\\:task-list", format: "skip" },
        { selector: "ac\\:task", format: "skip" },
        { selector: "ac\\:emoticon", format: "skip" },
        { selector: "ac\\:layout", format: "skip" },
        { selector: "ac\\:layout-section", format: "skip" },
        { selector: "ac\\:layout-cell", format: "skip" },
        { selector: "ri\\:attachment", format: "skip" },
        { selector: "ri\\:url", format: "skip" },
        { selector: "ri\\:space", format: "skip" },

        // 메타데이터 및 시스템 태그들 제거
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "noscript", format: "skip" },
        { selector: "meta", format: "skip" },
        { selector: "link[rel]", format: "skip" },

        // UI/UX 관련 불필요한 태그들 제거
        { selector: ".confluence-metadata", format: "skip" },
        { selector: ".page-metadata", format: "skip" },
        { selector: ".breadcrumbs", format: "skip" },
        { selector: ".navigation", format: "skip" },
        { selector: ".toolbar", format: "skip" },
        { selector: ".footer", format: "skip" },
        { selector: ".header", format: "skip" },
        { selector: ".sidebar", format: "skip" },
        { selector: ".comments-section", format: "skip" },
        { selector: ".page-tree", format: "skip" },
        { selector: ".space-tools", format: "skip" },

        // 불필요한 div들 제거 (특정 클래스/ID 기반)
        { selector: 'div[id*="header"]', format: "skip" },
        { selector: 'div[id*="footer"]', format: "skip" },
        { selector: 'div[id*="navigation"]', format: "skip" },
        { selector: 'div[class*="confluence-navigation"]', format: "skip" },
        { selector: 'div[class*="page-tree"]', format: "skip" },
        { selector: 'div[class*="space-navigation"]', format: "skip" },
        { selector: 'div[class*="metadata"]', format: "skip" },
        { selector: 'div[class*="toolbar"]', format: "skip" },

        // 기타 불필요한 요소들
        { selector: "iframe", format: "skip" },
        { selector: "embed", format: "skip" },
        { selector: "object", format: "skip" },
        { selector: "canvas", format: "skip" },
        { selector: "svg", format: "skip" },
        { selector: "audio", format: "skip" },
        { selector: "video", format: "skip" },

        // 중요한 구조만 유지 (순서 중요 - 가장 마지막에 위치)
        { selector: "h1", format: "heading", options: { uppercase: false } },
        { selector: "h2", format: "heading", options: { uppercase: false } },
        { selector: "h3", format: "heading", options: { uppercase: false } },
        { selector: "h4", format: "heading", options: { uppercase: false } },
        { selector: "h5", format: "heading", options: { uppercase: false } },
        { selector: "h6", format: "heading", options: { uppercase: false } },
        { selector: "ul", format: "unorderedList", options: { itemPrefix: "- " } },
        { selector: "ol", format: "orderedList" },
        { selector: "table", format: "dataTable" },
        { selector: "p", format: "paragraph" },
        { selector: "blockquote", format: "blockString" },
        { selector: "pre", format: "pre" },
        { selector: "code", format: "inlineTag" },
      ],
    };

    if (!this.baseUrl || !this.token) {
      console.error(
        "CONFLUENCE_BASE_URL and CONFLUENCE_API_TOKEN environment variables are required"
      );
      process.exit(1);
    }
  }

  // 캐시 관리
  getCacheKey(endpoint, params = {}) {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }

  setToCache(key, data) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
    });
  }

  // HTML 전처리 - JIRA, 날짜, 링크 정보 보존 후 불필요한 요소들 제거
  preprocessHtml(html) {
    if (!html) return "";

    let cleaned = html;

    // 1. JIRA 매크로 파싱 및 보존
    cleaned = this.parseJiraMacros(cleaned);

    // 2. 날짜 정보 파싱 및 보존
    cleaned = this.parseDateTimes(cleaned);

    // 3. 링크 정보 파싱 및 보존
    cleaned = this.parseLinks(cleaned);

    // 4. 나머지 불필요한 Confluence 태그들 제거
    cleaned = cleaned.replace(/<\/?(?:ac|ri):[^>]*>/gi, "");
    cleaned = cleaned.replace(this.regexPatterns.emptyTags, "");
    cleaned = cleaned.replace(this.regexPatterns.styleAttributes, "");
    cleaned = cleaned.replace(this.regexPatterns.dataAttributes, "");
    cleaned = cleaned.replace(this.regexPatterns.metaTags, "");
    cleaned = cleaned.replace(this.regexPatterns.selfClosingMeta, "");
    cleaned = cleaned.replace(this.regexPatterns.multimedia, "");
    cleaned = cleaned.replace(this.regexPatterns.selfClosingMultimedia, "");
    cleaned = cleaned.replace(this.regexPatterns.multipleSpaces, " ");
    cleaned = cleaned.replace(this.regexPatterns.tagSpaces, "><");

    return cleaned.trim();
  }

  // JIRA 매크로 파싱
  parseJiraMacros(html) {
    const jiraMacroRegex = /<ac:structured-macro[^>]*ac:name="jira"[^>]*>(.*?)<\/ac:structured-macro>/gis;

    return html.replace(jiraMacroRegex, (match, content) => {
      // key parameter 추출
      const keyMatch = content.match(/<ac:parameter[^>]*ac:name="key"[^>]*>([^<]+)<\/ac:parameter>/i);
      const serverIdMatch = content.match(/<ac:parameter[^>]*ac:name="serverId"[^>]*>([^<]+)<\/ac:parameter>/i);

      if (keyMatch) {
        const issueKey = keyMatch[1].trim();
        const serverId = serverIdMatch ? serverIdMatch[1].trim() : '';
        return `[JIRA: ${issueKey}${serverId ? ` (${serverId})` : ''}]`;
      }

      return '[JIRA Issue]';
    });
  }

  // 날짜 정보 파싱
  parseDateTimes(html) {
    const timeRegex = /<time[^>]*datetime="([^"]+)"[^>]*>([^<]*)<\/time>/gi;
    const selfClosingTimeRegex = /<time[^>]*datetime="([^"]+)"[^>]*\/>/gi;

    // 닫는 태그가 있는 time 요소
    html = html.replace(timeRegex, (match, datetime, content) => {
      const displayText = content.trim() || datetime;
      return `[Date: ${datetime}${displayText !== datetime ? ` (${displayText})` : ''}]`;
    });

    // 자체 닫는 time 요소
    html = html.replace(selfClosingTimeRegex, (match, datetime) => {
      return `[Date: ${datetime}]`;
    });

    return html;
  }

  // 링크 정보 파싱
  parseLinks(html) {
    // 페이지 링크 파싱
    const pageLinksRegex = /<ac:link[^>]*>(.*?)<ri:page[^>]*ri:content-title="([^"]+)"[^>]*\/>.*?<\/ac:link>/gis;
    html = html.replace(pageLinksRegex, (match, linkContent, pageTitle) => {
      return `[Link: ${pageTitle}]`;
    });

    // 사용자 링크 파싱
    const userLinksRegex = /<ac:link[^>]*>(.*?)<ri:user[^>]*ri:userkey="([^"]+)"[^>]*\/>(.*?)<ac:plain-text-link-body><!\[CDATA\[([^\]]+)\]\]><\/ac:plain-text-link-body>.*?<\/ac:link>/gis;
    html = html.replace(userLinksRegex, (match, beforeUser, userKey, afterUser, userName) => {
      return `[User: ${userName.trim()}]`;
    });

    // 더 간단한 사용자 링크 파싱
    const simpleUserLinksRegex = /<ri:user[^>]*ri:userkey="([^"]+)"[^>]*\/>/gi;
    html = html.replace(simpleUserLinksRegex, (match, userKey) => {
      return `[User: ${userKey}]`;
    });

    // 일반 ac:link 파싱 (위에서 처리되지 않은 것들)
    const generalLinksRegex = /<ac:link[^>]*>(.*?)<\/ac:link>/gis;
    html = html.replace(generalLinksRegex, (match, linkContent) => {
      // 링크 내용에서 텍스트만 추출
      const textContent = linkContent.replace(/<[^>]*>/g, '').trim();
      return textContent ? `[Link: ${textContent}]` : '[Link]';
    });

    return html;
  }

  // 텍스트 정리 (라이브러리 사용) - 전처리 추가, 길이 제한 없음
  cleanHtmlToText(html) {
    if (!html) return "";

    try {
      // HTML 전처리 먼저 수행
      const preprocessed = this.preprocessHtml(html);

      // HTML을 깨끗한 텍스트로 변환
      const cleanText = convert(preprocessed, this.htmlToTextOptions);

      return cleanText;
    } catch (error) {
      console.error("HTML cleaning error:", error);
      return this.preprocessHtml(html)
        .replace(/<[^>]*>/g, "")
        .trim();
    }
  }

  // 응답 최적화 - 단순화
  optimizeResponse(data, options = {}) {
    const { fields = ["id", "title", "type", "status"], includeBody = false } =
      options;

    if (!data) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.optimizeResponse(item, options));
    }

    if (typeof data === "object") {
      const optimized = {};

      // 필수 필드만 포함
      fields.forEach((field) => {
        if (data[field] !== undefined) {
          optimized[field] = data[field];
        }
      });

      // body 처리 - HTML을 깨끗한 텍스트로 변환
      if (includeBody && data.body?.storage?.value) {
        const originalHtml = data.body.storage.value;
        optimized.body = {
          content: this.cleanHtmlToText(originalHtml),
          originalLength: originalHtml.length,
        };
      }

      // 최소한의 메타데이터
      if (data.version) {
        optimized.version = {
          number: data.version.number,
        };

        // 작성자 정보 포함
        if (data.version.by) {
          optimized.version.by = {
            displayName: data.version.by.displayName,
            username: data.version.by.username || data.version.by.userKey,
          };
        }

        // 수정 시간 포함
        if (data.version.when) {
          optimized.version.when = data.version.when;
        }
      }

      if (data._links?.webui) {
        optimized.webui = data._links.webui;
      }

      return optimized;
    }

    return data;
  }

  async makeRequest(endpoint, method = "GET", body = null) {
    const cacheKey = this.getCacheKey(endpoint, { method, body });

    // GET 요청만 캐시
    if (method === "GET") {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const url = new URL(
      `${this.baseUrl.replace(/\/$/, "")}/rest/api${endpoint}`
    );

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            if (res.statusCode >= 400) {
              reject(
                new Error(`Confluence API Error: ${res.statusCode} - ${data}`)
              );
              return;
            }

            const result = JSON.parse(data);

            // GET 요청 결과를 캐시에 저장
            if (method === "GET") {
              this.setToCache(cacheKey, result);
            }

            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      });

      req.on("error", (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  // 최적화된 스페이스 조회
  async getSpacesCompact(limit = 25) {
    try {
      const result = await this.makeRequest(`/space?limit=${limit}`);

      if (result.results) {
        result.results = result.results.map((space) => ({
          key: space.key,
          name: space.name,
          type: space.type,
          status: space.status,
          webui: space._links?.webui,
        }));
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
      };
    } catch (error) {
      throw error;
    }
  }

  // 페이지 조회 - 단순화
  async getPage(pageId) {
    try {
      const result = await this.makeRequest(
        `/content/${pageId}?expand=body.storage,version`
      );
      return this.optimizeResponse(result, {
        fields: ["id", "title", "type", "status"],
        includeBody: true,
      });
    } catch (error) {
      throw error;
    }
  }

  async getChildPagesCompact(pageId, limit = 10) {
    try {
      const result = await this.makeRequest(
        `/content/${pageId}/child/page?limit=${limit}`
      );

      if (result.results) {
        result.results = result.results.map((item) =>
          this.optimizeResponse(item, {
            fields: ["id", "title", "type", "status"],
            includeBody: false,
          })
        );
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
      };
    } catch (error) {
      throw error;
    }
  }

  async searchPagesCompact(query, limit = 10) {
    try {
      // CQL 쿼리 검증 및 최적화
      const cleanedQuery = this.validateAndOptimizeCQL(query);

      // URL 인코딩은 필요한 특수문자만 인코딩
      // space 키워드가 포함된 경우 다른 방식 사용
      let encodedQuery;

      if (cleanedQuery.toLowerCase().includes('space =') ||
          cleanedQuery.toLowerCase().includes('space=')) {
        // space 조건이 있는 경우 부분 인코딩만 수행
        encodedQuery = cleanedQuery
          .replace(/"/g, '%22')    // 따옴표만 인코딩
          .replace(/ /g, '%20')    // 공백 인코딩
          .replace(/=/g, '%3D');   // = 인코딩
      } else {
        // 일반적인 경우 전체 인코딩
        encodedQuery = encodeURIComponent(cleanedQuery);
      }

      console.error(`[DEBUG] Original query: ${cleanedQuery}`);
      console.error(`[DEBUG] Encoded query: ${encodedQuery}`);

      const result = await this.makeRequest(
        `/content/search?cql=${encodedQuery}&limit=${limit}`
      );

      if (result.results) {
        result.results = result.results.map((item) => {
          const optimized = this.optimizeResponse(item, {
            fields: ["id", "title", "type", "status"],
            includeBody: false,
          });

          // space 정보 추가
          if (item.space) {
            optimized.space = {
              key: item.space.key,
              name: item.space.name
            };
          }

          return optimized;
        });
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
      };
    } catch (error) {
      console.error(`[ERROR] CQL Search failed: ${error.message}`);
      console.error(`[ERROR] Query was: ${query}`);

      // 500 에러인 경우 더 간단한 검색으로 fallback
      if (error.message.includes('500')) {
        console.error('[FALLBACK] Trying simpler text search...');
        try {
          return await this.searchPagesSimple(query, limit);
        } catch (fallbackError) {
          console.error(`[FALLBACK ERROR] ${fallbackError.message}`);
        }
      }

      throw error;
    }
  }

  // Fallback 검색 함수 추가
  async searchPagesSimple(query, limit = 10) {
    try {
      // 복잡한 CQL이 실패했을 때 간단한 텍스트 검색 사용
      let simpleQuery = '';

      if (query.includes('title ~')) {
        const titleMatch = query.match(/title\s*~\s*"([^"]+)"/i);
        if (titleMatch) {
          simpleQuery = `title ~ "${titleMatch[1]}"`;
        }
      } else if (query.includes('text ~')) {
        const textMatch = query.match(/text\s*~\s*"([^"]+)"/i);
        if (textMatch) {
          simpleQuery = `text ~ "${textMatch[1]}"`;
        }
      } else {
        // 단순 텍스트 검색으로 변환
        const cleanText = query.replace(/[^\w\s가-힣]/g, '').trim();
        simpleQuery = `text ~ "${cleanText}"`;
      }

      const encodedQuery = encodeURIComponent(simpleQuery);
      const result = await this.makeRequest(
        `/content/search?cql=${encodedQuery}&limit=${limit}`
      );

      if (result.results) {
        result.results = result.results.map((item) =>
          this.optimizeResponse(item, {
            fields: ["id", "title", "type", "status"],
            includeBody: false,
          })
        );
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
        note: "Fallback search used due to complex query failure"
      };
    } catch (error) {
      throw new Error(`Simple search also failed: ${error.message}`);
    }
  }

  // CQL 쿼리 검증 및 최적화
  validateAndOptimizeCQL(query) {
    const cleanedQuery = query.trim();

    // 위험한 CQL 패턴 확인
    const dangerousPatterns = [
      /space\s*=\s*"[^"]*"\s*AND\s*space\s*=/, // 중복된 space 조건
      /\(\s*\)/, // 빈 괄호
      /AND\s*AND|OR\s*OR/, // 중복된 논리 연산자
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleanedQuery)) {
        throw new Error(`Invalid CQL pattern detected: ${cleanedQuery}`);
      }
    }

    // CQL 최적화
    let optimizedQuery = cleanedQuery
      .replace(/\s+/g, ' ')  // 여러 공백을 하나로
      .replace(/\s*=\s*/g, ' = ')  // = 주변 공백 정규화
      .replace(/\s*~\s*/g, ' ~ ')  // ~ 주변 공백 정규화
      .replace(/\s*AND\s*/gi, ' AND ')  // AND 주변 공백 정규화
      .replace(/\s*OR\s*/gi, ' OR ');  // OR 주변 공백 정규화

    return optimizedQuery;
  }

  // 대안 검색 방법들
  async searchBySpaceAndTitle(spaceKey, titleSearchTerm, limit = 10) {
    try {
      // space를 URL parameter로 사용하는 방법
      const result = await this.makeRequest(
        `/content?spaceKey=${spaceKey}&title=${encodeURIComponent(titleSearchTerm)}&limit=${limit}&type=page`
      );

      if (result.results) {
        result.results = result.results.map((item) =>
          this.optimizeResponse(item, {
            fields: ["id", "title", "type", "status"],
            includeBody: false,
          })
        );
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
        method: "spaceKey parameter search"
      };
    } catch (error) {
      throw error;
    }
  }

  // 고급 검색 - 여러 방법을 시도
  async advancedSearch(query, limit = 10) {
    const errors = [];

    // 방법 1: 원본 CQL 시도
    try {
      return await this.searchPagesCompact(query, limit);
    } catch (error) {
      errors.push(`CQL search: ${error.message}`);
    }

    // 방법 2: space 조건이 있으면 분리해서 시도
    if (query.toLowerCase().includes('space')) {
      try {
        const spaceMatch = query.match(/space\s*=\s*"([^"]+)"/i);
        const titleMatch = query.match(/title\s*~\s*"([^"]+)"/i);

        if (spaceMatch && titleMatch) {
          return await this.searchBySpaceAndTitle(spaceMatch[1], titleMatch[1], limit);
        }
      } catch (error) {
        errors.push(`Space+Title search: ${error.message}`);
      }
    }

    // 방법 3: 단순 텍스트 검색
    try {
      return await this.searchPagesSimple(query, limit);
    } catch (error) {
      errors.push(`Simple search: ${error.message}`);
    }

    // 모든 방법이 실패한 경우
    throw new Error(`All search methods failed: ${errors.join('; ')}`);
  }

  // 추가 Confluence API 메서드들 (최적화됨)
  async createPage(spaceKey, title, content, parentPageId = null) {
    try {
      const body = {
        type: "page",
        title: title,
        space: { key: spaceKey },
        body: {
          storage: {
            value: content,
            representation: "storage",
          },
        },
      };

      if (parentPageId) {
        body.ancestors = [{ id: parentPageId }];
      }

      return await this.makeRequest("/content", "POST", body);
    } catch (error) {
      throw error;
    }
  }

  async updatePage(pageId, title, content, version) {
    try {
      const body = {
        version: { number: version },
        title: title,
        type: "page",
        body: {
          storage: {
            value: content,
            representation: "storage",
          },
        },
      };

      return await this.makeRequest(`/content/${pageId}`, "PUT", body);
    } catch (error) {
      throw error;
    }
  }

  async deletePage(pageId) {
    try {
      return await this.makeRequest(`/content/${pageId}`, "DELETE");
    } catch (error) {
      throw error;
    }
  }

  async getPageHistory(pageId, limit = 10) {
    try {
      const result = await this.makeRequest(
        `/content/${pageId}/history?limit=${limit}`
      );

      // 버전 정보만 최적화하여 반환
      if (result.results) {
        result.results = result.results.map((version) => ({
          number: version.number,
          when: version.when,
          by: version.by
            ? {
                displayName: version.by.displayName,
                username: version.by.username || version.by.userKey,
              }
            : null,
          message: version.message || "",
        }));
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
      };
    } catch (error) {
      throw error;
    }
  }

  async getPageComments(pageId, limit = 25) {
    try {
      const result = await this.makeRequest(
        `/content/${pageId}/child/comment?limit=${limit}`
      );

      if (result.results) {
        result.results = result.results.map((comment) => ({
          id: comment.id,
          title: comment.title,
          body: comment.body?.storage
            ? this.cleanHtmlToText(comment.body.storage.value)
            : "",
          author: comment.history?.createdBy
            ? {
                displayName: comment.history.createdBy.displayName,
                username: comment.history.createdBy.username,
              }
            : null,
          created: comment.history?.createdDate,
        }));
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
      };
    } catch (error) {
      throw error;
    }
  }

  async addPageComment(pageId, comment) {
    try {
      const body = {
        type: "comment",
        container: { id: pageId },
        body: {
          storage: {
            value: comment,
            representation: "storage",
          },
        },
      };

      return await this.makeRequest("/content", "POST", body);
    } catch (error) {
      throw error;
    }
  }

  async getSpacePages(spaceKey, limit = 50, start = 0) {
    try {
      const result = await this.makeRequest(
        `/content?spaceKey=${spaceKey}&limit=${limit}&start=${start}&type=page`
      );

      if (result.results) {
        result.results = result.results.map((page) =>
          this.optimizeResponse(page, {
            fields: ["id", "title", "type", "status"],
            includeBody: false,
          })
        );
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
        start: start,
      };
    } catch (error) {
      throw error;
    }
  }

  async getPageLabels(pageId) {
    try {
      const result = await this.makeRequest(`/content/${pageId}/label`);

      if (result.results) {
        result.results = result.results.map((label) => ({
          id: label.id,
          name: label.name,
          prefix: label.prefix,
        }));
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  async addPageLabel(pageId, labels) {
    try {
      const body = labels.map((labelName) => ({
        prefix: "global",
        name: labelName,
      }));

      return await this.makeRequest(`/content/${pageId}/label`, "POST", body);
    } catch (error) {
      throw error;
    }
  }

  async getPageAttachments(pageId, limit = 25) {
    try {
      const result = await this.makeRequest(
        `/content/${pageId}/child/attachment?limit=${limit}`
      );

      if (result.results) {
        result.results = result.results.map((attachment) => ({
          id: attachment.id,
          title: attachment.title,
          mediaType: attachment.metadata?.mediaType,
          fileSize: attachment.extensions?.fileSize,
          downloadUrl: attachment._links?.download,
        }));
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
      };
    } catch (error) {
      throw error;
    }
  }

  async getRecentPages(limit = 25, spaceKey = null) {
    try {
      let url = `/content?limit=${limit}&orderby=lastmodified&type=page`;
      if (spaceKey) {
        url += `&spaceKey=${spaceKey}`;
      }

      const result = await this.makeRequest(url);

      if (result.results) {
        result.results = result.results.map((page) =>
          this.optimizeResponse(page, {
            fields: ["id", "title", "type", "status"],
            includeBody: false,
          })
        );
      }

      return {
        results: result.results || [],
        size: result.size || 0,
        limit: result.limit || limit,
      };
    } catch (error) {
      throw error;
    }
  }

  async getMyPages(limit = 25, spaceKey = null) {
    try {
      const user = await this.getCurrentUser();
      let cql = `creator = "${
        user.username || user.accountId
      }" AND type = page`;

      if (spaceKey) {
        cql += ` AND space = "${spaceKey}"`;
      }

      return await this.searchPagesCompact(cql, limit);
    } catch (error) {
      throw error;
    }
  }

  async getPagesByLabel(label, limit = 25, spaceKey = null) {
    try {
      let cql = `label = "${label}" AND type = page`;

      if (spaceKey) {
        cql += ` AND space = "${spaceKey}"`;
      }

      return await this.searchPagesCompact(cql, limit);
    } catch (error) {
      throw error;
    }
  }

  async getPageTemplates(spaceKey) {
    try {
      const result = await this.makeRequest(
        `/content?spaceKey=${spaceKey}&type=template`
      );

      if (result.results) {
        result.results = result.results.map((template) => ({
          id: template.id,
          title: template.title,
          type: template.type,
          status: template.status,
        }));
      }

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getSpaceDetails(spaceKey) {
    try {
      const result = await this.makeRequest(`/space/${spaceKey}`);

      return {
        key: result.key,
        name: result.name,
        type: result.type,
        status: result.status,
        description: result.description?.plain?.value || "",
        homepage: result.homepage?.id,
        webui: result._links?.webui,
      };
    } catch (error) {
      throw error;
    }
  }

  async getCurrentUser() {
    const cacheKey = this.getCacheKey("user/current");
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const result = await this.makeRequest("/user/current");

      // 사용자 정보 최적화
      const userInfo = {
        accountId: result.accountId,
        displayName: result.displayName,
        email: result.email || "N/A",
        username: result.username || result.accountId,
        type: result.type || "user",
        accountType: result.accountType || "atlassian",
      };

      this.setToCache(cacheKey, userInfo);
      return userInfo;
    } catch (error) {
      throw error;
    }
  }

  // MCP Protocol Implementation
  async handleRequest(request) {
    const { method, params = {} } = request;

    switch (method) {
      case "initialize":
        return {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "confluence-optimized-v2",
            version: "2.0.0",
          },
        };

      case "tools/list":
        return {
          tools: [
            {
              name: "get_spaces",
              description: "Get Confluence spaces (optimized)",
              inputSchema: {
                type: "object",
                properties: {
                  limit: {
                    type: "number",
                    default: 25,
                    description: "Maximum number of spaces to return",
                  },
                },
              },
            },
            {
              name: "get_page",
              description:
                "Get a Confluence page by ID with clean text content",
              inputSchema: {
                type: "object",
                properties: {
                  pageId: {
                    type: "string",
                    description: "ID of the page to retrieve",
                  },
                },
                required: ["pageId"],
              },
            },
            {
              name: "search_pages",
              description: "Search Confluence pages using CQL",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string", description: "CQL query string" },
                  limit: {
                    type: "number",
                    default: 10,
                    description: "Maximum number of results",
                  },
                },
                required: ["query"],
              },
            },
            {
              name: "create_page",
              description: "Create a new Confluence page",
              inputSchema: {
                type: "object",
                properties: {
                  spaceKey: {
                    type: "string",
                    description: "Space key where to create the page",
                  },
                  title: {
                    type: "string",
                    description: "Title of the new page",
                  },
                  content: {
                    type: "string",
                    description: "HTML content of the page (storage format)",
                  },
                  parentPageId: {
                    type: "string",
                    description: "ID of parent page (optional)",
                  },
                },
                required: ["spaceKey", "title", "content"],
              },
            },
            {
              name: "update_page",
              description: "Update an existing Confluence page",
              inputSchema: {
                type: "object",
                properties: {
                  pageId: {
                    type: "string",
                    description: "ID of the page to update",
                  },
                  title: {
                    type: "string",
                    description: "New title of the page",
                  },
                  content: {
                    type: "string",
                    description:
                      "New HTML content of the page (storage format)",
                  },
                  version: {
                    type: "number",
                    description: "Current version number of the page",
                  },
                },
                required: ["pageId", "title", "content", "version"],
              },
            },
            {
              name: "get_child_pages",
              description: "Get child pages of a page",
              inputSchema: {
                type: "object",
                properties: {
                  pageId: {
                    type: "string",
                    description: "ID of the parent page",
                  },
                  limit: {
                    type: "number",
                    default: 25,
                    description: "Maximum number of child pages to return",
                  },
                },
                required: ["pageId"],
              },
            },
            {
              name: "get_space_pages",
              description: "Get all pages in a space",
              inputSchema: {
                type: "object",
                properties: {
                  spaceKey: { type: "string", description: "Space key" },
                  limit: {
                    type: "number",
                    default: 50,
                    description: "Maximum number of pages to return",
                  },
                  start: {
                    type: "number",
                    default: 0,
                    description: "Start index for pagination",
                  },
                },
                required: ["spaceKey"],
              },
            },
            {
              name: "get_space_details",
              description: "Get detailed information about a space",
              inputSchema: {
                type: "object",
                properties: {
                  spaceKey: { type: "string", description: "Space key" },
                },
                required: ["spaceKey"],
              },
            },
          ],
        };

      case "tools/call":
        return await this.handleToolCall(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  async handleToolCall(params) {
    const { name, arguments: args = {} } = params;

    try {
      switch (name) {
        case "get_spaces":
          const spaces = await this.getSpacesCompact(args.limit);
          return {
            content: [{ type: "text", text: JSON.stringify(spaces, null, 2) }],
          };

        case "get_page":
          const page = await this.getPage(args.pageId);
          return {
            content: [{ type: "text", text: JSON.stringify(page, null, 2) }],
          };

        case "search_pages":
          // 고급 검색 사용 - 여러 방법을 시도하여 안정성 향상
          const searchResults = await this.advancedSearch(
            args.query,
            args.limit
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(searchResults, null, 2) },
            ],
          };

        case "create_page":
          const createResult = await this.createPage(
            args.spaceKey,
            args.title,
            args.content,
            args.parentPageId
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(createResult, null, 2) },
            ],
          };

        case "update_page":
          const updateResult = await this.updatePage(
            args.pageId,
            args.title,
            args.content,
            args.version
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(updateResult, null, 2) },
            ],
          };

        case "delete_page":
          const deleteResult = await this.deletePage(args.pageId);
          return {
            content: [
              { type: "text", text: JSON.stringify(deleteResult, null, 2) },
            ],
          };

        case "get_page_history":
          const historyResult = await this.getPageHistory(
            args.pageId,
            args.limit
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(historyResult, null, 2) },
            ],
          };

        case "get_child_pages":
          const childPages = await this.getChildPagesCompact(
            args.pageId,
            args.limit
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(childPages, null, 2) },
            ],
          };

        case "get_page_comments":
          const comments = await this.getPageComments(args.pageId, args.limit);
          return {
            content: [
              { type: "text", text: JSON.stringify(comments, null, 2) },
            ],
          };

        case "add_page_comment":
          const commentResult = await this.addPageComment(
            args.pageId,
            args.comment
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(commentResult, null, 2) },
            ],
          };

        case "get_space_pages":
          const spacePages = await this.getSpacePages(
            args.spaceKey,
            args.limit,
            args.start
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(spacePages, null, 2) },
            ],
          };

        case "get_page_labels":
          const labels = await this.getPageLabels(args.pageId);
          return {
            content: [{ type: "text", text: JSON.stringify(labels, null, 2) }],
          };

        case "add_page_label":
          const labelResult = await this.addPageLabel(args.pageId, args.labels);
          return {
            content: [
              { type: "text", text: JSON.stringify(labelResult, null, 2) },
            ],
          };

        case "get_page_attachments":
          const attachments = await this.getPageAttachments(
            args.pageId,
            args.limit
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(attachments, null, 2) },
            ],
          };

        case "get_recent_pages":
          const recentPages = await this.getRecentPages(
            args.limit,
            args.spaceKey
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(recentPages, null, 2) },
            ],
          };

        case "get_my_pages":
          const myPages = await this.getMyPages(args.limit, args.spaceKey);
          return {
            content: [{ type: "text", text: JSON.stringify(myPages, null, 2) }],
          };

        case "get_pages_by_label":
          const pagesByLabel = await this.getPagesByLabel(
            args.label,
            args.limit,
            args.spaceKey
          );
          return {
            content: [
              { type: "text", text: JSON.stringify(pagesByLabel, null, 2) },
            ],
          };

        case "get_page_templates":
          const templates = await this.getPageTemplates(args.spaceKey);
          return {
            content: [
              { type: "text", text: JSON.stringify(templates, null, 2) },
            ],
          };

        case "get_space_details":
          const spaceDetails = await this.getSpaceDetails(args.spaceKey);
          return {
            content: [
              { type: "text", text: JSON.stringify(spaceDetails, null, 2) },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }

  async start() {
    console.error("Confluence Optimized MCP v2 Server running on stdio - JSON-RPC 프로토콜 개선됨");

    process.stdin.setEncoding("utf8");
    let buffer = '';

    process.stdin.on("data", async (data) => {
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
          requestId = request.id !== undefined ? request.id : null;
        } catch (parseError) {
          console.log(JSON.stringify({
            jsonrpc: "2.0",
            id: requestId,
            error: {
              code: -32700,
              message: "Parse error",
              data: parseError.message
            }
          }));
          continue;
        }

        // Handle notifications separately (no response needed)
        if (request.method && (request.method.startsWith('notifications/') || request.method === 'initialized')) {
          // Notifications don't need responses
          continue;
        }

        try {
          const response = await this.handleRequest(request);

          // Send response if we have a requestId (response can be any value including null/undefined)
          if (requestId !== null) {
            console.log(JSON.stringify({
              jsonrpc: "2.0",
              id: requestId,
              result: response
            }));
          }
        } catch (error) {
          let errorCode = -32603; // Internal error
          let errorMessage = "Internal error";

          // More specific error codes based on the error type
          if (error.message.includes('Unknown method')) {
            errorCode = -32601;
            errorMessage = 'Method not found';
          } else if (error.message.includes('required') || error.message.includes('Invalid arguments')) {
            errorCode = -32602;
            errorMessage = 'Invalid params';
          }

          console.log(JSON.stringify({
            jsonrpc: "2.0",
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

// Start the server
const server = new ConfluenceOptimizedMCP();
server.start();
