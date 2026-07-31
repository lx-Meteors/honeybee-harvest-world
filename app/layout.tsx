import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "小蜜蜂采蜜世界",
    description: "左右晃动手机，踩花不断向上，收集蜂蜜并冲击最高采蜜值。",
    openGraph: {
      title: "小蜜蜂采蜜世界",
      description: "自动弹跳，左右操控，挑战越来越难的无限花路。",
      images: [{ url: image, width: 1536, height: 1024, alt: "小蜜蜂采蜜世界" }],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="preload"
          as="image"
          href="/bee-character-flying-final-v2.png?v=20260731"
          fetchPriority="high"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
