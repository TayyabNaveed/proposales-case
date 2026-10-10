import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fieldwork · From evidence to offer",
  description: "A synthetic business report to reviewed proposal workflow.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
