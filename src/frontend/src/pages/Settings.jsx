/**
 * Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
 * See LICENSE file for details
 */
import { useState, useEffect } from 'react'
import { api, setApiKey, getCurrentApiKey, isApiKeyConfigured, saveApiKeyToServer, fetchServerApiKey } from '../api/client'

function Settings() {
  const [apiKey, setApiKeyState] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testStatus, setTestStatus] = useState(null) // null, 'testing', 'success', 'error'
  const [testMessage, setTestMessage] = useState('')
  const [healthData, setHealthData] = useState(null)
  const [saved, setSaved] = useState(false)
  const [saveToServer, setSaveToServer] = useState(true) // Default to saving on server for cross-machine access
  const [serverSaveStatus, setServerSaveStatus] = useState(null) // null, 'saving', 'success', 'error'

  // Load current API key on mount
  useEffect(() => {
    const loadKey = async () => {
      // First try to get server-side key
      const serverKey = await fetchServerApiKey()
      if (serverKey) {
        setApiKeyState(serverKey)
        return
      }
      // Fall back to localStorage
      const currentKey = getCurrentApiKey()
      if (currentKey) {
        setApiKeyState(currentKey)
      }
    }
    loadKey()
    // Fetch health data
    fetchHealth()
  }, [])

  const fetchHealth = async () => {
    try {
      const response = await api.health()
      setHealthData(response.data)
    } catch (error) {
      console.error('Error fetching health:', error)
    }
  }

  const handleSaveApiKey = async () => {
    const key = apiKey.trim()

    // Always save to localStorage as fallback
    setApiKey(key)
    setSaved(true)

    // Optionally save to server for cross-machine access
    if (saveToServer) {
      setServerSaveStatus('saving')
      const success = await saveApiKeyToServer(key)
      if (success) {
        setServerSaveStatus('success')
      } else {
        setServerSaveStatus('error')
      }
      setTimeout(() => setServerSaveStatus(null), 5000)
    }

    setTimeout(() => setSaved(false), 3000)
  }

  const handleClearApiKey = () => {
    setApiKeyState('')
    setApiKey('')
    setTestStatus(null)
    setTestMessage('')
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleTestConnection = async () => {
    setTestStatus('testing')
    setTestMessage('')

    // Temporarily save the API key for testing
    const previousKey = getCurrentApiKey()
    setApiKey(apiKey.trim())

    try {
      // Try to access an authenticated endpoint
      const response = await api.stats()
      setTestStatus('success')
      setTestMessage('Connection successful! API key is valid.')
      // Update health data after successful test
      fetchHealth()
    } catch (error) {
      // Restore previous key on failure
      if (previousKey) {
        setApiKey(previousKey)
      }

      if (error.response?.status === 401) {
        setTestStatus('error')
        setTestMessage('Authentication failed - API key is invalid or missing.')
      } else if (error.response?.status === 403) {
        setTestStatus('error')
        setTestMessage('Access denied - your IP is not in the allowed subnet.')
      } else if (error.response?.status === 500) {
        setTestStatus('error')
        setTestMessage('Server error - API key may not be configured on the coordinator.')
      } else {
        setTestStatus('error')
        setTestMessage(`Connection failed: ${error.message}`)
      }
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* API Key Configuration */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">API Authentication</h2>

        <div className="space-y-4">
          {/* Current Status */}
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${isApiKeyConfigured() ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
            <span className="text-sm text-gray-300">
              {isApiKeyConfigured() ? 'API key configured' : 'API key not configured'}
            </span>
          </div>

          {/* API Key Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                placeholder="Enter your API key from coordinator .env file"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 pr-24 text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm px-2 py-1"
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Get this from the coordinator: <code className="bg-gray-700 px-1 rounded">grep API_KEY /opt/ai-cluster/.env</code>
            </p>
          </div>

          {/* Save to Server Option */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="saveToServer"
              checked={saveToServer}
              onChange={(e) => setSaveToServer(e.target.checked)}
              className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
            />
            <label htmlFor="saveToServer" className="text-sm text-gray-300">
              Save to server (share across all browsers/machines)
            </label>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleSaveApiKey}
              disabled={!apiKey.trim()}
              className="bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {serverSaveStatus === 'saving' ? 'Saving...' : 'Save Key'}
            </button>
            <button
              onClick={handleTestConnection}
              disabled={!apiKey.trim() || testStatus === 'testing'}
              className="bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            {isApiKeyConfigured() && (
              <button
                onClick={handleClearApiKey}
                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                Clear Key
              </button>
            )}
          </div>

          {/* Saved Message */}
          {saved && (
            <div className="text-green-400 text-sm">
              Settings saved locally!
              {serverSaveStatus === 'success' && ' Also saved to server - will work on all browsers.'}
              {serverSaveStatus === 'error' && (
                <span className="text-yellow-400"> (Server save failed - saved locally only. You may need to set the key again on other machines.)</span>
              )}
            </div>
          )}

          {/* Test Result */}
          {testStatus && testStatus !== 'testing' && (
            <div className={`rounded-lg p-3 ${
              testStatus === 'success'
                ? 'bg-green-900/50 border border-green-700 text-green-200'
                : 'bg-red-900/50 border border-red-700 text-red-200'
            }`}>
              {testMessage}
            </div>
          )}
        </div>
      </div>

      {/* System Information */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">System Information</h2>

        {healthData ? (
          <div className="space-y-3">
            <InfoRow label="Status" value={healthData.status} success={healthData.status === 'healthy'} />
            <InfoRow label="API Version" value={healthData.version} />
            <InfoRow label="Redis" value={healthData.services?.redis} success={healthData.services?.redis === 'connected'} />
            <InfoRow label="Database" value={healthData.services?.database} success={healthData.services?.database === 'connected'} />
            <InfoRow
              label="Authentication"
              value={healthData.security?.auth_status}
              success={healthData.security?.auth_status === 'enabled'}
            />
            <InfoRow label="Allowed Subnet" value={healthData.security?.allowed_subnet} />
          </div>
        ) : (
          <p className="text-gray-500">Loading system information...</p>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Setup Instructions</h2>

        <div className="space-y-4 text-sm text-gray-300">
          <div>
            <h3 className="font-medium text-white mb-2">1. Get your API key</h3>
            <p className="text-gray-400 mb-2">SSH to the Proxmox host and get the API key from the coordinator:</p>
            <pre className="bg-gray-900 rounded p-3 text-xs overflow-x-auto">
{`ssh root@10.10.10.5
pct enter 120
grep API_KEY /opt/ai-cluster/.env`}
            </pre>
          </div>

          <div>
            <h3 className="font-medium text-white mb-2">2. Enter the key above</h3>
            <p className="text-gray-400">
              Copy the API key value (the part after <code className="bg-gray-700 px-1 rounded">API_KEY=</code>)
              and paste it in the field above.
            </p>
          </div>

          <div>
            <h3 className="font-medium text-white mb-2">3. Test the connection</h3>
            <p className="text-gray-400">
              Click "Test Connection" to verify the API key works. If successful, you're ready to submit jobs!
            </p>
          </div>
        </div>
      </div>

      {/* Security Note */}
      <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
        <h3 className="font-medium text-yellow-300 mb-2">Security Note</h3>
        <p className="text-sm text-yellow-200/80">
          <strong>Server storage:</strong> When "Save to server" is enabled, your API key is stored on the coordinator
          and shared across all browsers. This is convenient for a home lab environment.
          <br /><br />
          <strong>Local storage:</strong> The key is also stored in your browser's localStorage as a fallback.
          <br /><br />
          The API is protected by subnet restrictions (only 10.10.10.x IPs can access).
        </p>
      </div>
    </div>
  )
}

function InfoRow({ label, value, success }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono text-sm ${
        success === true ? 'text-green-400' :
        success === false ? 'text-red-400' :
        'text-gray-300'
      }`}>
        {value || 'N/A'}
      </span>
    </div>
  )
}

export default Settings
