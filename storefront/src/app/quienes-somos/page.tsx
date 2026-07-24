import Link from "next/link";
import { ArrowLeft, Award, HeartHandshake, Leaf, MapPin } from "lucide-react";

async function getAboutData() {
  try {
    const res = await fetch("http://localhost:8090/api/storefront/about", { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error(e);
  }
  return {
    enabled: true,
    title: "Sobre Nosotros",
    content: "Somos una empresa especializada en insumos para cultivos tradicionales e hidropónicos en Rosario.",
    images: ""
  };
}

export default async function QuienesSomosPage() {
  const data = await getAboutData();
  const imagesList = data.images ? data.images.split(',').map((img: string) => img.trim()).filter(Boolean) : [];

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <div className="mb-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-blue-600 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver a Productos
          </Link>
        </div>

        {/* Hero Banner */}
        <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-8 sm:p-12 text-white shadow-xl mb-12 relative overflow-hidden">
          <div className="relative z-10 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold tracking-wide uppercase mb-4">
              <Leaf className="w-3.5 h-3.5" /> Hidroponia & Cultivo
            </span>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
              {data.title || "Sobre Nosotros"}
            </h1>
            <p className="text-blue-100 text-base sm:text-lg leading-relaxed">
              Pasión por la naturaleza, tecnología agrícola y el asesoramiento especializado en Rosario.
            </p>
          </div>
          <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-12 translate-y-12">
            <Leaf className="w-96 h-96" />
          </div>
        </div>

        {/* Main Content */}
        <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-gray-200 mb-12">
          <div className="prose prose-blue max-w-none text-gray-700 leading-relaxed whitespace-pre-line text-base sm:text-lg">
            {data.content}
          </div>
        </div>

        {/* Features / Values Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Calidad Garantizada</h3>
              <p className="text-xs text-gray-500">Insumos y nutrientes testeados por cultivadores experimentados.</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Atención Personalizada</h3>
              <p className="text-xs text-gray-500">Te asesoramos paso a paso para optimizar el rinde de tus cultivos.</p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex items-start gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 mb-1">Local & Envíos</h3>
              <p className="text-xs text-gray-500">Despachos rápidos a todo el país y retiro por nuestro local.</p>
            </div>
          </div>
        </div>

        {/* Image Gallery if available */}
        {imagesList.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Nuestras Instalaciones & Equipo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {imagesList.map((imgUrl: string, idx: number) => (
                <div key={idx} className="relative group overflow-hidden rounded-2xl shadow-sm border border-gray-200 aspect-video">
                  <img
                    src={imgUrl}
                    alt={`Instalación ${idx + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
