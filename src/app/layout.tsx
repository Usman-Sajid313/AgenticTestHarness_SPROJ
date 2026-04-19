import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en" className="h-full">
      <body className="antialiased h-full bg-zinc-950 text-zinc-100">
        <div className="min-h-full overflow-y-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
