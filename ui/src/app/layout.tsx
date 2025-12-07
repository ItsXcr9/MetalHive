import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "@/styles/globals.css";
import "@xterm/xterm/css/xterm.css";
import { Providers } from "@/components/Providers";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MetalHive - Docker Fleet Orchestrator",
  description: "AI-powered bare-metal Docker fleet management",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={outfit.className}>
        <div className="texture-overlay" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
