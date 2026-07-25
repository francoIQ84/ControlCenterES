"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface PopupConfig {
  enabled: boolean;
  show_on: "all" | "blog" | "store";
  title: string;
  description: string;
  button_text: string;
  pdf_url: string;
  delay_seconds: number;
}

export default function LeadMagnetPopup() {
  const pathname = usePathname();
  const [config, setConfig] = useState<PopupConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("Argentina");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");

  useEffect(() => {
    // Check if dismissed previously
    const isDismissed = localStorage.getItem("lead_popup_dismissed_v2");
    if (isDismissed) return;

    fetch("/api/storefront/popup")
      .then((res) => res.json())
      .then((data: PopupConfig) => {
        if (!data || !data.enabled) return;

        // Check path filtering
        const isBlog = pathname?.startsWith("/blog");
        if (data.show_on === "blog" && !isBlog) return;
        if (data.show_on === "store" && isBlog) return;

        const delay = (data.delay_seconds || 5) * 1000;
        const timer = setTimeout(() => {
          setConfig(data);
          setIsOpen(true);
        }, delay);

        return () => clearTimeout(timer);
      })
      .catch((err) => console.error("Lead magnet popup error:", err));
  }, [pathname]);

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem("lead_popup_dismissed_v2", "true");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/storefront/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, country }),
      });

      if (res.ok) {
        setSubmitted(true);
        localStorage.setItem("lead_popup_dismissed_v2", "true");
        if (config?.pdf_url) {
          setDownloadUrl(config.pdf_url);
        }
      } else {
        alert("Ocurrió un error al enviar tus datos. Por favor intentá nuevamente.");
      }
    } catch (err) {
      console.error(err);
      alert("Error de conexión al procesar el formulario.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !config) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 transition-all transform scale-100">
        
        {/* Header gradient banner */}
        <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 p-6 text-white relative">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/20 hover:bg-black/40 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm transition-all"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
          
          <div className="inline-flex items-center justify-center w-12 h-12 bg-white/20 rounded-xl backdrop-blur-md mb-3">
            <span className="text-2xl">🌱</span>
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight leading-tight">
            {config.title || "¿Querés aprender hidroponía?"}
          </h2>
        </div>

        {/* Body content */}
        <div className="p-6">
          {!submitted ? (
            <>
              <p className="text-gray-600 text-sm leading-relaxed mb-6">
                {config.description ||
                  'Descargá gratis la guía "Cómo empezar una huerta hidropónica en casa" (PDF de 15 páginas).'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Tu nombre (opcional):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Juan Pérez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Tu correo electrónico:
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="ejemplo@correo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    País:
                  </label>
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-sm bg-white transition-all"
                  >
                    <option value="Argentina">🇦🇷 Argentina</option>
                    <option value="Uruguay">🇺🇾 Uruguay</option>
                    <option value="Chile">🇨🇱 Chile</option>
                    <option value="Paraguay">🇵🇾 Paraguay</option>
                    <option value="Bolivia">🇧🇴 Bolivia</option>
                    <option value="Perú">🇵🇪 Perú</option>
                    <option value="Colombia">🇨🇴 Colombia</option>
                    <option value="México">🇲🇽 México</option>
                    <option value="España">🇪🇸 España</option>
                    <option value="Otro">🌐 Otro país</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-center flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 mt-2"
                >
                  {loading ? (
                    <span>Procesando...</span>
                  ) : (
                    <>
                      <span>{config.button_text || "Obtener guía gratis"}</span>
                      <span>🚀</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-gray-400 text-center">
                  🔒 Cuidamos tu privacidad. No enviamos spam.
                </p>
              </form>
            </>
          ) : (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-3xl shadow-inner">
                ✓
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                ¡Guía enviada a tu casilla!
              </h3>
              <p className="text-sm text-gray-600 max-w-sm mx-auto leading-relaxed">
                ¡Gracias por sumarte{name ? `, ${name}` : ""}! Te enviamos la guía en formato PDF adjunta a <strong>{email}</strong>.
              </p>
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-xl text-xs max-w-xs mx-auto text-center leading-relaxed">
                📩 Abrí tu casilla de correo para abrir el PDF. Si no lo encontrás en tu bandeja de entrada, revisá tu carpeta de Spam o Promociones.
              </div>

              <div className="pt-2">
                <button
                  onClick={handleClose}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold px-8 py-3 rounded-xl shadow-md hover:shadow-lg transition-all text-sm cursor-pointer"
                >
                  <span>Entendido / Cerrar</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
