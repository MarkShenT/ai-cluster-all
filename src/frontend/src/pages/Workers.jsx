/**
 * Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
 * See LICENSE file for details
 */
import { useState, useEffect } from 'react'
import { api, isApiKeyConfigured } from '../api/client'

function Workers() {
  const [workers, setWorkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedWorker, setSelectedWorker] = useState(null)

  useEffect(() => {
    fetchWorkers()
    // Poll for updates
    const interval = setInterval(fetchWorkers, 10000)
    return () => clearInterval(interval)
  }, [])

  const fetchWorkers = async () => {
    if (!isApiKeyConfigured()) {
      setError('API key not configured. Go to Settings to set your API key.')
      setLoading(false)
      return
    }

    try {
      const response = await api.listWorkers()
      setWorkers(response.data.workers || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching workers:', err)
      if (err.response?.status === 401) {
        setError('Authentication failed - check API key in Settings')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'busy': return 'bg-yellow-500'
      case 'offline': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getGpuIcon = (gpuType) => {
    switch (gpuType) {
      case 'cuda': return '🎮'
      case 'metal': return '🍎'
      case 'cpu': return '💻'
      default: return '❓'
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return date.toLocaleDateString()
  }

  const onlineCount = workers.filter(w => w.status === 'online' || w.status === 'busy').length
  const busyCount = workers.filter(w => w.status === 'busy').length

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Workers</h1>
        <button
          onClick={fetchWorkers}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Workers" value={workers.length} />
        <StatCard label="Online" value={onlineCount} color="green" />
        <StatCard label="Busy" value={busyCount} color="yellow" />
        <StatCard label="Offline" value={workers.length - onlineCount} color="red" />
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
          {error}
        </div>
      )}

      {/* Workers Grid */}
      {loading ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
          Loading workers...
        </div>
      ) : workers.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400 mb-4">No workers registered</p>
          <p className="text-sm text-gray-500">
            Workers will appear here once they connect to the coordinator.
            <br />
            Set up a worker using the setup scripts.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              onClick={() => setSelectedWorker(worker)}
            />
          ))}
        </div>
      )}

      {/* Setup Instructions */}
      <div className="bg-gray-800 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Setup New Worker</h2>
        <div className="space-y-4 text-sm">
          <div className="bg-gray-900 rounded p-4">
            <h3 className="text-white font-medium mb-2">Windows (GPU)</h3>
            <pre className="text-gray-400 text-xs overflow-x-auto">
{`# Copy worker-config.template to worker-config.env
# Set API_KEY from coordinator .env
.\\setup-worker-windows.ps1 --gpu`}
            </pre>
          </div>
          <div className="bg-gray-900 rounded p-4">
            <h3 className="text-white font-medium mb-2">Windows (CPU only)</h3>
            <pre className="text-gray-400 text-xs overflow-x-auto">
{`.\\setup-worker-windows.ps1 --cpu-only`}
            </pre>
          </div>
          <div className="bg-gray-900 rounded p-4">
            <h3 className="text-white font-medium mb-2">macOS</h3>
            <pre className="text-gray-400 text-xs overflow-x-auto">
{`./setup-worker-macos.sh`}
            </pre>
          </div>
        </div>
      </div>

      {/* Worker Detail Modal */}
      {selectedWorker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-lg w-full">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Worker Details</h2>
              <button
                onClick={() => setSelectedWorker(null)}
                className="text-gray-400 hover:text-white text-xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex items-center space-x-3">
                <span className={`w-3 h-3 rounded-full ${getStatusColor(selectedWorker.status)}`}></span>
                <span className="text-xl font-bold text-white">{selectedWorker.id}</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="Hostname" value={selectedWorker.hostname} />
                <InfoItem label="Status" value={selectedWorker.status} />
                <InfoItem label="OS" value={selectedWorker.os || selectedWorker.capabilities?.os} />
                <InfoItem label="GPU Type" value={selectedWorker.capabilities?.gpu?.type || 'N/A'} />
                <InfoItem label="GPU Model" value={selectedWorker.capabilities?.gpu?.model || 'N/A'} />
                <InfoItem label="RAM" value={`${selectedWorker.capabilities?.ram_gb || '?'} GB`} />
                <InfoItem label="CPU Cores" value={selectedWorker.capabilities?.cpu?.cores || 'N/A'} />
                <InfoItem label="Registered" value={formatTime(selectedWorker.registered_at)} />
                <InfoItem label="Last Heartbeat" value={formatTime(selectedWorker.last_heartbeat)} />
              </div>

              {selectedWorker.capabilities?.supported_models && (
                <div>
                  <label className="text-xs text-gray-400">Supported Models</label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedWorker.capabilities.supported_models.map(model => (
                      <span key={model} className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                        {model}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedWorker.current_job_id && (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded p-3">
                  <label className="text-xs text-yellow-400">Current Job</label>
                  <p className="text-yellow-200 font-mono text-sm">{selectedWorker.current_job_id}</p>
                </div>
              )}

              {selectedWorker.system_load && (
                <div>
                  <label className="text-xs text-gray-400">System Load</label>
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>CPU</span>
                        <span>{selectedWorker.system_load.cpu_percent?.toFixed(1)}%</span>
                      </div>
                      <div className="bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${selectedWorker.system_load.cpu_percent || 0}%` }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>RAM</span>
                        <span>{selectedWorker.system_load.ram_percent?.toFixed(1)}%</span>
                      </div>
                      <div className="bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${selectedWorker.system_load.ram_percent || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setSelectedWorker(null)}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  const colorClasses = {
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    default: 'text-white'
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className={`text-2xl font-bold ${colorClasses[color] || colorClasses.default}`}>{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  )
}

function WorkerCard({ worker, onClick }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'busy': return 'bg-yellow-500'
      case 'offline': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }

  const getGpuIcon = (gpuType) => {
    switch (gpuType) {
      case 'cuda': return '🎮'
      case 'metal': return '🍎'
      case 'cpu': return '💻'
      default: return '❓'
    }
  }

  const gpuType = worker.capabilities?.gpu?.type || 'cpu'

  return (
    <div
      onClick={onClick}
      className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(worker.status)}`}></span>
          <span className="font-medium text-white">{worker.id}</span>
        </div>
        <span className="text-xl" title={gpuType}>{getGpuIcon(gpuType)}</span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Status</span>
          <span className="text-white capitalize">{worker.status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">GPU</span>
          <span className="text-white">{worker.capabilities?.gpu?.model || gpuType.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">RAM</span>
          <span className="text-white">{worker.capabilities?.ram_gb || '?'} GB</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">OS</span>
          <span className="text-white capitalize">{worker.capabilities?.os || 'Unknown'}</span>
        </div>
      </div>

      {worker.current_job_id && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <div className="text-xs text-yellow-400">Processing job...</div>
          <div className="text-xs text-gray-500 font-mono truncate">{worker.current_job_id}</div>
        </div>
      )}
    </div>
  )
}

function InfoItem({ label, value }) {
  return (
    <div>
      <label className="text-xs text-gray-400">{label}</label>
      <p className="text-white text-sm">{value || 'N/A'}</p>
    </div>
  )
}

export default Workers
