---
name: package-skill
description: 검증 후 스킬을 배포 가능한 .skill 파일로 패키징합니다. 완성된 스킬을 배포할 준비가 되었을 때 사용합니다.
args:
  - name: skill_path
    description: 패키징할 스킬 디렉토리의 경로
    required: true
  - name: output_path
    description: .skill 파일의 출력 디렉토리 (기본값은 현재 디렉토리)
    required: false
---

# 스킬 패키징

자동 검증과 함께 완성된 스킬을 배포 가능한 .skill 파일로 패키징합니다.

## 사용법

현재 디렉토리에서 스킬 패키징:
```bash
/package-skill ./내-스킬
```

커스텀 출력 위치로 패키징:
```bash
/package-skill ./내-스킬 ./dist
```

## 수행 작업

1. **스킬 자동 검증**:
   - YAML frontmatter 형식과 필수 필드
   - 스킬 명명 규칙과 디렉토리 구조
   - 설명의 완성도와 품질
   - 파일 구성과 리소스 참조

2. **검증 통과 시 스킬 패키징**:
   - `.skill` 파일 생성 (확장자가 .skill인 zip 형식)
   - 적절한 디렉토리 구조를 유지하며 모든 파일 포함
   - 스킬 이름을 따라 파일 명명 (예: `내-스킬.skill`)

## 스크립트 실행

```bash
python ~/skill-creator-tools/scripts/package_skill.py {{skill_path}} {{output_path | default: "."}}
```

## 참고사항

- 검증이 실패하면 오류가 보고되고 패키지가 생성되지 않습니다
- 검증 오류를 수정하고 다시 실행하세요
- 결과 .skill 파일은 다른 사람들과 공유하고 설치할 수 있습니다
- .skill 파일은 확장자가 다른 표준 zip 파일입니다