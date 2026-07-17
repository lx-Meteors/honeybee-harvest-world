import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小蜜蜂采蜜世界",
  description: "左右晃动手机，帮助小蜜蜂穿过花海，把甜甜的花蜜安全送回蜂巢。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
