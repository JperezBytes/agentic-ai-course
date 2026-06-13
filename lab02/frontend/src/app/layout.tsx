import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Analyzer",
  description: "AI-powered code analysis",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
