import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AppStateProvider } from "@/lib/app-state";
import { Toaster } from "@/components/ui/sonner";

// Display / editorial — high-character headings & brand.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
// UI / body — clean, legible grotesk (not Inter/Roboto).
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});
// Mono — meta labels, counts, code-feel.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CreativeOS",
  description: "Canvas-based asset generation for reel production",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${hanken.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppStateProvider>
          <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center border-b border-border/70 bg-background/70 px-5 backdrop-blur-md">
            <Link
              href="/"
              className="font-display text-lg font-semibold tracking-tight"
            >
              Creative<span className="text-primary">OS</span>
            </Link>
          </header>
          {children}
        </AppStateProvider>
        <Toaster />
      </body>
    </html>
  );
}
