#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

// Datadog API 설정
const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;
const DD_SITE = process.env.DD_SITE || 'datadoghq.com';
const DD_BASE_URL = `https://api.${DD_SITE}`;

if (!DD_API_KEY || !DD_APP_KEY) {
  console.error('Error: DD_API_KEY and DD_APP_KEY must be set');
  process.exit(1);
}

// Datadog API 헤더 생성
const getHeaders = () => ({
  'DD-API-KEY': DD_API_KEY,
  'DD-APPLICATION-KEY': DD_APP_KEY,
  'Content-Type': 'application/json'
});

// 시간 범위 파싱 함수
const parseTimeRange = (from, to) => {
  const now = Date.now();
  const parseRelativeTime = (timeStr) => {
    if (timeStr === 'now') return now;
    if (timeStr.startsWith('now-')) {
      const match = timeStr.match(/now-(\d+)([mhd])/);
      if (match) {
        const value = parseInt(match[1]);
        const unit = match[2];
        const multiplier = { m: 60000, h: 3600000, d: 86400000 };
        return now - (value * multiplier[unit]);
      }
    }
    return parseInt(timeStr);
  };

  return {
    from: parseRelativeTime(from),
    to: parseRelativeTime(to)
  };
};

// MCP 서버 생성
const server = new Server(
  {
    name: 'datadog',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 사용 가능한 도구 정의
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search-logs',
        description: 'Search Datadog logs with query, time range, and limit.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Datadog log search query (e.g., "service:review-prd status:error")',
            },
            from: {
              type: 'string',
              description: 'Start time (e.g., "now-1h", "now-30m")',
              default: 'now-1h',
            },
            to: {
              type: 'string',
              description: 'End time (default: "now")',
              default: 'now',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 50,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'aggregate-logs',
        description: 'Aggregate and group Datadog logs by specified fields.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Datadog log search query',
            },
            groupBy: {
              type: 'array',
              items: { type: 'string' },
              description: 'Fields to group by (e.g., ["@error.kind", "service"])',
            },
            from: {
              type: 'string',
              description: 'Start time (e.g., "now-24h")',
              default: 'now-24h',
            },
            to: {
              type: 'string',
              description: 'End time (default: "now")',
              default: 'now',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of groups',
              default: 10,
            },
          },
          required: ['query', 'groupBy'],
        },
      },
      {
        name: 'search-apm-spans',
        description: 'Search APM traces and spans in Datadog.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'APM search query (e.g., "service:review-api resource_name:GET*")',
            },
            from: {
              type: 'string',
              description: 'Start time (e.g., "now-1h")',
              default: 'now-1h',
            },
            to: {
              type: 'string',
              description: 'End time (default: "now")',
              default: 'now',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 50,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get-monitors',
        description: 'Get list of Datadog monitors with optional filtering.',
        inputSchema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by tags (e.g., ["env:prod", "service:api"])',
            },
            state: {
              type: 'string',
              description: 'Filter by state: all, alert, warn, no data',
              default: 'all',
            },
          },
        },
      },
      {
        name: 'get-metrics',
        description: 'Query Datadog metrics data.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Metric query (e.g., "avg:system.cpu.user{*}")',
            },
            from: {
              type: 'string',
              description: 'Start time (e.g., "now-1h")',
              default: 'now-1h',
            },
            to: {
              type: 'string',
              description: 'End time (default: "now")',
              default: 'now',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get-dashboards',
        description: 'List Datadog dashboards.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of dashboards to return',
              default: 20,
            },
          },
        },
      },
      {
        name: 'get-events',
        description: 'Search Datadog events (deployments, alerts, etc.).',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Event search query (e.g., "tags:deploy,prod")',
            },
            from: {
              type: 'string',
              description: 'Start time (e.g., "now-1d")',
              default: 'now-1d',
            },
            to: {
              type: 'string',
              description: 'End time (default: "now")',
              default: 'now',
            },
          },
        },
      },
    ],
  };
});

// 도구 호출 핸들러
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search-logs': {
        const { query, from = 'now-1h', to = 'now', limit = 50 } = args;
        const timeRange = parseTimeRange(from, to);

        const response = await axios.post(
          `${DD_BASE_URL}/api/v2/logs/events/search`,
          {
            filter: {
              query,
              from: new Date(timeRange.from).toISOString(),
              to: new Date(timeRange.to).toISOString(),
            },
            page: { limit },
            sort: '-timestamp',
          },
          { headers: getHeaders() }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'aggregate-logs': {
        const { query, groupBy, from = 'now-24h', to = 'now', limit = 10 } = args;
        const timeRange = parseTimeRange(from, to);

        const response = await axios.post(
          `${DD_BASE_URL}/api/v2/logs/analytics/aggregate`,
          {
            filter: {
              query,
              from: new Date(timeRange.from).toISOString(),
              to: new Date(timeRange.to).toISOString(),
            },
            compute: [
              {
                aggregation: 'count',
                type: 'total',
              },
            ],
            group_by: groupBy.map(field => ({
              facet: field,
              limit: limit,
              sort: {
                aggregation: 'count',
                order: 'desc',
              },
            })),
          },
          { headers: getHeaders() }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'search-apm-spans': {
        const { query, from = 'now-1h', to = 'now', limit = 50 } = args;
        const timeRange = parseTimeRange(from, to);

        const response = await axios.post(
          `${DD_BASE_URL}/api/v2/spans/events/search`,
          {
            data: {
              type: 'search_request',
              attributes: {
                filter: {
                  query,
                  from: new Date(timeRange.from).toISOString(),
                  to: new Date(timeRange.to).toISOString(),
                },
                page: { limit },
                sort: 'timestamp',
              },
            },
          },
          { headers: getHeaders() }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'get-monitors': {
        const { tags = [], state = 'all' } = args;

        let url = `${DD_BASE_URL}/api/v1/monitor`;
        const params = new URLSearchParams();

        if (tags.length > 0) {
          params.append('tags', tags.join(','));
        }

        if (state !== 'all') {
          params.append('monitor_tags', state);
        }

        const queryString = params.toString();
        if (queryString) {
          url += `?${queryString}`;
        }

        const response = await axios.get(url, { headers: getHeaders() });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'get-metrics': {
        const { query, from = 'now-1h', to = 'now' } = args;
        const timeRange = parseTimeRange(from, to);

        const response = await axios.get(
          `${DD_BASE_URL}/api/v1/query`,
          {
            params: {
              query,
              from: Math.floor(timeRange.from / 1000),
              to: Math.floor(timeRange.to / 1000),
            },
            headers: getHeaders(),
          }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'get-dashboards': {
        const { limit = 20 } = args;

        const response = await axios.get(
          `${DD_BASE_URL}/api/v1/dashboard`,
          {
            params: { count: limit },
            headers: getHeaders(),
          }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'get-events': {
        const { query = '', from = 'now-1d', to = 'now' } = args;
        const timeRange = parseTimeRange(from, to);

        const response = await axios.get(
          `${DD_BASE_URL}/api/v1/events`,
          {
            params: {
              start: Math.floor(timeRange.from / 1000),
              end: Math.floor(timeRange.to / 1000),
              tags: query,
            },
            headers: getHeaders(),
          }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage = error.response?.data || error.message;
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${JSON.stringify(errorMessage, null, 2)}`,
        },
      ],
      isError: true,
    };
  }
});

// 서버 시작
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Datadog MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
