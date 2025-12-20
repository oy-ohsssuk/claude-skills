#!/usr/bin/env node

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');

// TeamCity 설정
const TEAMCITY_URL = process.env.TEAMCITY_URL;
const TEAMCITY_TOKEN = process.env.TEAMCITY_TOKEN;

if (!TEAMCITY_URL || !TEAMCITY_TOKEN) {
  console.error('Error: TEAMCITY_URL and TEAMCITY_TOKEN must be set');
  process.exit(1);
}

// TeamCity API 헤더 생성
const getHeaders = () => ({
  'Authorization': `Bearer ${TEAMCITY_TOKEN}`,
  'Accept': 'application/json',
  'Content-Type': 'application/json'
});

// API 기본 URL
const API_BASE = `${TEAMCITY_URL}/app/rest`;

// MCP 서버 생성
const server = new Server(
  {
    name: 'teamcity',
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
        name: 'get-projects',
        description: 'Get list of TeamCity projects',
        inputSchema: {
          type: 'object',
          properties: {
            archived: {
              type: 'boolean',
              description: 'Include archived projects',
              default: false,
            },
          },
        },
      },
      {
        name: 'get-builds',
        description: 'Get list of builds with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Project ID to filter builds',
            },
            buildTypeId: {
              type: 'string',
              description: 'Build configuration ID',
            },
            branch: {
              type: 'string',
              description: 'Branch name',
            },
            status: {
              type: 'string',
              enum: ['SUCCESS', 'FAILURE', 'ERROR'],
              description: 'Build status filter',
            },
            count: {
              type: 'number',
              description: 'Number of builds to return',
              default: 10,
            },
          },
        },
      },
      {
        name: 'get-build-details',
        description: 'Get detailed information about a specific build',
        inputSchema: {
          type: 'object',
          properties: {
            buildId: {
              type: 'string',
              description: 'Build ID or build locator',
            },
          },
          required: ['buildId'],
        },
      },
      {
        name: 'trigger-build',
        description: 'Trigger a new build',
        inputSchema: {
          type: 'object',
          properties: {
            buildTypeId: {
              type: 'string',
              description: 'Build configuration ID',
            },
            branchName: {
              type: 'string',
              description: 'Branch name (optional)',
            },
            comment: {
              type: 'string',
              description: 'Build comment',
              default: 'Triggered by Claude Code MCP',
            },
            properties: {
              type: 'object',
              description: 'Build parameters (key-value pairs)',
            },
            personal: {
              type: 'boolean',
              description: 'Personal build',
              default: false,
            },
          },
          required: ['buildTypeId'],
        },
      },
      {
        name: 'get-build-queue',
        description: 'Get current build queue',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: {
              type: 'string',
              description: 'Filter by project ID',
            },
          },
        },
      },
      {
        name: 'move-build-to-top',
        description: 'Move a queued build to the top of the queue',
        inputSchema: {
          type: 'object',
          properties: {
            queuedBuildId: {
              type: 'string',
              description: 'Queued build ID',
            },
          },
          required: ['queuedBuildId'],
        },
      },
      {
        name: 'remove-from-queue',
        description: 'Remove a build from the queue',
        inputSchema: {
          type: 'object',
          properties: {
            queuedBuildId: {
              type: 'string',
              description: 'Queued build ID',
            },
            comment: {
              type: 'string',
              description: 'Reason for removal',
              default: 'Removed by Claude Code MCP',
            },
          },
          required: ['queuedBuildId'],
        },
      },
      {
        name: 'get-agents',
        description: 'Get list of build agents and their status',
        inputSchema: {
          type: 'object',
          properties: {
            connected: {
              type: 'boolean',
              description: 'Filter by connected status',
            },
            authorized: {
              type: 'boolean',
              description: 'Filter by authorized status',
            },
          },
        },
      },
      {
        name: 'get-test-results',
        description: 'Get test results for a build',
        inputSchema: {
          type: 'object',
          properties: {
            buildId: {
              type: 'string',
              description: 'Build ID',
            },
            status: {
              type: 'string',
              enum: ['SUCCESSFUL', 'FAILED', 'IGNORED'],
              description: 'Filter by test status',
            },
          },
          required: ['buildId'],
        },
      },
      {
        name: 'get-build-log',
        description: 'Get build log',
        inputSchema: {
          type: 'object',
          properties: {
            buildId: {
              type: 'string',
              description: 'Build ID',
            },
            tail: {
              type: 'number',
              description: 'Number of last lines to return',
              default: 100,
            },
          },
          required: ['buildId'],
        },
      },
      {
        name: 'stop-build',
        description: 'Stop a running build',
        inputSchema: {
          type: 'object',
          properties: {
            buildId: {
              type: 'string',
              description: 'Build ID',
            },
            comment: {
              type: 'string',
              description: 'Reason for stopping',
              default: 'Stopped by Claude Code MCP',
            },
            readdIntoQueue: {
              type: 'boolean',
              description: 'Re-add to queue after stopping',
              default: false,
            },
          },
          required: ['buildId'],
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
      case 'get-projects': {
        const { archived = false } = args;
        const response = await axios.get(
          `${API_BASE}/projects`,
          {
            params: { fields: 'project(id,name,parentProjectId,archived,webUrl)', archived },
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

      case 'get-builds': {
        const { projectId, buildTypeId, branch, status, count = 10 } = args;
        let locator = `count:${count}`;

        if (projectId) locator += `,project:${projectId}`;
        if (buildTypeId) locator += `,buildType:${buildTypeId}`;
        if (branch) locator += `,branch:${branch}`;
        if (status) locator += `,status:${status}`;

        const response = await axios.get(
          `${API_BASE}/builds`,
          {
            params: {
              locator,
              fields: 'build(id,number,status,state,branchName,buildTypeId,startDate,finishDate,statusText,webUrl)'
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

      case 'get-build-details': {
        const { buildId } = args;
        const response = await axios.get(
          `${API_BASE}/builds/${buildId}`,
          {
            params: {
              fields: 'build(id,number,status,state,branchName,buildTypeId,startDate,finishDate,statusText,webUrl,agent,changes,artifacts,statistics,testOccurrences)'
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

      case 'trigger-build': {
        const { buildTypeId, branchName, comment = 'Triggered by Claude Code MCP', properties, personal = false } = args;

        const buildRequest = {
          buildType: { id: buildTypeId },
          comment: { text: comment },
          personal,
        };

        if (branchName) {
          buildRequest.branchName = branchName;
        }

        if (properties && Object.keys(properties).length > 0) {
          buildRequest.properties = {
            property: Object.entries(properties).map(([name, value]) => ({
              name,
              value: String(value),
            })),
          };
        }

        const response = await axios.post(
          `${API_BASE}/buildQueue`,
          buildRequest,
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

      case 'get-build-queue': {
        const { projectId } = args;
        let url = `${API_BASE}/buildQueue`;

        const params = {
          fields: 'build(id,buildTypeId,branchName,state,waitReason,queuedDate,startEstimate,webUrl)'
        };

        if (projectId) {
          params.locator = `project:${projectId}`;
        }

        const response = await axios.get(url, {
          params,
          headers: getHeaders(),
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'move-build-to-top': {
        const { queuedBuildId } = args;

        const response = await axios.get(
          `${API_BASE}/buildQueue/id:${queuedBuildId}`,
          { headers: getHeaders() }
        );

        const buildData = response.data;
        buildData.queuePosition = 1; // Move to top

        const updateResponse = await axios.put(
          `${API_BASE}/buildQueue/id:${queuedBuildId}`,
          buildData,
          { headers: getHeaders() }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(updateResponse.data, null, 2),
            },
          ],
        };
      }

      case 'remove-from-queue': {
        const { queuedBuildId, comment = 'Removed by Claude Code MCP' } = args;

        await axios.delete(
          `${API_BASE}/buildQueue/id:${queuedBuildId}`,
          {
            headers: getHeaders(),
            data: { comment: { text: comment } }
          }
        );

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `Build ${queuedBuildId} removed from queue`,
                comment
              }, null, 2),
            },
          ],
        };
      }

      case 'get-agents': {
        const { connected, authorized } = args;
        let locator = '';

        if (connected !== undefined) locator += `,connected:${connected}`;
        if (authorized !== undefined) locator += `,authorized:${authorized}`;
        if (locator) locator = locator.substring(1); // Remove leading comma

        const response = await axios.get(
          `${API_BASE}/agents`,
          {
            params: {
              locator,
              fields: 'agent(id,name,connected,authorized,enabled,uptodate,ip,pool,currentBuild)'
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

      case 'get-test-results': {
        const { buildId, status } = args;
        let url = `${API_BASE}/testOccurrences`;
        let locator = `build:${buildId}`;

        if (status) locator += `,status:${status}`;

        const response = await axios.get(url, {
          params: {
            locator,
            fields: 'testOccurrence(id,name,status,duration,details,test)'
          },
          headers: getHeaders(),
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case 'get-build-log': {
        const { buildId, tail = 100 } = args;

        const response = await axios.get(
          `${API_BASE}/builds/id:${buildId}/log`,
          {
            headers: { ...getHeaders(), 'Accept': 'text/plain' },
          }
        );

        // Get last N lines
        const lines = response.data.split('\n');
        const lastLines = lines.slice(-tail).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: lastLines,
            },
          ],
        };
      }

      case 'stop-build': {
        const { buildId, comment = 'Stopped by Claude Code MCP', readdIntoQueue = false } = args;

        const response = await axios.post(
          `${API_BASE}/builds/id:${buildId}`,
          {
            comment: { text: comment },
            readdIntoQueue,
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
    const statusCode = error.response?.status;

    return {
      content: [
        {
          type: 'text',
          text: `Error ${statusCode ? `(${statusCode})` : ''}: ${JSON.stringify(errorMessage, null, 2)}`,
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
  console.error('TeamCity MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
