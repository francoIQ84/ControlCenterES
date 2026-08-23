import Image from "next/image";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";

async function getProducts(categorySlug?: string, searchQuery?: string) {
  const params = new URLSearchParams();
  if (categorySlug) params.append("category", categorySlug);
  if (searchQuery) params.append("q", searchQuery);
  
  const queryStr = params.toString();
  const url = `http://localhost:8090/api/storefront/products${queryStr ? `?${queryStr}` : ""}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  return res.json();
}

async function getCategories() {
  const res = await fetch("http://localhost:8090/api/storefront/categories", { cache: 'no-store' });
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

export default async function Home(props: {
  searchParams: Promise<{ category?: string; q?: string }>
}) {
  const searchParams = await props.searchParams;
  const activeCategory = searchParams.category || "";
  const searchQuery = searchParams.q || "";
  
  const products = await getProducts(activeCategory, searchQuery);
  const categories = await getCategories();
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
          <p className="text-lg sm:text-xl text-gray-200 drop-shadow max-w-2xl mb-8">
            {cfg.hero_subtitle}
          </p>

          {/* Featured Hero Search Bar */}
          <div className="max-w-xl">
            <SearchBar placeholder="¿Qué estás buscando? (ej. manguera, fertilizante...)" />
          </div>
        </div>
      </div>

      {/* Category Navigation Bar */}
      <div className="flex flex-wrap gap-2 mb-8 items-center">
        <Link
          href={searchQuery ? `/?q=${encodeURIComponent(searchQuery)}` : "/"}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border whitespace-nowrap ${
            !activeCategory
              ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
              : "bg-white text-gray-700 border-gray-200 hover:border-emerald-500 hover:text-emerald-600"
          }`}
        >
          Todos
        </Link>
        {categories.map((cat: any) => {
          const categoryUrl = searchQuery 
            ? `/?category=${cat.slug}&q=${encodeURIComponent(searchQuery)}`
            : `/?category=${cat.slug}`;
          return (
            <Link
              key={cat.id}
              href={categoryUrl}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 border whitespace-nowrap ${
                activeCategory === cat.slug
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                  : "bg-white text-gray-700 border-gray-200 hover:border-emerald-500 hover:text-emerald-600"
              }`}
            >
              {cat.name}
            </Link>
          );
        })}
      </div>

      {/* Active Search Query Feedback Badge */}
      {searchQuery && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 text-emerald-950 px-5 py-3.5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>Mostrando resultados para:</span>
            <span className="font-bold bg-white text-emerald-800 px-3 py-1 rounded-xl border border-emerald-200 shadow-xs">
              &ldquo;{searchQuery}&rdquo;
            </span>
          </div>
          <Link
            href={activeCategory ? `/?category=${activeCategory}` : "/"}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1"
          >
            ✕ Limpiar filtro de búsqueda
          </Link>
        </div>
      )}

      {products.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200 px-6">
          <div className="text-5xl mb-4">🔎</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">No encontramos productos</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
            {searchQuery 
              ? `No se encontraron coincidencias para "${searchQuery}"${activeCategory ? " en esta categoría" : ""}.`
              : "No hay productos disponibles por el momento."}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-6 py-2.5 rounded-full text-sm transition-all shadow-sm"
          >
            Ver todos los productos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {products.map((p: any) => (
            <Link key={p.id} href={`/product/${p.id}`} className="group relative block bg-white border border-gray-200 rounded-2xl p-4 shadow-sm hover:shadow-lg hover:border-blue-500 transition-all duration-300">
              {p.featured_order > 0 && !activeCategory && !searchQuery && (
                <span className="absolute top-6 left-6 z-10 bg-amber-500/90 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm flex items-center gap-1">
                  ⭐ Destacado
                </span>
              )}
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
