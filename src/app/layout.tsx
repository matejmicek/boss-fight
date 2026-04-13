import type { Metadata } from "next";
import { Geist_Mono, Geist } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const mono = Geist_Mono({
  variable: "--font-mono",
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
    <html lang="en" className={cn("h-full", mono.variable, "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col bg-black text-white font-[family-name:var(--font-mono)]">
        {children}
      </body>
    </html>
  );
}
