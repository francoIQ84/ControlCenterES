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
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Admin Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="sales" element={<Sales />} />
            <Route path="billing" element={<Billing />} />
            <Route path="customers" element={<Customers />} />
            <Route path="settings" element={<Settings />} />
            <Route path="media" element={<MediaManager />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
