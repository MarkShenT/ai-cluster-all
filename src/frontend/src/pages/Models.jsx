/**
 * Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
 * See LICENSE file for details
 */
import { useState, useEffect } from 'react'
import { api, isApiKeyConfigured } from '../api/client'

// Model presets - organized by size and provider with download URLs
const MODEL_PRESETS = {
  deepseek: {
    name: 'DeepSeek Coder',
    description: 'Excellent for code generation and understanding',
    models: [
      {
        id: 'deepseek-coder-6.7b',
        name: 'DeepSeek Coder 6.7B',
        size_gb: 4.8,
        capabilities: ['cpu', 'cuda', 'metal'],
        recommended: true,
        url: 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf'
      },
      {
        id: 'deepseek-coder-33b',
        name: 'DeepSeek Coder 33B',
        size_gb: 19.9,
        capabilities: ['cuda', 'cpu'],
        url: 'https://huggingface.co/TheBloke/deepseek-coder-33B-instruct-GGUF/resolve/main/deepseek-coder-33b-instruct.Q4_K_M.gguf'
      },
    ]
  },
  qwen: {
    name: 'Qwen 2.5 Coder',
    description: 'Latest Alibaba coding model with excellent performance',
    models: [
      {
        id: 'qwen2.5-coder-7b',
        name: 'Qwen 2.5 Coder 7B',
        size_gb: 4.7,
        capabilities: ['cpu', 'cuda', 'metal'],
        recommended: true,
        url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf'
      },
      {
        id: 'qwen2.5-coder-14b',
        name: 'Qwen 2.5 Coder 14B',
        size_gb: 9.0,
        capabilities: ['cuda', 'metal', 'cpu'],
        url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/qwen2.5-coder-14b-instruct-q4_k_m.gguf'
      },
      {
        id: 'qwen2.5-coder-32b',
        name: 'Qwen 2.5 Coder 32B',
        size_gb: 19.6,
        capabilities: ['cuda', 'cpu'],
        recommended: true,
        url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct-GGUF/resolve/main/qwen2.5-coder-32b-instruct-q4_k_m.gguf'
      },
    ]
  },
  codellama: {
    name: 'Code Llama',
    description: 'Meta\'s code-focused Llama model',
    models: [
      {
        id: 'codellama-7b',
        name: 'Code Llama 7B',
        size_gb: 4.2,
        capabilities: ['cpu', 'cuda', 'metal'],
        url: 'https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF/resolve/main/codellama-7b-instruct.Q4_K_M.gguf'
      },
      {
        id: 'codellama-13b',
        name: 'Code Llama 13B',
        size_gb: 8.0,
        capabilities: ['cuda', 'metal', 'cpu'],
        url: 'https://huggingface.co/TheBloke/CodeLlama-13B-Instruct-GGUF/resolve/main/codellama-13b-instruct.Q4_K_M.gguf'
      },
      {
        id: 'codellama-34b',
        name: 'Code Llama 34B',
        size_gb: 20.2,
        capabilities: ['cuda', 'cpu'],
        url: 'https://huggingface.co/TheBloke/CodeLlama-34B-Instruct-GGUF/resolve/main/codellama-34b-instruct.Q4_K_M.gguf'
      },
    ]
  },
  llama: {
    name: 'Llama 3.2',
    description: 'Latest Meta Llama models - general purpose with strong coding',
    models: [
      {
        id: 'llama-3.2-3b',
        name: 'Llama 3.2 3B',
        size_gb: 2.0,
        capabilities: ['cpu', 'cuda', 'metal'],
        note: 'Fast, lightweight',
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf'
      },
      {
        id: 'llama-3.2-1b',
        name: 'Llama 3.2 1B',
        size_gb: 0.75,
        capabilities: ['cpu', 'cuda', 'metal'],
        note: 'Ultra lightweight',
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf'
      },
    ]
  },
  mistral: {
    name: 'Mistral / Codestral',
    description: 'Efficient models from Mistral AI',
    models: [
      {
        id: 'mistral-7b',
        name: 'Mistral 7B v0.3',
        size_gb: 4.4,
        capabilities: ['cpu', 'cuda', 'metal'],
        url: 'https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF/resolve/main/mistral-7b-instruct-v0.2.Q4_K_M.gguf'
      },
      {
        id: 'codestral-22b',
        name: 'Codestral 22B',
        size_gb: 13.4,
        capabilities: ['cuda', 'metal', 'cpu'],
        recommended: true,
        url: 'https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf'
      },
    ]
  },
  starcoder: {
    name: 'StarCoder 2',
    description: 'BigCode\'s open code model trained on permissive data',
    models: [
      {
        id: 'starcoder2-3b',
        name: 'StarCoder2 3B',
        size_gb: 1.8,
        capabilities: ['cpu', 'cuda', 'metal'],
        url: 'https://huggingface.co/second-state/StarCoder2-3B-GGUF/resolve/main/starcoder2-3b-Q4_K_M.gguf'
      },
      {
        id: 'starcoder2-7b',
        name: 'StarCoder2 7B',
        size_gb: 4.2,
        capabilities: ['cpu', 'cuda', 'metal'],
        url: 'https://huggingface.co/second-state/StarCoder2-7B-GGUF/resolve/main/starcoder2-7b-Q4_K_M.gguf'
      },
      {
        id: 'starcoder2-15b',
        name: 'StarCoder2 15B',
        size_gb: 9.2,
        capabilities: ['cuda', 'metal', 'cpu'],
        url: 'https://huggingface.co/second-state/StarCoder2-15B-GGUF/resolve/main/starcoder2-15b-Q4_K_M.gguf'
      },
    ]
  }
}

