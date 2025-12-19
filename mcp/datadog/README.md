# Datadog MCP Server

Datadog API를 MCP (Model Context Protocol)를 통해 연결하는 서버입니다.

## 설치

```bash
cd mcp/datadog
npm install
```

## 설정

Claude Code의 MCP 설정 파일(`~/.claude/mcp.json`)에 다음 내용을 추가하세요:

```json
{
  "mcpServers": {
    "datadog": {
      "command": "/Users/{username}/.nvm/versions/node/v20.19.0/bin/node",
      "args": [
        "/Users/{username}/workspace/claude-skills/mcp/datadog/index.js"
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

### 환경 변수 설명

- `DD_API_KEY`: Datadog API 키 (필수)
- `DD_APP_KEY`: Datadog Application 키 (필수)
- `DD_SITE`: Datadog 사이트 도메인 (기본값: datadoghq.com)

### Node.js 경로 확인

```bash
which node
```

nvm을 사용하는 경우 절대 경로를 사용해야 합니다.

## 제공 기능

### 1. search-logs
Datadog 로그 검색

**예시 사용:**
```
review-prd 서비스의 최근 1시간 에러 로그 조회해줘
```

**파라미터:**
- `query` (필수): 검색 쿼리 (예: "service:review-prd status:error")
- `from`: 시작 시간 (기본값: "now-1h")
- `to`: 종료 시간 (기본값: "now")
- `limit`: 최대 결과 수 (기본값: 50)

### 2. aggregate-logs
로그 집계 및 그룹핑

**예시 사용:**
```
review-prd의 최근 24시간 에러를 타입별로 집계해줘
```

**파라미터:**
- `query` (필수): 검색 쿼리
- `groupBy` (필수): 그룹화할 필드 배열 (예: ["@error.kind", "service"])
- `from`: 시작 시간 (기본값: "now-24h")
- `to`: 종료 시간 (기본값: "now")
- `limit`: 최대 그룹 수 (기본값: 10)

### 3. search-apm-spans
APM 트레이스 및 스팬 검색

**예시 사용:**
```
review-api의 느린 요청 찾아줘
```

**파라미터:**
- `query` (필수): APM 검색 쿼리
- `from`: 시작 시간 (기본값: "now-1h")
- `to`: 종료 시간 (기본값: "now")
- `limit`: 최대 결과 수 (기본값: 50)

### 4. get-monitors
모니터 상태 조회

**예시 사용:**
```
alert 상태인 모니터 목록 보여줘
```

**파라미터:**
- `tags`: 필터링할 태그 배열 (선택)
- `state`: 상태 필터 (기본값: "all", 옵션: alert, warn, no data)

### 5. get-metrics
메트릭 데이터 조회

**파라미터:**
- `query` (필수): 메트릭 쿼리 (예: "avg:system.cpu.user{*}")
- `from`: 시작 시간 (기본값: "now-1h")
- `to`: 종료 시간 (기본값: "now")

### 6. get-dashboards
대시보드 목록 조회

**파라미터:**
- `limit`: 최대 결과 수 (기본값: 20)

### 7. get-events
이벤트 조회 (배포, 알림 등)

**파라미터:**
- `query`: 이벤트 검색 쿼리 (선택)
- `from`: 시작 시간 (기본값: "now-1d")
- `to`: 종료 시간 (기본값: "now")

## 시간 형식

시간 파라미터는 다음 형식을 지원합니다:
- `now`: 현재 시각
- `now-Xm`: X분 전 (예: now-30m = 30분 전)
- `now-Xh`: X시간 전 (예: now-1h = 1시간 전)
- `now-Xd`: X일 전 (예: now-7d = 7일 전)

## 보안

- API 키는 반드시 환경 변수로 관리하세요
- mcp.json 파일 권한: `chmod 600 ~/.claude/mcp.json`
- Git에 커밋하지 않도록 주의하세요

## 참고 자료

- [Datadog API 문서](https://docs.datadoghq.com/api/latest/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [가이드 문서](../../guide/datadog-connection-guide.md)
