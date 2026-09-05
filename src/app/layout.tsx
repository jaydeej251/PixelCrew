import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: PRODUCT_NAME,
  description:
    "Watch your AI company work — hire agents by role, approve the plan, bring your own keys.",
  icons: {
    icon: [{ url: "/marketing/icon.png", type: "image/png" }],
    apple: [{ url: "/marketing/icon.png", type: "image/png" }],
  },
  openGraph: {
    title: PRODUCT_NAME,
    description:
      "Your AI company, visible. Hire by role. Watch the floor. You approve.",
    images: [{ url: "/marketing/og-with-logo.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
    description:
      "Your AI company, visible. Hire by role. Watch the floor. You approve.",
    images: ["/marketing/og-with-logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
