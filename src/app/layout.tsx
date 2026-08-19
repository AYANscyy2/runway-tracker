import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Runway — application tracker",
  description: "Track off-campus job leads and hackathons without losing the thread.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-gray-50 dark:bg-zinc-900 min-h-screen flex flex-col">

        <main className="flex-1">
          {children}
        </main>
      </body>
    </html>
  );
}
