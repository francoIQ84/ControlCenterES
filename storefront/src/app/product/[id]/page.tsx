import Image from "next/image";
import Link from "next/link";
import { ChevronLeft } from 'lucide-react';
import AddToCartButton from "../../../components/AddToCartButton";

async function getProduct(id: string) {
  const res = await fetch("http://localhost:8090/api/storefront/products", { next: { revalidate: 60 } });
  if (!res.ok) return null;
  const products = await res.json();
  return products.find((p: any) => p.id === id);
}

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id);

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

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-12 xl:gap-x-16">
        <div className="lg:max-w-lg lg:self-end">
          <div className="rounded-2xl overflow-hidden bg-white border border-gray-200 p-4 shadow-sm flex items-center justify-center">
            <img 
              src={product.images[0] || 'https://via.placeholder.com/800'} 
              alt={product.title} 
              className="w-full h-auto object-contain max-h-[500px]"
            />
          </div>
          {product.images.length > 1 && (
            <div className="mt-4 grid grid-cols-4 gap-4">
              {product.images.map((img: string, idx: number) => (
                <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-white p-2">
                  <img src={img} alt="" className="w-full h-24 object-contain" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 px-4 sm:px-0 lg:mt-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">{product.title}</h1>
          
          <div className="mt-4">
            <h2 className="sr-only">Product information</h2>
            <div className="flex items-end gap-4">
              <p className="text-4xl font-bold text-gray-900">${product.price.toLocaleString()}</p>
              {product.price < product.original_price && (
                <p className="text-xl text-gray-500 line-through mb-1">${product.original_price.toLocaleString()}</p>
              )}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="sr-only">Description</h3>
            <div className="text-base text-gray-700 space-y-6 whitespace-pre-wrap">
              {product.description || "Sin descripción detallada."}
            </div>
          </div>
          
          <div className="mt-6 flex items-center">
            {product.available_quantity > 0 ? (
              <span className="text-sm font-medium text-green-600">Stock Disponible ({product.available_quantity})</span>
            ) : (
              <span className="text-sm font-medium text-red-600">Sin Stock</span>
            )}
          </div>

          <AddToCartButton product={product} />

          <div className="mt-10 border-t border-gray-200 pt-8">
            <h3 className="text-sm font-medium text-gray-900">Seguridad garantizada</h3>
            <p className="mt-4 text-sm text-gray-500">
              Pagás directamente por WhatsApp o transferencia. Tu compra está 100% protegida. Envíos a todo el país.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