// Quick size filter options
const SIZE_CATEGORIES = [
  { label: 'All Sizes', value: 'all' },
  { label: '7B (4-5GB)', value: '7b', maxSize: 6 },
  { label: '13-15B (8-10GB)', value: '13b', minSize: 6, maxSize: 12 },
  { label: '32-34B (17-20GB)', value: '34b', minSize: 15, maxSize: 25 },
  { label: '70B+ (40GB+)', value: '70b', minSize: 35 },
]

function Models() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState({})
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [customUrl, setCustomUrl] = useState('')
  const [customSource, setCustomSource] = useState('huggingface')
  const [customModelName, setCustomModelName] = useState('')
  const [sizeFilter, setSizeFilter] = useState('all')

  useEffect(() => {
    fetchModels()
    // Poll for download progress
    const interval = setInterval(fetchModels, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchModels = async () => {
    if (!isApiKeyConfigured()) {
      setError('API key not configured. Go to Settings to set your API key.')
      setLoading(false)
      return
    }

    try {
      const response = await api.listModels()
      setModels(response.data.models || [])

      // Update downloading states
      const newDownloading = {}
      ;(response.data.models || []).forEach(model => {
        if (model.status === 'downloading') {
          newDownloading[model.id] = model.download_progress || 0
        }
      })
      setDownloading(newDownloading)
      setError(null)
    } catch (err) {
      console.error('Error fetching models:', err)
      if (err.response?.status === 401) {
        setError('Authentication failed - check API key in Settings')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const downloadModel = async (modelInfo) => {
    try {
      setDownloading(prev => ({ ...prev, [modelInfo.id]: 0 }))
      await api.downloadModel({
        model_id: modelInfo.id,
        name: modelInfo.name,
        provider: modelInfo.provider,
        url: modelInfo.url,
        size_gb: modelInfo.size_gb
      })
      setShowDownloadModal(false)
      fetchModels()
    } catch (err) {
      console.error('Error starting download:', err)
      setError(err.response?.data?.error?.message || err.message)
      setDownloading(prev => {
        const newState = { ...prev }
        delete newState[modelInfo.id]
        return newState
      })
    }
  }

  const deleteModel = async (modelId, modelName) => {
    if (!confirm(`Delete model "${modelName || modelId}"?\n\nThis will permanently remove the model file from storage.`)) return

    try {
      await api.deleteModel(modelId)
      fetchModels()
    } catch (err) {
      console.error('Error deleting model:', err)
      setError(err.response?.data?.error?.message || err.message)
    }
  }

  const cancelDownload = async (modelId) => {
    if (!confirm('Cancel this download?')) return

    try {
      await api.cancelDownload(modelId)
      setDownloading(prev => {
        const newState = { ...prev }
        delete newState[modelId]
        return newState
      })
      fetchModels()
    } catch (err) {
      console.error('Error cancelling download:', err)
      setError(err.response?.data?.error?.message || err.message)
    }
  }

  const formatSize = (sizeGb) => {
    if (sizeGb >= 1) return `${sizeGb.toFixed(1)} GB`
    return `${(sizeGb * 1024).toFixed(0)} MB`
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'available':
        return <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">Available</span>
      case 'downloading':
        return <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">Downloading</span>
      case 'failed':
        return <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">Failed</span>
      default:
        return <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded text-xs">{status}</span>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Model Management</h1>
        <button
          onClick={() => setShowDownloadModal(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm"
        >
          Download Model
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
          {error}
        </div>
      )}

      {/* Models List */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading models...</div>
        ) : models.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400 mb-4">No models downloaded yet</p>
            <button
              onClick={() => setShowDownloadModal(true)}
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm"
            >
              Download Your First Model
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Size</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Capabilities</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Last Used</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {models.map((model) => (
                <tr key={model.id} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{model.name || model.id}</div>
                    <div className="text-xs text-gray-400 font-mono">{model.filename}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300 capitalize">{model.provider}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{formatSize(model.size_gb)}</td>
                  <td className="px-4 py-3">
                    {model.status === 'downloading' ? (
                      <div className="space-y-1">
                        {getStatusBadge(model.status)}
                        <div className="w-24 bg-gray-700 rounded-full h-1.5">
                          <div
                            className="bg-primary-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${(model.download_progress || 0) * 100}%` }}
                          ></div>
                        </div>
                        <div className="text-xs text-gray-400">
                          {((model.download_progress || 0) * 100).toFixed(1)}%
                        </div>
                      </div>
                    ) : (
                      getStatusBadge(model.status)
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {(model.capabilities || []).map(cap => (
                        <span key={cap} className="px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {model.last_used_at ? new Date(model.last_used_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {model.status === 'downloading' && (
                      <button
                        onClick={() => cancelDownload(model.id)}
                        className="text-yellow-400 hover:text-yellow-300 text-sm"
                      >
                        Cancel
                      </button>
                    )}
                    {model.status === 'available' && (
                      <button
                        onClick={() => deleteModel(model.id, model.name)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    )}
                    {model.status === 'failed' && (
                      <button
                        onClick={() => deleteModel(model.id, model.name)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Storage Info */}
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Storage</h3>
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <div className="bg-gray-700 rounded-full h-2">
              <div className="bg-primary-500 h-2 rounded-full" style={{ width: '30%' }}></div>
            </div>
          </div>
          <div className="text-sm text-gray-400">
            {models.reduce((acc, m) => acc + (m.size_gb || 0), 0).toFixed(1)} GB used
          </div>
        </div>
      </div>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Download Model</h2>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Size Filter */}
              <div className="mb-4">
                <label className="block text-xs text-gray-400 mb-2">Filter by Size</label>
                <div className="flex flex-wrap gap-2">
                  {SIZE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setSizeFilter(cat.value)}
                      className={`px-3 py-1 rounded text-sm ${
                        sizeFilter === cat.value
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preset Models */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-300">Available Models</h3>

                {Object.entries(MODEL_PRESETS).map(([key, provider]) => {
                  // Filter models by size
                  const filteredModels = provider.models.filter(model => {
                    if (sizeFilter === 'all') return true
                    const cat = SIZE_CATEGORIES.find(c => c.value === sizeFilter)
                    if (!cat) return true
                    if (cat.minSize && model.size_gb < cat.minSize) return false
                    if (cat.maxSize && model.size_gb > cat.maxSize) return false
                    return true
                  })

                  if (filteredModels.length === 0) return null

                  return (
                    <div key={key} className="bg-gray-900 rounded-lg p-4">
                      <div className="mb-3">
                        <h4 className="text-white font-medium">{provider.name}</h4>
                        {provider.description && (
                          <p className="text-xs text-gray-400">{provider.description}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        {filteredModels.map((model) => {
                          const isDownloaded = models.some(m => m.id === model.id && m.status === 'available')
                          const isDownloading = downloading[model.id] !== undefined

                          return (
                            <div key={model.id} className={`flex items-center justify-between bg-gray-800 rounded p-3 ${model.recommended ? 'ring-1 ring-primary-500' : ''}`}>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-white text-sm">{model.name}</span>
                                  {model.recommended && (
                                    <span className="px-1.5 py-0.5 bg-primary-600 text-white rounded text-xs">Recommended</span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-400">
                                  {formatSize(model.size_gb)} | {model.capabilities.join(', ')}
                                  {model.note && <span className="text-yellow-400 ml-2">({model.note})</span>}
                                </div>
                              </div>
                              {isDownloaded ? (
                                <span className="text-green-400 text-sm">Downloaded</span>
                              ) : isDownloading ? (
                                <span className="text-yellow-400 text-sm">Downloading...</span>
                              ) : (
                                <button
                                  onClick={() => downloadModel({ ...model, provider: key })}
                                  className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-1 rounded text-sm"
                                >
                                  Download
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {/* Custom Model Download */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <h4 className="text-white font-medium mb-3">Custom Model from URL</h4>
                  <div className="space-y-3">
                    {/* Source Selection */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Source</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCustomSource('huggingface')}
                          className={`flex-1 py-2 px-3 rounded text-sm ${
                            customSource === 'huggingface'
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          🤗 HuggingFace
                        </button>
                        <button
                          onClick={() => setCustomSource('ollama')}
                          className={`flex-1 py-2 px-3 rounded text-sm ${
                            customSource === 'ollama'
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          🦙 Ollama Library
                        </button>
                        <button
                          onClick={() => setCustomSource('direct')}
                          className={`flex-1 py-2 px-3 rounded text-sm ${
                            customSource === 'direct'
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          🔗 Direct URL
                        </button>
                      </div>
                    </div>

                    {/* Model Name */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Model Name</label>
                      <input
                        type="text"
                        value={customModelName}
                        onChange={(e) => setCustomModelName(e.target.value)}
                        placeholder="e.g., My Custom 7B Model"
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-400"
                      />
                    </div>

                    {/* URL Input with Source-specific placeholder */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        {customSource === 'huggingface' && 'HuggingFace Model Path or GGUF URL'}
                        {customSource === 'ollama' && 'Ollama Model Name (e.g., llama3.2:7b)'}
                        {customSource === 'direct' && 'Direct Download URL'}
                      </label>
                      <input
                        type="text"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder={
                          customSource === 'huggingface'
                            ? 'TheBloke/Llama-2-7B-GGUF or full URL to .gguf file'
                            : customSource === 'ollama'
                            ? 'codellama:7b or qwen2.5-coder:32b'
                            : 'https://example.com/model.gguf'
                        }
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm placeholder-gray-400"
                      />
                    </div>

                    {/* Source-specific help text */}
                    <div className="text-xs text-gray-500">
                      {customSource === 'huggingface' && (
                        <>
                          Supported formats: GGUF files from HuggingFace.
                          <a href="https://huggingface.co/models?library=gguf&sort=trending" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline ml-1">
                            Browse GGUF models →
                          </a>
                        </>
                      )}
                      {customSource === 'ollama' && (
                        <>
                          Uses Ollama model library format.
                          <a href="https://ollama.com/library" target="_blank" rel="noopener noreferrer" className="text-primary-400 hover:underline ml-1">
                            Browse Ollama library →
                          </a>
                        </>
                      )}
                      {customSource === 'direct' && (
                        'Enter a direct URL to a GGUF model file. Must be publicly accessible.'
                      )}
                    </div>

                    <button
                      onClick={() => {
                        if (customUrl.trim()) {
                          let finalUrl = customUrl.trim()

                          // Process URL based on source
                          if (customSource === 'huggingface' && !finalUrl.startsWith('http')) {
                            // Convert repo path to URL (user needs to specify exact file or we default to first gguf)
                            finalUrl = `https://huggingface.co/${finalUrl}`
                          } else if (customSource === 'ollama') {
                            // Ollama library format
                            finalUrl = `ollama://${finalUrl}`
                          }

                          downloadModel({
                            id: 'custom-' + Date.now(),
                            name: customModelName || `Custom Model (${customSource})`,
                            provider: customSource,
                            url: finalUrl,
                            size_gb: 0
                          })
                          setCustomUrl('')
                          setCustomModelName('')
                        }
                      }}
                      disabled={!customUrl.trim()}
                      className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-800 disabled:text-gray-500 text-white px-3 py-2 rounded text-sm"
                    >
                      Download Custom Model
                    </button>
                  </div>
                </div>
              </div>

              {/* Notes about downloading */}
              <div className="mt-4 space-y-2">
                <div className="bg-yellow-900/20 border border-yellow-700 rounded p-3">
                  <p className="text-sm text-yellow-200">
                    <strong>Note:</strong> Model downloads require internet access. Ensure the coordinator LXC has
                    internet enabled via router ACL before downloading.
                  </p>
                </div>
                <div className="bg-blue-900/20 border border-blue-700 rounded p-3">
                  <p className="text-sm text-blue-200">
                    <strong>Size Guide:</strong> 7B models (~4GB) run on most hardware.
                    34B models (~18GB) need 24GB+ VRAM or lots of RAM.
                    70B models (~40GB) require high-end GPUs or 128GB+ RAM for CPU inference.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setShowDownloadModal(false)}
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

export default Models
