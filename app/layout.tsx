import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import LiquidGlassNav from "@/components/ui/liquid-glass-nav";
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
  title: "MantaStudio — Premium Dutch Digital Design",
  description:
    "A creative practice for ambitious brands. Slow, deliberate digital experiences built on craft, weight, and quiet motion. Amsterdam, NL.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LiquidGlassNav />
        {children}
      </body>
    </html>
  );
}
