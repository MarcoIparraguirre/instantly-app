import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "MiSender — Cold Email & Deliverability Platform",
  description: "Plataforma de prospección en frío, secuencias automatizadas y entregabilidad B2B con Supabase.",
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
