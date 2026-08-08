import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Bengali, Space_Grotesk } from "next/font/google";

import "./globals.css";

import { getLocale, getTheme } from "@/lib/supabase/server";

// Headings and every figure. Space Grotesk descends from Space Mono, so its
// numerals keep a mechanical, metered quality — the right voice for a business
// whose day ends in a fare tally.
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// Interface text, where neutrality beats character.
const inter = Inter({
  variable: "--font-latin",
  subsets: ["latin"],
  display: "swap",
});

// Bangla is the driver's default language, so the script needs a real font
// rather than whatever the device happens to fall back to.
const bengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ride Monitor",
  description: "Daily earnings, expenses and profit for your vehicle business.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Ride Monitor", statusBarStyle: "black-translucent" },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();

  return {
    // The browser chrome follows the chosen theme, not the OS setting.
    themeColor: theme === "dark" ? "#0a0f1c" : "#f7f8fa",
    // The driver taps small money fields; letting them zoom is an accessibility
    // requirement, not a nicety.
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [theme, locale] = await Promise.all([getTheme(), getLocale()]);

  return (
    <html
      // Screen readers pick their voice from this; Bangla text read with an
      // English engine defeats the Bangla-first design.
      lang={locale}
      data-theme={theme}
      className={`${display.variable} ${inter.variable} ${bengali.variable} h-full`}
    >
      <body
        className="flex min-h-full flex-col"
        style={{
          // Bengali is appended to both stacks so Bangla renders in a real
          // face rather than falling back to whatever the device supplies.
          ["--font-display-face" as string]: "var(--font-display), var(--font-bengali)",
          ["--font-body-face" as string]: "var(--font-latin), var(--font-bengali)",
        }}
      >
        {children}
      </body>
    </html>
  );
}
