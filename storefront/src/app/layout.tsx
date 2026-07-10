import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "../components/CartProvider";
import NavBar from "../components/NavBar";
import Footer from "../components/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tienda Oficial",
  description: "E-Commerce de ControlCenterES",
};

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
