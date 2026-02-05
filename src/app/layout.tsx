import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zip Territory Builder | Arachnid Works",
  description: "Build and manage sales territories by painting zip codes on a map",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
