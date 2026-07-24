import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import Sales from './pages/Sales'
import Customers from './pages/Customers'
import Settings from './pages/Settings'
import Expenses from './pages/Expenses'
import MediaManager from './pages/MediaManager'
import Login from './pages/Login'
import Billing from './pages/Billing'
import BlogCMS from './pages/BlogCMS'

// Global fetch interceptor to append authorization token
const originalFetch = window.fetch
window.fetch = async (...args) => {
  let [resource, config] = args
  
  // Only intercept relative /api routes (avoiding external URLs and login endpoint)
  if (typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth/login')) {
    config = config || {}
    config.headers = config.headers || {}
    
    const token = localStorage.getItem('adminToken')
    if (token) {
      if (config.headers instanceof Headers) {
        config.headers.set('Authorization', `Bearer ${token}`)
      } else if (Array.isArray(config.headers)) {
        config.headers.push(['Authorization', `Bearer ${token}`])
      } else {
        config.headers['Authorization'] = `Bearer ${token}`
      }
    }
  }
  
  try {
    const response = await originalFetch(resource, config)
    
    // Auto logout on 401 Unauthorized
    if (response.status === 401 && typeof resource === 'string' && resource.startsWith('/api/') && !resource.startsWith('/api/auth/login')) {
      localStorage.removeItem('adminToken')
      window.location.href = '/login'
    }
    
    return response
  } catch(e) {
    throw e
  }
}

function ProtectedRoute() {
  const token = localStorage.getItem('adminToken')
  
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    // Si la URL tiene un código de Mercado Libre y estamos logueados, lo procesamos
    if (code && token) {
      // Limpiamos la URL para no re-procesar
      window.history.replaceState({}, document.title, window.location.pathname);
      
      fetch('/api/settings/exchange-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code })
      }).then(res => {
        if(res.ok) {
          alert("¡Cuenta de Mercado Libre vinculada con éxito!")
          window.location.href = '/settings'
        } else {
          res.json().then(data => {
             alert("Error vinculando Mercado Libre: " + (data.detail || "Error desconocido"))
          })
        }
      }).catch(err => {
        alert("Error de conexión al vincular: " + err.message)
      })
    }
  }, [token]);

  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function PermissionRoute({ permission, children }) {
  const permsStr = localStorage.getItem('adminPermissions');
  if (permsStr === null) {
    return children; // default allowed during loading
  }
  
  const perms = permsStr.split(',').map(p => p.trim());
  if (!perms.includes(permission)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Admin Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<PermissionRoute permission="dashboard"><Dashboard /></PermissionRoute>} />
            <Route path="inventory" element={<PermissionRoute permission="inventory"><Inventory /></PermissionRoute>} />
            <Route path="sales" element={<PermissionRoute permission="sales"><Sales /></PermissionRoute>} />
            <Route path="billing" element={<PermissionRoute permission="billing"><Billing /></PermissionRoute>} />
            <Route path="customers" element={<PermissionRoute permission="customers"><Customers /></PermissionRoute>} />
            <Route path="settings" element={<PermissionRoute permission="settings"><Settings /></PermissionRoute>} />
            <Route path="cms" element={<PermissionRoute permission="settings"><BlogCMS /></PermissionRoute>} />
            <Route path="media" element={<PermissionRoute permission="media"><MediaManager /></PermissionRoute>} />
            <Route path="expenses" element={<PermissionRoute permission="expenses"><Expenses /></PermissionRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
