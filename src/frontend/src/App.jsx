/**
 * Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
 * See LICENSE file for details
 */
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import JobHistory from './pages/JobHistory'
import Models from './pages/Models'
import Workers from './pages/Workers'
import Settings from './pages/Settings'
import { api, isApiKeyConfigured, fetchServerApiKey, setApiKey } from './api/client'

function App() {
  const [initialized, setInitialized] = useState(false)

  // On app load, try to fetch API key from server
  useEffect(() => {
    const initApiKey = async () => {
      // If we don't have a local key, try to get from server
      if (!isApiKeyConfigured()) {
        const serverKey = await fetchServerApiKey()
        if (serverKey) {
          setApiKey(serverKey) // Save to localStorage for future use
          console.log('Loaded API key from server')
        }
      }
      setInitialized(true)
    }
    initApiKey()
  }, [])

  // Show loading while initializing (prevents flash of "Set API Key" warning)
  if (!initialized) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-900">
        {/* Navigation */}
        <nav className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-8">
                <Link to="/" className="text-xl font-bold text-primary-400">
                  AI Cluster
                </Link>
                <Navigation />
              </div>
              <div className="flex items-center space-x-4">
                <ApiKeyStatus />
                <SystemStatus />
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<JobHistory />} />
            <Route path="/models" element={<Models />} />
            <Route path="/workers" element={<Workers />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

function Navigation() {
  const location = useLocation()

  const links = [
    { to: '/', label: 'Dashboard' },
    { to: '/history', label: 'History' },
    { to: '/models', label: 'Models' },
    { to: '/workers', label: 'Workers' },
    { to: '/settings', label: 'Settings' }
  ]

  return (
    <div className="flex space-x-4">
      {links.map(({ to, label }) => {
        const isActive = location.pathname === to
        return (
          <Link
            key={to}
            to={to}
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive
                ? 'bg-gray-900 text-white'
                : 'text-gray-300 hover:text-white hover:bg-gray-700'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}

function ApiKeyStatus() {
  const hasKey = isApiKeyConfigured()

  if (hasKey) return null

  return (
    <Link
      to="/settings"
      className="flex items-center space-x-1 text-yellow-400 hover:text-yellow-300 text-sm"
    >
      <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
      <span>Set API Key</span>
    </Link>
  )
}

function SystemStatus() {
  const [status, setStatus] = useState('checking')
  const [healthData, setHealthData] = useState(null)

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const checkHealth = async () => {
    try {
      const response = await api.health()
      setHealthData(response.data)
      setStatus(response.data.status === 'healthy' ? 'online' : 'degraded')
    } catch (error) {
      setStatus('offline')
    }
  }

  const statusConfig = {
    checking: { color: 'bg-gray-500', text: 'Checking...' },
    online: { color: 'bg-green-500', text: 'System Online' },
    degraded: { color: 'bg-yellow-500', text: 'Degraded' },
    offline: { color: 'bg-red-500', text: 'Offline' }
  }

  const config = statusConfig[status] || statusConfig.checking

  return (
    <div className="flex items-center space-x-2 text-sm" title={healthData ? `Redis: ${healthData.services?.redis}` : ''}>
      <span className={`w-2 h-2 rounded-full ${config.color}`}></span>
      <span className="text-gray-400">{config.text}</span>
    </div>
  )
}

export default App
