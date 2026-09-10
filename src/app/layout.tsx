import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: { default: "TSHZS", template: "%s | TSHZS" },
  description: "Evidence a řízení Technické služby HZS ČEPRO – stanice Mstětice",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#b91c1c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="cs"><body className={inter.className}>{children}</body></html>;
}
