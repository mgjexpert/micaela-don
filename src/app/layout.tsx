import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = (process.env.APP_BASE_URL ?? "https://ajudar.charity").replace(/\/$/, "");
const campaignUrl = siteUrl + "/micaela";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Um Gesto de Apoio — A história da Micaela",
    template: "%s · Um Gesto de Apoio",
  },
  description:
    "Campanha de solidariedade. Cada contribuição é um gesto concreto de cuidado. Dados de pagamento verificados. Confirmação do donativo por fornecedor de pagamentos ou administrador.",
  keywords: ["solidariedade", "donativo", "Micaela", "campanha", "apoio", "PIX", "SEPA"],
  authors: [{ name: "Um Gesto de Apoio" }],
  creator: "Um Gesto de Apoio",
  publisher: "Um Gesto de Apoio",
  applicationName: "Um Gesto de Apoio",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/icon.svg",
  },
  openGraph: {
    type: "website",
    locale: "pt_PT",
    url: campaignUrl,
    siteName: "Um Gesto de Apoio — A história da Micaela",
    title: "Um Gesto de Apoio — A história da Micaela",
    description: "Campanha de solidariedade. Cada contribuição é um gesto concreto de cuidado.",
    images: [
      {
        url: "/og-image.png",
        width: 1152,
        height: 864,
        alt: "Um Gesto de Apoio — A história da Micaela",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Um Gesto de Apoio — A história da Micaela",
    description: "Campanha de solidariedade. Cada contribuição é um gesto concreto de cuidado.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: campaignUrl,
  },
  category: "solidariedade",
};

export const viewport = {
  themeColor: "#e11d48",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
