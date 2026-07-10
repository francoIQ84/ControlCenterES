import Image from "next/image";
import Link from "next/link";

async function getProducts() {
  const res = await fetch("http://localhost:8090/api/storefront/products", { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function getWebConfig() {
  const res = await fetch("http://localhost:8090/api/storefront/config", { cache: 'no-store' });
  if (!res.ok) {
    return {
      store_name: "Tienda Oficial",
      logo_url: "",
      hero_title: "Nuestra Tienda Oficial",
      hero_subtitle: "Los mejores productos directo de fábrica, al mejor precio.",
      hero_image: ""
    };
  }
  return res.json();
}

export default async function Home() {
  const products = await getProducts();
  const cfg = await getWebConfig();

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Premium Custom Hero Section Banner */}
      <div className="relative rounded-3xl overflow-hidden mb-12 bg-gradient-to-r from-blue-900 to-indigo-950 text-white shadow-md">
        {cfg.hero_image && (
          <div className="absolute inset-0 z-0">
            <img src={cfg.hero_image} alt="" className="w-full h-full object-cover opacity-35" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/35" />
          </div>
        )}
        <div className="relative z-10 px-8 py-16 sm:px-12 sm:py-20 max-w-3xl">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-white mb-4 drop-shadow-md">
            {cfg.hero_title}
          </h1>
          <p className="text-lg sm:text-xl text-gray-200 drop-shadow max-w-2xl">
            {cfg.hero_subtitle}
          </p>
        </div>
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
