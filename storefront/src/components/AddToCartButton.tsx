"use client";

import { useCart } from './CartProvider';
import { useState } from 'react';
import { ShoppingCart, Check } from 'lucide-react';

export default function AddToCartButton({ product }: { product: any }) {
  const { addToCart } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addToCart({
      id: product.id,
      title: product.title,
      price: product.price,
      qty: qty,
      image: product.images[0] || 'https://via.placeholder.com/400'
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
      <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden w-32 h-14">
        <button 
          onClick={() => setQty(Math.max(1, qty - 1))}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 h-full flex-1 text-xl"
        >-</button>
        <span className="px-4 py-2 text-center flex-1 font-semibold">{qty}</span>
        <button 
          onClick={() => setQty(qty + 1)}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 h-full flex-1 text-xl"
        >+</button>
      </div>
      <button 
        onClick={handleAdd}
        className={`flex-1 flex items-center justify-center px-8 py-4 border border-transparent rounded-xl shadow-sm text-base font-medium text-white transition-all ${added ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
      >
        {added ? <Check className="w-5 h-5 mr-2" /> : <ShoppingCart className="w-5 h-5 mr-2" />}
        {added ? 'Agregado al Carrito' : 'Agregar al Carrito'}
      </button>
    </div>
  );
}
