'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

interface ProductDescriptionProps {
  description: string;
}

export default function ProductDescription({ description }: ProductDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!description || description.trim() === '') {
    return null;
  }

  const isLong = description.length > 250 || description.split('\n').length > 5;

  return (
    <div className="mt-12 border-t border-gray-200 pt-8">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-5 h-5 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">Descripción del Producto</h2>
      </div>

      <div className="bg-gray-50/50 rounded-xl p-6 border border-gray-100 relative">
        <div 
          className={`text-gray-700 leading-relaxed whitespace-pre-wrap transition-all duration-300 ${
            !isExpanded && isLong ? 'max-h-48 overflow-hidden relative' : ''
          }`}
        >
          {description}
          
          {!isExpanded && isLong && (
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-gray-50 via-gray-50/80 to-transparent pointer-events-none" />
          )}
        </div>

        {isLong && (
          <div className="mt-4 pt-2 flex justify-center border-t border-gray-100/60">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold text-blue-600 bg-white border border-blue-200 hover:bg-blue-50 hover:border-blue-300 shadow-sm transition-all cursor-pointer"
            >
              {isExpanded ? (
                <>
                  <span>Ver menos</span>
                  <ChevronUp className="w-4 h-4" />
                </>
              ) : (
                <>
                  <span>Ver descripción completa</span>
                  <ChevronDown className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
