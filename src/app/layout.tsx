import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ForgeToaster } from "@/components/forge/toaster";

// Outfit is the prototype's display/body face. Exposed as the CSS var
// `--font-outfit`, which globals.css wires into `--font-sans` and <body>.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Forge",
  description: "Forge Bootcamp — administración del gimnasio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ed" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning: next-themes sets the `class` on <html> before
  // hydration, so the server/client mismatch on that attribute is expected.
  return (
    <html lang="es-MX" className={outfit.variable} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          {children}
          <ForgeToaster />
        </Providers>
      </body>
    </html>
  );
}
