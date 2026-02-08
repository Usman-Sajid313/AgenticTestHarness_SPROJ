import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Agentic Test Harness",
  description: "A platform to test and evaluate AI agents with custom tools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full overflow-hidden">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex h-full min-h-0 flex-col overflow-hidden`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-black">
          {children}
        </div>
      </body>
    </html>
  );
}
