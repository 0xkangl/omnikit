import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { COOKIE_KEYS } from "../libs/storage-keys";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// 显示体：Space Grotesk —「制图仪器」主题的标题字
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
  display: "swap",
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const cookieStore = await cookies();
  const isDark = cookieStore.get(COOKIE_KEYS.theme)?.value === "dark";

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}${isDark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
