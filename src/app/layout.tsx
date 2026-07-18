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
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
