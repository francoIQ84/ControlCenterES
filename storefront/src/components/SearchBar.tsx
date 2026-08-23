"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  placeholder?: string;
  className?: string;
}

function SearchInputContent({ placeholder = "Buscar productos...", className = "" }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const initialQuery = searchParams.get("q") || "";
  const [term, setTerm] = useState(initialQuery);

  useEffect(() => {
    setTerm(searchParams.get("q") || "");
  }, [searchParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    
    if (term.trim()) {
      params.set("q", term.trim());
    } else {
      params.delete("q");
    }
    
    router.push(`/?${params.toString()}`);
  };

  const handleClear = () => {
    setTerm("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    router.push(`/?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSearch} className={`relative flex items-center w-full ${className}`}>
      <div className="relative w-full flex items-center">
        <input
          type="text"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-11 pr-10 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all shadow-sm"
        />
        <Search className="w-5 h-5 text-gray-400 absolute left-3.5 pointer-events-none" />
        {term && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 p-1 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
            title="Limpiar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </form>
  );
}

export default function SearchBar(props: SearchBarProps) {
  return (
    <Suspense fallback={
      <div className={`relative flex items-center w-full ${props.className || ""}`}>
        <div className="relative w-full flex items-center">
          <input
            type="text"
            placeholder={props.placeholder || "Buscar productos..."}
            disabled
            className="w-full pl-11 pr-10 py-2.5 bg-white border border-gray-200 rounded-full text-sm text-gray-400 shadow-sm opacity-80"
          />
          <Search className="w-5 h-5 text-gray-400 absolute left-3.5 pointer-events-none" />
        </div>
      </div>
    }>
      <SearchInputContent {...props} />
    </Suspense>
  );
}
