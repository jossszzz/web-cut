import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SITE_URL } from "@/lib/site";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: "WebCut Studio",
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "WebCut Studio",
    title: "WebCut Studio — Editor de video en el navegador",
    description: "Edita video sin subir tus archivos: timeline multipista, keyframes, transiciones y exportación MP4.",
  },
  title: {
    default: "WebCut Studio",
    template: "%s · WebCut Studio",
  },
  description: "Editor de video en el navegador. Local-first: tus archivos no salen de tu dispositivo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <TooltipProvider delay={400}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
