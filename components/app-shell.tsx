"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EnvironmentStatus } from "@/lib/environment";

const navigation = [
  { href: "/translate", label: "번역", shortLabel: "T" },
  { href: "/glossary", label: "용어집", shortLabel: "G" },
  { href: "/people", label: "인명·호칭", shortLabel: "P" },
  { href: "/settings", label: "운영 설정", shortLabel: "S" },
] as const;

const titles: Record<string, string> = {
  "/translate": "비즈니스 메시지 번역",
  "/glossary": "ENSAPIA 용어집",
  "/people": "인명·호칭 기준",
  "/settings": "운영 설정",
};

export function AppShell({
  children,
  environmentStatus,
}: {
  children: React.ReactNode;
  environmentStatus: EnvironmentStatus;
}) {
  const pathname = usePathname();
  const title = titles[pathname] ?? "번역 워크벤치";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <header className="app-navigation">
        <Link className="brand" href="/translate" aria-label="ENSAPIA 번역 홈">
          <Image
            src="/ensapia-logo.png"
            alt="ENSAPIA"
            width={158}
            height={28}
            priority
          />
          <span>AI Translation Workbench</span>
        </Link>

        <nav className="primary-navigation" aria-label="주요 메뉴">
          {navigation.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                className="navigation-item"
                data-active={active || undefined}
                aria-current={active ? "page" : undefined}
                href={item.href}
              >
                <span className="navigation-icon" aria-hidden="true">{item.shortLabel}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="local-status" title="이 앱은 이 컴퓨터에서만 열립니다.">
          <span className="status-dot" aria-hidden="true" />
          <span>로컬 전용</span>
        </div>
      </header>

      <main className="app-main" id="main-content" tabIndex={-1}>
        <header className="app-topbar">
          <div>
            <span className="workspace-label">ENSAPIA SEOUL</span>
            <h1>{title}</h1>
          </div>
          <span className="mode-badge">{environmentStatus.dataMode === "demo" ? "DEMO" : "REAL"}</span>
        </header>

        {!environmentStatus.ready && (
          <aside className="setup-notice" role="status" data-testid="setup-notice">
            <span className="setup-notice-icon" aria-hidden="true">!</span>
            <div>
              <strong>AI 연결 준비가 필요합니다</strong>
              <p>
                프로젝트의 <code>.env.example</code>을 <code>.env.local</code>로 복사한 뒤,
                OpenAI·Gemini 연결 정보와 데이터 암호화 키를 입력해 주세요. 비밀 값은 화면에 표시되지 않습니다.
              </p>
            </div>
          </aside>
        )}

        <div className="screen-content">{children}</div>
      </main>
    </div>
  );
}
