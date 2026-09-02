import type { Metadata } from "next";
import { EmptyWorkspace } from "@/components/empty-workspace";

export const metadata: Metadata = { title: "운영 설정" };

export default function SettingsPage() {
  return (
    <EmptyWorkspace
      eyebrow="SETTINGS"
      title="운영 설정"
      description="AI 연결 상태, 비용과 데이터 보관 정책을 확인합니다."
      icon="S"
      upcoming={["AI 모델과 연결 상태", "상황별 말투 기준", "비용·저장·삭제 정책"]}
    />
  );
}
