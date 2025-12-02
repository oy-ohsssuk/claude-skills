---
name: init-skill
description: 템플릿과 함께 새로운 스킬 디렉토리 구조를 초기화합니다. 처음부터 새로운 스킬을 생성할 때 사용합니다.
args:
  - name: skill_name
    description: 생성할 스킬의 이름
    required: true
  - name: output_path
    description: 스킬 디렉토리를 생성할 경로 (기본값은 현재 디렉토리)
    required: false
---

# 새 스킬 초기화

필요한 모든 템플릿과 함께 새로운 스킬 디렉토리 구조를 생성합니다.

## 사용법

현재 디렉토리에 스킬 초기화:
```bash
/init-skill 내-스킬명
```

특정 경로에 스킬 초기화:
```bash
/init-skill 내-스킬명 /경로/출력/위치
```

## 수행 작업

1. 스킬 디렉토리 생성: `{{skill_name}}/`
2. 적절한 frontmatter와 TODO 플레이스홀더가 있는 `SKILL.md` 생성
3. 리소스 디렉토리 생성: `scripts/`, `references/`, `assets/`
4. 커스터마이징하거나 삭제할 수 있는 예제 파일 추가

## 스크립트 실행

skill-creator 도구를 사용하여 init 스크립트가 실행됩니다:

```bash
python ~/skill-creator-tools/scripts/init_skill.py {{skill_name}} {{output_path | default: "."}}
```

## 다음 단계

초기화 후:
1. 생성된 예제 파일들을 커스터마이징하거나 삭제
2. 스크립트, 참조 자료, 자산 추가
3. 특정 지침으로 SKILL.md 업데이트
4. 스킬 테스트
5. `/package-skill`로 패키징