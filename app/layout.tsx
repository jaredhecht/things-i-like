import type { Metadata } from "next";
import { AuthProvider } from "@/src/components/AuthProvider";
import { Geist, Geist_Mono } from "next/font/google";
import { OAuthHashRecovery } from "@/src/components/OAuthHashRecovery";
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
  metadataBase: new URL("https://thingsilike.app"),
  title: "Things I Like",
  description: "Share things you like.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/til-icon-large.svg",
  },
  openGraph: {
    siteName: "Things I Like",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Things I Like",
    description: "Share things you like.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <OAuthHashRecovery />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
