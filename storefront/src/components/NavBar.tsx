"use client";

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCart } from './CartProvider';
import { useState, useEffect } from 'react';
import CartSidebar from './CartSidebar';

export default function NavBar() {
  const { items } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [storeName, setStoreName] = useState("Tienda Oficial");
  const [logoUrl, setLogoUrl] = useState("");
  const [aboutUsEnabled, setAboutUsEnabled] = useState(true);
  const [blogEnabled, setBlogEnabled] = useState(true);

  const itemCount = items.reduce((acc, item) => acc + item.qty, 0);

  useEffect(() => {
    fetch("/api/storefront/config")
      .then(res => {
        if (!res.ok) throw new Error("Network response error");
        return res.json();
      })
      .then(data => {
        if (data.store_name) setStoreName(data.store_name);
        if (data.logo_url) setLogoUrl(data.logo_url);
        if (data.about_us_enabled !== undefined) setAboutUsEnabled(data.about_us_enabled);
        if (data.blog_enabled !== undefined) setBlogEnabled(data.blog_enabled);
      })
      .catch(err => console.error(err));
  }, []);

  return (
    <>
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-200 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="flex-shrink-0 flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt={storeName} className="h-8 max-w-[180px] object-contain" />
              ) : (
                <span className="text-xl font-bold text-gray-900 tracking-tight">{storeName}</span>
              )}
            </Link>

            {/* Navigation links */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600">
              <Link href="/" className="hover:text-blue-600 transition-colors">
                Productos
              </Link>
              {aboutUsEnabled && (
                <Link href="/quienes-somos" className="hover:text-blue-600 transition-colors">
                  Quiénes Somos
                </Link>
              )}
              {blogEnabled && (
                <Link href="/blog" className="hover:text-blue-600 transition-colors">
                  Blog Informativo
                </Link>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Mobile links */}
              <div className="flex md:hidden items-center gap-3 text-xs font-medium text-gray-600">
                {aboutUsEnabled && (
                  <Link href="/quienes-somos" className="hover:text-blue-600">
                    Nosotros
                  </Link>
                )}
                {blogEnabled && (
                  <Link href="/blog" className="hover:text-blue-600">
                    Blog
                  </Link>
                )}
              </div>

              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 text-gray-600 hover:text-blue-600 transition-colors"
              >
                <ShoppingCart className="w-6 h-6" />
                {itemCount > 0 && (
                  <span className="absolute top-0 right-0 -mt-1 -mr-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-600 rounded-full">
                    {itemCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      {isCartOpen && <CartSidebar onClose={() => setIsCartOpen(false)} />}
    </>
  );
}
