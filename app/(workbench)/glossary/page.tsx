import type { Metadata } from "next";
import { EmptyWorkspace } from "@/components/empty-workspace";

export const metadata: Metadata = { title: "용어집" };

export default function GlossaryPage() {
  return (
    <EmptyWorkspace
      eyebrow="GLOSSARY"
      title="ENSAPIA 용어집"
      description="서비스명과 고유 용어의 한국어·일본어 표기를 관리합니다."
      icon="G"
      upcoming={["용어 검색과 필터", "용어 등록·수정", "파일로 여러 건 가져오기"]}
    />
  );
}
