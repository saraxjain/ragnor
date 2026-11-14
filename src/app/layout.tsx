import type { Metadata, Viewport } from "next";
import { Lato, Merriweather } from "next/font/google";
import Link from "next/link";
import { Header } from "@/components/Header";
import { DISCLAIMER } from "@/lib/copy";
import "./globals.css";

const heading = Merriweather({ subsets: ["latin"], weight: ["700", "900"], variable: "--font-heading", display: "swap" });
const body = Lato({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Ragnor",
  description: "Daily athlete check-ins and transparent, rule-based risk flags for athletic trainers.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${heading.variable} ${body.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Header />
        <main id="main">
          {children}
          <p className="disclaimer">
            {DISCLAIMER} <Link href="/">Home</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
