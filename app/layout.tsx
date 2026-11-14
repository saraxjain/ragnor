import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppBar } from "@/components/AppBar.tsx";

export const metadata: Metadata = {
  title: "Ragnor: an AI athletic trainer for every school",
  description:
    "Wearables collect the data. Ragnor turns it into a decision. Follow-up after every hit, phone-video landing screens and a coach view for high schools without a full-time athletic trainer.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Lato:wght@400;700;900&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <AppBar />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}
