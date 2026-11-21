import { BillingBar } from "@/components/billing/billing-bar";
import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/components/layout/query-provider";
import { AppHeader } from "@/components/layout/app-header";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { headerTopClass } from "@/lib/auth/impersonation-ui";
import { AccessProvider } from "@/components/permissions/access-provider";
import { loadInitialMe } from "@/lib/me/payload";
import { sendWaitingToOnboardingOn } from "@/lib/permissions/onboarding";
import { PATHNAME_HEADER } from "@/lib/permissions/onboarding-route";
import { OnboardingGuard } from "@/components/permissions/onboarding-guard";

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
  // with the element it offsets against. loadInitialMe resolves the caller once for this render
  // (shared with the page through cache()) and builds the same payload /api/me returns, so the
  // first HTML already has the right buttons (D504). On a full page load a waiting person is sent
  // to /onboarding here, from the same cached caller (spec 4.4). The proxy sends the path only on
  // a full page load (isPageLoad): a redirect in an RSC render of this layout would stay in the
  // browser's copy of it and re-fire on every navigation. OnboardingGuard covers soft navigations.
  const [{ isImpersonating }, me] = await Promise.all([
    resolveImpersonationState(),
    loadInitialMe(),
    headers().then((h) => sendWaitingToOnboardingOn(h.get(PATHNAME_HEADER))),
  ]);

  return (
    <html
      lang="en"
      className={`${clash.variable} ${gilroy.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QueryProvider>
        <AccessProvider initial={me}>
        <OnboardingGuard />
        <ImpersonationBanner />
        <AppHeader className={headerTopClass(isImpersonating)} />
        <BillingBar />
        {children}
        <Toaster />
        </AccessProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
