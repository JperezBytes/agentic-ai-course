import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Migration Agent",
  description: "AI-powered code migration workflow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
