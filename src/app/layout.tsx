import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { HeaderBrand } from "@/components/layout/header-brand";
import { HeaderActions } from "@/components/layout/header-actions";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { headerTopClass } from "@/lib/auth/impersonation-ui";
import { cn } from "@/lib/utils";

// Yuvabe brand fonts (ref/Yuvabe Studios Design System). Two families only.
const clash = localFont({
  src: [
    { path: "../fonts/clash-display/ClashDisplayExtralight.woff2", weight: "200" },
    { path: "../fonts/clash-display/ClashDisplayLight.woff2", weight: "300" },
    { path: "../fonts/clash-display/ClashDisplayRegular.woff2", weight: "400" },
    { path: "../fonts/clash-display/ClashDisplayMedium.woff2", weight: "500" },
    { path: "../fonts/clash-display/ClashDisplaySemibold.woff2", weight: "600" },
    { path: "../fonts/clash-display/ClashDisplayBold.woff2", weight: "700" },
  ],
  variable: "--font-clash",
  display: "swap",
});
const gilroy = localFont({
  src: [
    { path: "../fonts/gilroy/Gilroy-Light.ttf", weight: "300" },
    { path: "../fonts/gilroy/Gilroy-Regular.ttf", weight: "400" },
    { path: "../fonts/gilroy/Gilroy-Medium.ttf", weight: "500" },
    { path: "../fonts/gilroy/Gilroy-SemiBold.ttf", weight: "600" },
    { path: "../fonts/gilroy/Gilroy-Bold.ttf", weight: "700" },
  ],
  variable: "--font-gilroy",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CreativeOS — Yuvabe Studios",
  description: "Canvas-based asset generation for reel production",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // resolveImpersonationState is cache()d per request, so this is deduped with the
  // banner's own call — it costs nothing, and it keeps the header's offset colocated
  // with the element it offsets against.
  const { isImpersonating } = await resolveImpersonationState();

  return (
    <html
      lang="en"
      className={`${clash.variable} ${gilroy.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ImpersonationBanner />
        <header
          className={cn(
            "sticky z-40 flex h-16 shrink-0 items-center justify-between border-b border-border/80 bg-background/80 px-6 backdrop-blur-md",
            headerTopClass(isImpersonating),
          )}
        >
          <HeaderBrand />
          <HeaderActions />
        </header>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
