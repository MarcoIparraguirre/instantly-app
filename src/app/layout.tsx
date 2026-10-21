import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Instantly Copilot — Outbound & Deliverability",
  description: "AI Copilot and Cold Outreach sequence automation platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0b0f17] text-slate-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
