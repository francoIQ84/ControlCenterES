"use client";

import { useState } from "react";

interface ProductImageGalleryProps {
  images: string[];
  title: string;
}

export default function ProductImageGallery({ images, title }: ProductImageGalleryProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  const mainImage = images[selectedIdx] || 'https://via.placeholder.com/800';

  return (
    <div>
      {/* Main product image container */}
      <div className="rounded-2xl overflow-hidden bg-white border border-gray-200 p-4 shadow-sm flex items-center justify-center min-h-[300px] md:min-h-[400px]">
        <img 
          src={mainImage} 
          alt={title} 
          className="w-full h-auto object-contain max-h-[500px] transition-all duration-300"
        />
      </div>
      
      {/* Thumbnail images list */}
      {images.length > 1 && (
        <div className="mt-4 grid grid-cols-4 gap-4">
          {images.map((img: string, idx: number) => (
            <button 
              key={idx} 
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className={`border rounded-lg overflow-hidden bg-white p-2 transition-all duration-200 focus:outline-none ${
                selectedIdx === idx 
                  ? 'border-blue-500 ring-2 ring-blue-500/30 scale-95' 
                  : 'border-gray-200 hover:border-gray-400 hover:scale-98'
              }`}
              style={{ contentVisibility: 'auto' }}
            >
              <img src={img} alt={`${title} thumbnail ${idx + 1}`} className="w-full h-20 object-contain" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
