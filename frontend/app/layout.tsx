import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/lib/clerk-appearance";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Lattice — Runtime-Trace Data-Structure Visualizer",
  description:
    "Runtime-trace based data-structure visualizer with dynamic input. Next.js frontend, Rust + Tokio + Axum backend.",
};

/** Explicit rather than inherited from Next.js's default so the two
 * accessibility-critical fields are stated on purpose: no `maximumScale`
 * and no `userScalable: false`. Pinch-zoom is how people with low vision
 * read a page — the fix for a layout that breaks under zoom is a layout
 * that survives zoom (see `globals.css`), never a page that forbids it. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d1117",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geistMono.variable} antialiased`}
    >
      <body className="min-h-dvh bg-[var(--bg-base)] font-serif text-[var(--text-primary)]">
        <ClerkProvider appearance={clerkAppearance}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
