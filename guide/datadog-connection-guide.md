# Claude Code와 Datadog 연결 가이드

## 개요

이 문서는 Claude Code CLI에서 Datadog API를 MCP (Model Context Protocol) 서버를 통해 연결하여 사용하는 방법을 설명합니다.

## 아키텍처

```
Claude Code CLI
    ↓
MCP Protocol
    ↓
Custom Datadog MCP Server (Node.js)
    ↓
Datadog REST API
```

## 필요한 준비물

### 1. Datadog API 키 발급

Datadog에서 다음 두 가지 키를 발급받아야 합니다:

- **API Key**: Datadog API 인증용
- **Application Key**: 애플리케이션 수준의 권한 제어용

#### 발급 방법
1. Datadog 콘솔 접속
2. Organization Settings → API Keys 메뉴로 이동
3. API Key 생성 또는 기존 키 복사
4. Application Keys 탭으로 이동
5. Application Key 생성 또는 기존 키 복사

### 2. Node.js 환경

- Node.js v20 이상 권장
- npm 또는 yarn 패키지 매니저

## 설치 및 설정 단계

### Step 1: Datadog MCP 서버 프로젝트 생성

```bash
# 프로젝트 디렉토리 생성
mkdir datadog-api-server
cd datadog-api-server

# package.json 생성
npm init -y
```

### Step 2: 필요한 패키지 설치

```bash
npm install @modelcontextprotocol/sdk axios dotenv
```

**패키지 설명**:
- `@modelcontextprotocol/sdk`: MCP 프로토콜 SDK
- `axios`: HTTP 클라이언트 (Datadog API 호출용)
- `dotenv`: 환경변수 관리

### Step 3: MCP 서버 코드 작성

`mcp-server.js` 파일 생성:

```javascript
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
    from: new Date(parseRelativeTime(from)).toISOString(),
    to: new Date(parseRelativeTime(to)).toISOString()
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
      // ... 추가 도구들 (aggregate-logs, search-apm-spans, get-monitors 등)
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
              from: timeRange.from,
              to: timeRange.to,
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
      // ... 기타 케이스들
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
```

### Step 4: Claude Code 설정 파일 수정

Claude Code의 MCP 설정 파일(`~/.claude/mcp.json`)에 Datadog 서버 추가:

```json
{
  "mcpServers": {
    "datadog": {
      "command": "/Users/{username}/.nvm/versions/node/v20.19.0/bin/node",
      "args": [
        "/Users/{username}/datadog-api-server/mcp-server.js"
      ],
      "env": {
        "DD_API_KEY": "your-datadog-api-key",
        "DD_APP_KEY": "your-datadog-app-key",
        "DD_SITE": "datadoghq.com"
      }
    }
  }
}
```

**설정 항목 설명**:

- `command`: Node.js 실행 파일 경로 (nvm 사용 시 절대 경로 지정)
- `args`: MCP 서버 스크립트 파일 경로
- `env`: 환경변수 설정
  - `DD_API_KEY`: Datadog API 키
  - `DD_APP_KEY`: Datadog Application 키
  - `DD_SITE`: Datadog 사이트 (기본값: datadoghq.com)

### Step 5: Node.js 경로 확인

```bash
# nvm 사용 시
which node

# 또는
echo $NVM_DIR
ls ~/.nvm/versions/node/
```

실제 Node.js 실행 파일의 절대 경로를 확인하여 `command` 필드에 입력합니다.

## 제공되는 기능 (Tools)

### 1. search-logs
로그 검색 기능

**사용 예시**:
```
review-prd 서비스의 최근 1시간 에러 로그 조회해줘
```

**파라미터**:
- `query`: 검색 쿼리 (예: "service:review-prd status:error")
- `from`: 시작 시간 (예: "now-1h", "now-30m")
- `to`: 종료 시간 (기본값: "now")
- `limit`: 최대 결과 수 (기본값: 50)

### 2. aggregate-logs
로그 집계 및 그룹핑

**사용 예시**:
```
review-prd의 최근 24시간 에러를 타입별로 집계해줘
```

