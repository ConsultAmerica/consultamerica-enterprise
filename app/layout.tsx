import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SITE_URL } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  // Resolves relative Open Graph images and canonical links to absolute URLs.
  // Canonicals are set per page, never here: a layout canonical would be
  // inherited by every page that did not override it.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Consult America — Engineering, AI & enterprise transformation",
    template: "%s · Consult America",
  },
  description:
    "Consult America unites engineering, AI, and enterprise consulting — with the specialized technology talent to design it, build it, and run it in production.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500;600&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
