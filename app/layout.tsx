import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ENSAPIA 번역 워크벤치",
    template: "%s | ENSAPIA 번역 워크벤치",
  },
  description: "ENSAPIA Seoul의 한국어·일본어 Slack 비즈니스 메시지 번역 워크벤치",
  robots: { index: false, follow: false },
  openGraph: {
    title: "ENSAPIA 번역 워크벤치",
    description: "ENSAPIA Seoul의 한국어·일본어 Slack 비즈니스 메시지 번역 워크벤치",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
