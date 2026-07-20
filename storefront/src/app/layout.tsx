import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "../components/CartProvider";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";

const inter = Inter({ subsets: ["latin"] });

async function getWebConfig() {
  try {
    const res = await fetch("http://localhost:8090/api/storefront/config", { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (e) {
    // Ignore error
  }
  return {
    store_name: "Tienda Oficial",
    favicon_url: ""
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const cfg = await getWebConfig();
  
  const meta: Metadata = {
    title: cfg.store_name || "Tienda Oficial",
    description: "Tu tienda de hidroponia y cultivos en Rosario. Nutrientes, sustratos, iluminación y más.",
  };
  
  if (cfg.favicon_url) {
    meta.icons = {
      icon: cfg.favicon_url
    };
  }
  
  return meta;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen flex flex-col`}>
        <CartProvider>
          <NavBar />
          <div className="flex-grow pt-16">
            {children}
          </div>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
