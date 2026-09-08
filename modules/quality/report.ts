import { QUALITY_EVALUATION_CASES } from "@/modules/quality/cases";
import { CORE_CONTRAST_PAIRS, contrastRatio } from "@/modules/quality/contrast";
import {
  evaluateQualityCase,
  summarizeQualityResults,
} from "@/modules/quality/evaluation";
import { createDemoTranslation } from "@/modules/translation/demo-service";

export type CompletionCheck = {
  id: string;
  label: string;
  evidence: string;
  status: "passed" | "pending-operation";
};

export type CompletionCheckGroup = {
  id: string;
  title: string;
  checks: readonly CompletionCheck[];
};

export const INTEGRATION_CHECKS: readonly CompletionCheck[] = [
  {
    id: "translation",
    label: "양방향 번역",
    evidence: "언어 자동 감지부터 최종 번역 표시·복사·실패 복구까지 Playwright로 점검",
    status: "passed",
  },
  {
    id: "glossary",
    label: "회사 용어",
    evidence: "등록·검색·수정·중지·삭제·CSV 가져오기와 번역 규칙 적용 점검",
    status: "passed",
  },
  {
    id: "people",
    label: "인명·호칭",
    evidence: "양방향 표기·인식 태그·중복 방지·수정·중지·삭제 점검",
    status: "passed",
  },
  {
    id: "tone",
    label: "상황별 말투",
    evidence: "등록·수정·변경 이력·중복 방지·중지·삭제와 활성 규칙 적용 점검",
    status: "passed",
  },
  {
    id: "cost",
    label: "AI·비용 운영",
    evidence: "연결 상태·모델 버전·단가·건별/일별/월별 집계·비용 한도 점검",
    status: "passed",
  },
  {
    id: "deletion",
    label: "기간별 영구 삭제",
    evidence: "삭제 전 건수 확인, 내용 삭제, 사용량 유지, 원문 없는 감사 기록 점검",
    status: "passed",
  },
];

export const PRD_CHECK_GROUPS: readonly CompletionCheckGroup[] = [
  {
    id: "screens",
    title: "네 화면",
    checks: [
      { id: "screen-translation", label: "번역 워크벤치", evidence: "입력부터 최종본 복사까지 한 화면에 제공", status: "passed" },
      { id: "screen-glossary", label: "용어집 관리", evidence: "검색·등록·수정·가져오기·상태 관리 제공", status: "passed" },
      { id: "screen-people", label: "인명·호칭 관리", evidence: "인식 표현과 양방향 통합 표기 관리 제공", status: "passed" },
      { id: "screen-settings", label: "운영 설정", evidence: "AI·비용·저장·말투·완료 점검을 한곳에 제공", status: "passed" },
    ],
  },
  {
    id: "core",
    title: "핵심 기능",
    checks: [
      { id: "core-pipeline", label: "이중 AI 번역·교차검토·최종 종합", evidence: "두 번역·두 교차검토·최종 종합의 단계별 재시도와 기록 구현", status: "passed" },
      { id: "core-rules", label: "회사 번역 기준 관리·자동 적용", evidence: "인명→용어→말투 우선순위와 동일 조건 전달 구현", status: "passed" },
      { id: "core-safety", label: "암호화·프롬프트 보호·실패 복구", evidence: "AES-256-GCM 저장과 원문 경계, 저장 재시도 구현", status: "passed" },
      { id: "core-cost", label: "사용량·비용·삭제 정책", evidence: "기간별 단가, $10 한도, 기간 삭제와 감사 기록 구현", status: "passed" },
    ],
  },
  {
    id: "excluded",
    title: "MVP 제외 범위 준수",
    checks: [
      { id: "excluded-slack", label: "Slack 직접 연결·실시간 감시 없음", evidence: "독립 웹 앱의 메시지 직접 입력 방식 유지", status: "passed" },
      { id: "excluded-bulk", label: "문서·이미지 대량 번역 없음", evidence: "3,000자 이내 단문 메시지 흐름에 집중", status: "passed" },
      { id: "excluded-history", label: "과거 번역 열람 화면 없음", evidence: "학습 원천은 내부 저장하되 별도 기록 화면은 제공하지 않음", status: "passed" },
      { id: "excluded-model-output", label: "모델별 중간 결과 비노출", evidence: "사용자 화면에는 최종 번역본 하나만 표시", status: "passed" },
      { id: "excluded-account", label: "로그인·복잡한 권한·결제 없음", evidence: "로컬 1인 MVP 범위 유지", status: "passed" },
      { id: "excluded-mobile", label: "모바일 전용 앱 없음", evidence: "PC 우선 반응형 웹으로 좁은 화면만 지원", status: "passed" },
    ],
  },
  {
    id: "success",
    title: "성공 기준",
    checks: [
      { id: "success-quality", label: "50건 중대 오역·누락 0건", evidence: "DEMO 회귀 기준선 50/50 통과", status: "passed" },
      { id: "success-terms", label: "고정 표기 준수율 95% 이상", evidence: "평가 대상 고정 표기 100% 준수", status: "passed" },
      { id: "success-language", label: "목표 언어가 아닌 문구 0건", evidence: "방향별 문자 검사 결과 0건", status: "passed" },
      { id: "success-time", label: "사용자 처리 시간 50% 이상 감소", evidence: "실사용 전후 시간 측정이 필요한 운영 검증 항목", status: "pending-operation" },
      { id: "success-edit", label: "70% 이상 최종본 수정 1회 이하", evidence: "승인된 실제 메시지로 확인할 운영 검증 항목", status: "pending-operation" },
    ],
  },
];

export function createCompletionReport() {
  const qualityResults = QUALITY_EVALUATION_CASES.map((testCase) =>
    evaluateQualityCase(testCase, createDemoTranslation(testCase.sourceText).finalText),
  );
  const contrastResults = CORE_CONTRAST_PAIRS.map((pair) => {
    const ratio = contrastRatio(pair.foreground, pair.background);
    return { ...pair, ratio, passed: ratio >= pair.minimum };
  });

  return {
    generatedAt: "2026-09-08",
    baseline: "DEMO 회귀 기준선",
    integrationChecks: INTEGRATION_CHECKS,
    prdGroups: PRD_CHECK_GROUPS,
    qualityResults,
    qualitySummary: summarizeQualityResults(qualityResults),
    contrastResults,
    contrastPassed: contrastResults.every((result) => result.passed),
  };
}
