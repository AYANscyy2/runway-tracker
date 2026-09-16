import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://runwaytr.space";
const TITLE = "Runway — application tracker";
const DESCRIPTION =
  "Track job applications and hackathons — deadlines, follow-ups and next actions — without losing the thread.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Runway",
  },
  description: DESCRIPTION,
  applicationName: "Runway",
  keywords: ["job tracker", "application tracker", "hackathon tracker", "job search", "off-campus placements"],
  authors: [{ name: "Mohammed Ayan" }],
  creator: "Mohammed Ayan",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Runway",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  appleWebApp: {
    capable: true,
    title: "Runway",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ae2f34" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0404" },
  ],
  colorScheme: "light dark",
};

// Runs before first paint so the stored theme applies without a light→dark flash.
const themeScript = `(function(){try{var t=localStorage.getItem("runway-theme");if(!t){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <ToastProvider>
          <main className="flex-1">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
