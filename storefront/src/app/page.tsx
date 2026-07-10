import Image from "next/image";
import Link from "next/link";

async function getProducts() {
  const res = await fetch("http://localhost:8088/api/storefront/products", { next: { revalidate: 60 } });
  if (!res.ok) return [];
  return res.json();
}

export default async function Home() {
  const products = await getProducts();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl">
          Nuestra Tienda Oficial
        </h1>
        <p className="mt-4 max-w-2xl text-xl text-gray-500 mx-auto">
          Los mejores productos directo de fábrica, al mejor precio.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="text-center text-gray-500 py-20">
          No hay productos disponibles por el momento.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {products.map((p: any) => (
            <Link key={p.id} href={`/product/${p.id}`} className="group relative block bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-lg hover:border-blue-500 transition-all duration-300">
              <div className="relative h-60 w-full overflow-hidden rounded-xl bg-gray-50 mb-4 flex items-center justify-center p-2">
                <img 
                  src={p.images[0] || 'https://via.placeholder.com/400'} 
                  alt={p.title}
                  className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 min-h-[40px] mb-2 group-hover:text-blue-600 transition-colors">
                {p.title}
              </h3>
              <div className="flex items-center justify-between">
                <div>
                  {p.price < p.original_price && (
                    <span className="text-xs text-gray-500 line-through mr-2">${p.original_price.toLocaleString()}</span>
                  )}
                  <span className="text-xl font-bold text-gray-900">${p.price.toLocaleString()}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
