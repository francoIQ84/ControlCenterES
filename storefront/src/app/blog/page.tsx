import Link from "next/link";
import { ArrowLeft, BookOpen, Calendar, ChevronRight, Tag, User } from "lucide-react";

async function getBlogPosts() {
  try {
    const res = await fetch("http://localhost:8090/api/storefront/blog", { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error(e);
  }
  return [];
}

export default async function BlogCatalogPage() {
  const posts = await getBlogPosts();

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver a Productos
          </Link>
        </div>

        {/* Hero Header */}
        <div className="bg-gradient-to-r from-slate-900 to-blue-900 rounded-3xl p-8 sm:p-12 text-white shadow-xl mb-12 relative overflow-hidden">
          <div className="relative z-10 max-w-3xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/20 backdrop-blur-md rounded-full text-xs font-semibold tracking-wide uppercase text-blue-300 mb-4 border border-blue-400/30">
              <BookOpen className="w-3.5 h-3.5" /> Blog Informativo & Guías
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
              Aprende, Cultiva & Optimiza
            </h1>
            <p className="text-gray-300 text-base sm:text-lg leading-relaxed">
              Guías explicativas paso a paso, uso correcto de productos y conceptos clave para tus proyectos de hidroponia y cultivo.
            </p>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-12 translate-y-12">
            <BookOpen className="w-96 h-96" />
          </div>
        </div>

        {/* Blog Posts Grid */}
        {posts.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 shadow-sm max-w-2xl mx-auto my-12">
            <BookOpen className="w-16 h-16 text-blue-500 mx-auto mb-4 opacity-50" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">No hay artículos publicados todavía</h2>
            <p className="text-gray-500 text-sm mb-6">
              Pronto estaremos subiendo nuevas guías de uso y artículos explicativos. ¡Vuelve pronto!
            </p>
            <Link href="/" className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm">
              Explorar Catálogo de Productos
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post: any) => (
              <article key={post.id} className="bg-white rounded-3xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-xl hover:border-blue-500 transition-all duration-300 flex flex-col group">
                {/* Cover Image */}
                <div className="relative aspect-video bg-gray-100 overflow-hidden">
                  <img
                    src={post.cover_image || "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&q=80"}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600/90 text-white text-xs font-bold rounded-full backdrop-blur-sm shadow-md">
                      <Tag className="w-3 h-3" /> {post.category || "Guía"}
                    </span>
                  </div>
                </div>

                {/* Content Container */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Meta info */}
                    <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {post.published_at ? new Date(post.published_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Reciente'}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {post.author || "Equipo"}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-3">
                      {post.title}
                    </h2>

                    {/* Summary */}
                    <p className="text-gray-600 text-sm line-clamp-3 leading-relaxed mb-6">
                      {post.summary || "Haz clic para leer el artículo explicativo completo..."}
                    </p>
                  </div>

                  {/* Read More Link */}
                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-sm font-semibold text-blue-600 group-hover:translate-x-1 transition-transform">
                    <span>Leer Artículo Completo</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>

                {/* Click Overlay */}
                <Link href={`/blog/${post.slug}`} className="absolute inset-0 z-10" aria-label={post.title} />
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
