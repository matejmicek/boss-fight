import type { Metadata } from "next";
import { Geist_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const pixel = Press_Start_2P({
  variable: "--font-pixel",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Boss Fight",
  description: "VC Term Sheet Negotiation Game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} ${pixel.variable} h-full dark`}>
      <body className="min-h-full flex flex-col bg-black text-white font-[family-name:var(--font-mono)]">
        {children}
      </body>
    </html>
  );
}
