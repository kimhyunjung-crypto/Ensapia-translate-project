import type { Metadata } from "next";
import { EmptyWorkspace } from "@/components/empty-workspace";

export const metadata: Metadata = { title: "인명·호칭" };

export default function PeoplePage() {
  return (
    <EmptyWorkspace
      eyebrow="PEOPLE"
      title="인명·호칭 기준"
      description="메시지 속 이름을 인식해 언어별 표기와 호칭을 일관되게 적용합니다."
      icon="P"
      upcoming={["한국어 인식 표현", "일본어·한국어 통합 표기", "규칙 활성화와 변경 기록"]}
    />
  );
}
