import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codebase RAG",
  description: "Index and query your codebase with AI",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
