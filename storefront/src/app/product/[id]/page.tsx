import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from 'lucide-react';
import { headers } from "next/headers";
import AddToCartButton from "@/components/AddToCartButton";
import ProductImageGallery from "@/components/ProductImageGallery";
import ProductDescription from "@/components/ProductDescription";

async function getProduct(id: string) {
  const res = await fetch("http://localhost:8090/api/storefront/products", { cache: 'no-store' });
  if (!res.ok) return null;
  const products = await res.json();
  return products.find((p: any) => p.id === id);
}

async function recordVisit(id: string, domain: string, ip: string) {
  try {
    await fetch(`http://localhost:8090/api/storefront/products/${id}/visit?domain=${encodeURIComponent(domain)}&ip=${encodeURIComponent(ip)}`, { 
      method: 'POST',
      cache: 'no-store'
    });
  } catch (e) {
    console.error("Error recording visit:", e);
  }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(id);

  if (product) {
    const headersList = await headers();
    const host = headersList.get('host') || 'hidroponiarosario.com';
    const clientIp = headersList.get('x-forwarded-for')?.split(',')[0].trim() || headersList.get('x-real-ip') || '127.0.0.1';
    recordVisit(id, host, clientIp);
  }

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Producto no encontrado</h1>
        <Link href="/" className="text-blue-600 hover:underline">Volver a la tienda</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 mb-8 transition-colors">
        <ChevronLeft className="w-5 h-5 mr-1" />
        Volver al catálogo
      </Link>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16 items-start">
        <div className="lg:max-w-lg">
          <ProductImageGallery images={product.images} title={product.title} />
        </div>

        <div className="mt-10 px-4 sm:px-0 lg:mt-0 flex flex-col justify-between">
          <div>
            {product.category_name && (
              <span className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-full mb-3">
                {product.category_name}
              </span>
            )}
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{product.title}</h1>
            
            <div className="mt-4">
              <h2 className="sr-only">Información de precio</h2>
              <div className="flex items-end gap-4">
                <p className="text-4xl font-bold text-gray-900">${product.price.toLocaleString()}</p>
                {product.price < product.original_price && (
                  <p className="text-xl text-gray-500 line-through mb-1">${product.original_price.toLocaleString()}</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center">
              {product.available_quantity > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 px-3 py-1 rounded-md border border-green-200">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  Stock Disponible ({product.available_quantity} u.)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 bg-red-50 px-3 py-1 rounded-md border border-red-200">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Sin Stock
                </span>
              )}
            </div>

            <div className="mt-6">
              <AddToCartButton product={product} />
            </div>

            {product.status === 'active' && product.permalink && (
              <div className="mt-4">
                <a 
                  href={product.permalink} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="w-full flex items-center justify-center px-6 py-3 border rounded-md shadow-sm text-sm font-semibold text-gray-800 bg-amber-50 border-amber-300 hover:bg-amber-100 transition-colors"
                >
                  Ver publicación en Mercado Libre ↗
                </a>
              </div>
            )}
          </div>

          <div className="mt-8 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              🛡️ Seguridad garantizada
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Pagás directamente por WhatsApp o transferencia. Tu compra está 100% protegida. Envíos a todo el país.
            </p>
          </div>
        </div>
      </div>

      {/* Descripción completa abajo del hero con expandible Ver Más */}
      <ProductDescription description={product.description} />
    </div>
  );
}
