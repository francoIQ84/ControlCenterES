import Link from "next/link";
import { ArrowLeft, Calendar, Tag, User, BookOpen } from "lucide-react";

async function getBlogPost(slug: string) {
  try {
    const res = await fetch(`http://localhost:8090/api/storefront/blog/${slug}`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error(e);
  }
  return null;
}

export default async function BlogPostDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded-3xl p-10 border border-gray-200 shadow-sm max-w-md text-center">
          <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Artículo no encontrado</h1>
          <p className="text-gray-500 text-sm mb-6">
            El artículo que buscas no existe o ha sido retirado temporariamente.
          </p>
          <Link href="/blog" className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors text-sm">
            Volver al Blog
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <div className="mb-8">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver a Artículos Informativos
          </Link>
        </div>

        {/* Article Header Container */}
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-gray-200 mb-8">
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-4">
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-600 font-bold rounded-full border border-blue-100">
              <Tag className="w-3 h-3" /> {post.category || "Guía Informativa"}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {post.published_at ? new Date(post.published_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Publicado recientemnte'}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {post.author || "Equipo Hidroponia Rosario"}
            </span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight mb-6">
            {post.title}
          </h1>

          {post.summary && (
            <p className="text-lg text-gray-600 leading-relaxed font-medium border-l-4 border-blue-500 pl-4 py-1 italic bg-blue-50/50 rounded-r-xl">
              {post.summary}
            </p>
          )}
        </div>

        {/* Cover Image if available */}
        {post.cover_image && (
          <div className="rounded-3xl overflow-hidden shadow-md border border-gray-200 mb-10 aspect-video bg-gray-100">
            <img
              src={post.cover_image}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Main Body Content */}
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-gray-200 mb-12">
          <div className="prose prose-blue prose-lg max-w-none text-gray-800 leading-relaxed whitespace-pre-line">
            {post.content}
          </div>
        </div>

        {/* Footer Back Link */}
        <div className="text-center pt-6 border-t border-gray-200">
          <Link href="/blog" className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 font-semibold rounded-2xl shadow-sm hover:border-blue-500 hover:text-blue-600 transition-all text-sm">
            <ArrowLeft className="w-4 h-4" /> Ver más guías y artículos informativos
          </Link>
        </div>
      </div>
    </div>
  );
}
