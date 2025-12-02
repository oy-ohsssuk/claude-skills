---
name: validate-skill
description: 패키징 없이 스킬 디렉토리 구조와 내용을 검증합니다. 스킬이 모든 요구사항을 충족하는지 확인하는 데 사용합니다.
args:
  - name: skill_path
    description: 검증할 스킬 디렉토리의 경로
    required: true
---

# 스킬 검증

패키지를 생성하지 않고 스킬 디렉토리가 모든 요구사항을 충족하는지 검증합니다.

## 사용법

```bash
/validate-skill ./내-스킬
```

## 검사 항목

- YAML frontmatter 형식과 필수 필드 (`name`, `description`)
- 스킬 명명 규칙과 디렉토리 구조
- 설명의 완성도와 품질
- 파일 구성과 리소스 참조
- SKILL.md의 적절한 마크다운 형식

## 스크립트 실행

```bash
python ~/skill-creator-tools/scripts/quick_validate.py {{skill_path}}
```

## 장점

- 패키징 오버헤드 없이 빠른 검증
- 개발 초기에 문제 식별
- 공유 전 스킬이 표준을 충족하는지 확인
- 수정을 위한 상세한 오류 보고서 제공

스킬 개발 중에 문제를 조기에 발견하기 위해 사용하고, 배포할 준비가 되면 `/package-skill`을 사용하세요.