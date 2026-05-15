# Gemini UI Prompt Updates - 2026-04-24

이 문서는 `docs/gemini-ui-prompt.md`의 날짜별 추가 변경사항만 기록한다.
최신 전체 결과는 항상 메인 문서를 기준으로 본다.

## Added Today

### 1. Entity category assignment rules

- 런타임 엔터티는 최대 3개의 `category_ids`를 가질 수 있도록 명시했다.
- 엔터티에서 입력 가능한 속성은 선택된 분류들의 effective attribute binding 결과를 따라야 한다고 정리했다.
- 다중 분류 시 속성 집합은 `rules.multi_category.attribute_merge_strategy`를 기준으로 파생되도록 명시했다.

### 2. UI generation requirements

- Gemini가 생성할 관리웹에서 엔터티 분류-속성 파생 로직을 1급 기능으로 다루도록 요구사항을 강화했다.
- Entity Model 화면에 다음 preview 개념을 추가했다:
  - 가상의 엔터티에 대해 최대 3개 분류 선택
  - 해당 분류 조합에서 입력 가능한 속성 표시
  - enum 속성의 `allowed_terms` 축약 결과 표시
  - `union | intersection | priority` 중 어떤 전략으로 계산되었는지 설명

### 3. Documentation policy

- 메인 문서에는 항상 최신 통합 프롬프트를 유지한다.
- 점진적으로 추가되는 변경 사항은 날짜별 업데이트 문서에만 기록한다.
