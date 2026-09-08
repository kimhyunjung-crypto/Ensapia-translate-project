import type { Metadata } from "next";
import { PeopleWorkspace } from "@/components/people-workspace";

export const metadata: Metadata = { title: "인명·호칭" };

export default function PeoplePage() {
  return (
    <section aria-labelledby="people-heading">
      <div className="page-intro people-page-intro">
        <div>
          <p className="section-kicker">PEOPLE</p>
          <h2 id="people-heading">인명·호칭 기준</h2>
          <p>여러 한국어 표현을 하나의 일본어 표기로 묶고 역방향 한국어 표기도 관리합니다.</p>
        </div>
        <span className="privacy-badge">양방향 표기 · 암호화 저장</span>
      </div>

      <PeopleWorkspace />
    </section>
  );
}
