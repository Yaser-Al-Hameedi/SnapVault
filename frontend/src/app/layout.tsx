import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "SnapVault",
  description: "AI-powered receipts & documents vault",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Providers>
          {/* Navbar on all pages */}
          <Header />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
