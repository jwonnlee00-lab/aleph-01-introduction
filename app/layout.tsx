import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "정원 | 경험과 취향",
  description: "엔지니어 경험과 새로운 학습, 그리고 세 가지 취향을 소개합니다.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