### 3. search-apm-spans
APM 트레이스 및 스팬 검색

**사용 예시**:
```
review-api의 느린 요청 찾아줘
```

### 4. get-monitors
모니터 상태 조회

**사용 예시**:
```
alert 상태인 모니터 목록 보여줘
```

### 5. get-metrics
메트릭 검색

### 6. get-dashboards
대시보드 목록 조회

### 7. get-events
이벤트 조회 (배포, 알림 등)

## 동작 원리

### 1. Claude Code에서 요청
사용자가 Claude Code CLI에서 Datadog 관련 질문을 합니다.

### 2. MCP 프로토콜 통신
Claude Code는 사용자 요청을 분석하여 적절한 MCP 도구를 선택합니다.

### 3. MCP 서버 실행
설정된 Node.js 명령어로 MCP 서버 프로세스가 실행됩니다.

### 4. Datadog API 호출
MCP 서버가 Datadog REST API에 HTTP 요청을 전송합니다.

### 5. 응답 반환
API 응답이 MCP 프로토콜을 통해 Claude Code로 전달되고, 사용자에게 표시됩니다.

## 트러블슈팅

### 문제 1: MCP 서버가 시작되지 않음

**원인**: Node.js 경로가 잘못됨

**해결 방법**:
```bash
# 현재 Node.js 경로 확인
which node

# mcp.json의 command 필드를 업데이트
```

### 문제 2: API 키 인증 실패

**원인**: 잘못된 API 키 또는 권한 부족

**해결 방법**:
1. Datadog 콘솔에서 키 확인
2. API Key와 Application Key가 모두 유효한지 확인
3. Application Key에 필요한 권한이 부여되었는지 확인

### 문제 3: 환경변수가 전달되지 않음

**원인**: mcp.json의 env 설정 누락

**해결 방법**:
```json
{
  "mcpServers": {
    "datadog": {
      "env": {
        "DD_API_KEY": "실제_API_키",
        "DD_APP_KEY": "실제_APP_키"
      }
    }
  }
}
```

## 보안 고려사항

### 1. API 키 보호
- mcp.json 파일 권한 설정: `chmod 600 ~/.claude/mcp.json`
- Git에 커밋하지 않도록 주의
- 주기적으로 키 로테이션

### 2. 최소 권한 원칙
- Application Key에 필요한 최소한의 권한만 부여
- 읽기 전용 권한 사용 권장

### 3. 로그 모니터링
- API 키 사용 로그 확인
- 비정상적인 API 호출 감지

## 확장 가능성

### 추가 가능한 기능

1. **Metrics Query API**: 커스텀 메트릭 쿼리
2. **Dashboard API**: 대시보드 생성/수정
3. **Alert API**: 알림 규칙 관리
4. **SLO API**: SLO 모니터링
5. **RUM API**: Real User Monitoring 데이터 조회

### 새로운 도구 추가 방법

`mcp-server.js`의 `ListToolsRequestSchema` 핸들러에 새로운 도구 정의를 추가:

```javascript
{
  name: 'new-tool',
  description: '도구 설명',
  inputSchema: {
    type: 'object',
    properties: {
      // 파라미터 정의
    },
    required: ['필수_파라미터'],
  },
}
```

그리고 `CallToolRequestSchema` 핸들러에 구현 로직 추가:

```javascript
case 'new-tool': {
  // API 호출 로직
  const response = await axios.get(
    `${DD_BASE_URL}/api/v1/...`,
    { headers: getHeaders() }
  );

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(response.data, null, 2),
    }],
  };
}
```

## 참고 자료

- [Datadog API 문서](https://docs.datadoghq.com/api/latest/)
- [Model Context Protocol 사양](https://modelcontextprotocol.io/)
- [Claude Code 공식 문서](https://docs.anthropic.com/claude/docs)

## 버전 정보

- MCP Server Version: 1.0.0
- MCP SDK Version: ^1.25.1
- Node.js: v20.19.0
- 작성일: 2025-12-19
