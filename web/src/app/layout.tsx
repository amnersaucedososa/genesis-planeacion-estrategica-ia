import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/AppSidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Génesis Empresarial · Planeación Estratégica IA",
  description: "Sistema de inteligencia para planeación estratégica con Multi-LLM, RAG y alertas automáticas — Fundación Génesis Empresarial",
  icons: {
    icon: [
      { url: "/genesis-favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/genesis-192.png",        sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/genesis-apple-touch.png", sizes: "180x180" },
  },
  openGraph: {
    title: "Génesis Empresarial · Planeación Estratégica IA",
    description: "Dashboard ejecutivo con IA Multi-LLM — Fundación Génesis Empresarial",
    images: [{ url: "/genesis-logo.jpg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Script anti-FOUC: aplica .dark antes del primer render */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="flex h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        <AppSidebar />
        <div className="flex-1 overflow-auto">{children}</div>
      </body>
    </html>
  );
}
