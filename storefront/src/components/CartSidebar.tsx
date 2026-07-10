"use client";

import { X, Trash2, Phone } from 'lucide-react';
import { useCart } from './CartProvider';

export default function CartSidebar({ onClose }: { onClose: () => void }) {
  const { items, removeFromCart, clearCart, total } = useCart();

  const handleCheckout = () => {
    if (items.length === 0) return;
    
    // Configurable number
    const phoneNumber = "5491100000000"; 
    
    let message = "Hola! Quisiera realizar el siguiente pedido desde la web:\n\n";
    items.forEach(item => {
      message += `- ${item.qty}x ${item.title} ($${item.price.toLocaleString()})\n`;
    });
    message += `\n*Total estimado:* $${total.toLocaleString()}`;
    
    const url = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    
    // Optionally clear cart after redirecting to whatsapp
    // clearCart();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose} />
      
      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md">
          <div className="h-full flex flex-col bg-white shadow-xl">
            <div className="flex-1 py-6 overflow-y-auto px-4 sm:px-6">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-medium text-gray-900">Tu Carrito</h2>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-500">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="mt-8">
                {items.length === 0 ? (
                  <p className="text-gray-500 text-center py-10">El carrito está vacío.</p>
                ) : (
                  <div className="flow-root">
                    <ul className="-my-6 divide-y divide-gray-200">
                      {items.map((item) => (
                        <li key={item.id} className="py-6 flex">
                          <div className="flex-shrink-0 w-24 h-24 border border-gray-200 rounded-md overflow-hidden p-2">
                            <img src={item.image} alt={item.title} className="w-full h-full object-contain" />
                          </div>
                          <div className="ml-4 flex-1 flex flex-col">
                            <div>
                              <div className="flex justify-between text-sm font-medium text-gray-900">
                                <h3 className="line-clamp-2">{item.title}</h3>
                                <p className="ml-4">${(item.price * item.qty).toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="flex-1 flex items-end justify-between text-sm">
                              <p className="text-gray-500">Cant: {item.qty}</p>
                              <button type="button" onClick={() => removeFromCart(item.id)} className="font-medium text-red-600 hover:text-red-500 flex items-center">
                                <Trash2 className="w-4 h-4 mr-1" /> Eliminar
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 py-6 px-4 sm:px-6">
              <div className="flex justify-between text-base font-medium text-gray-900 mb-4">
                <p>Subtotal</p>
                <p>${total.toLocaleString()}</p>
              </div>
              <p className="mt-0.5 text-sm text-gray-500 mb-6">El envío y los impuestos se calcularán por WhatsApp.</p>
              
              <button 
                onClick={handleCheckout}
                disabled={items.length === 0}
                className="w-full flex items-center justify-center px-6 py-4 border border-transparent rounded-xl shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Phone className="w-5 h-5 mr-2" />
                Pedir por WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
