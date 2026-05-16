import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hamza and Shouq RSVP",
  description: "Wedding invitation control room",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
