import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "НетСайта — компании без сайта",
  description: "Поиск организаций без сайта через API Яндекс Карт.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
