"use client";

import { useEffect, useState } from "react";
import { Phone, MapPin } from "lucide-react";

export default function Footer() {
  const [cfg, setCfg] = useState({
    store_name: "Tienda Oficial",
    logo_url: "",
    contact_phone: "",
    address: "",
    footer_text: "© 2026 ControlCenterES. Todos los derechos reservados."
  });

  useEffect(() => {
    fetch("/api/storefront/config")
      .then(res => res.json())
      .then(data => {
        setCfg(prev => ({ ...prev, ...data }));
      })
      .catch(err => console.error(err));
  }, []);

  // WhatsApp link preparation
  const cleanPhone = cfg.contact_phone ? cfg.contact_phone.replace(/\D/g, "") : "";
  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;

  return (
    <footer className="bg-white border-t border-gray-200 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo / Title */}
          <div>
            {cfg.logo_url ? (
              <img src={cfg.logo_url} alt={cfg.store_name} className="h-8 max-w-[180px] object-contain mb-4" />
            ) : (
              <span className="text-xl font-bold text-gray-900 tracking-tight block mb-4">{cfg.store_name}</span>
            )}
            <p className="text-sm text-gray-500 leading-relaxed">
              Tu tienda oficial conectada y sincronizada directamente con el inventario de Mercado Libre.
            </p>
          </div>
          
          {/* Contact info */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 tracking-wider uppercase mb-4">Contacto</h4>
            <ul className="space-y-3">
              {cfg.contact_phone && (
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="w-4 h-4 text-blue-600" />
                  {waUrl ? (
                    <a href={waUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline transition-colors">
                      {cfg.contact_phone} (WhatsApp)
                    </a>
                  ) : (
                    <span>{cfg.contact_phone}</span>
                  )}
                </li>
              )}
              {cfg.address && (
                <li className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 text-blue-600 mt-0.5" />
                  <span>{cfg.address}</span>
                </li>
              )}
            </ul>
          </div>
          
          {/* Navigation/Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 tracking-wider uppercase mb-4">Garantía</h4>
            <p className="text-sm text-gray-500 leading-relaxed">
              Todos nuestros productos cuentan con stock disponible y procesamiento seguro para coordinar entregas rápidas.
            </p>
          </div>
        </div>
        
        <div className="border-t border-gray-100 mt-12 pt-8 flex justify-between items-center flex-wrap gap-4">
          <p className="text-sm text-gray-400">
            {cfg.footer_text}
          </p>
          <p className="text-sm text-gray-400">
            Powered by ControlCenterES
          </p>
        </div>
      </div>
    </footer>
  );
}
