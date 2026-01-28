/**
 * Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
 * See LICENSE file for details
 */
import { useState, useEffect } from 'react'
import { api, isApiKeyConfigured } from '../api/client'

function JobHistory() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [filters, setFilters] = useState({
    status: '',
    model: '',
    type: ''
  })
  const [pagination, setPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0
  })

  useEffect(() => {
    fetchJobs()
  }, [filters, pagination.offset])

  const fetchJobs = async () => {
    if (!isApiKeyConfigured()) {
      setError('API key not configured. Go to Settings to set your API key.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const params = {
        limit: pagination.limit,
        offset: pagination.offset
      }
      if (filters.status) params.status = filters.status
      if (filters.model) params.model = filters.model
      if (filters.type) params.type = filters.type

      const response = await api.listJobs(params)
      setJobs(response.data.jobs || [])
      setPagination(prev => ({
        ...prev,
        total: response.data.total || 0
      }))
    } catch (err) {
      console.error('Error fetching jobs:', err)
      if (err.response?.status === 401) {
        setError('Authentication failed - check API key in Settings')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const viewJobDetails = async (job) => {
    try {
      const response = await api.getJob(job.id)
      setSelectedJob(response.data)
    } catch (err) {
      console.error('Error fetching job details:', err)
    }
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'running': return 'bg-yellow-500'
      case 'queued': return 'bg-blue-500'
      case 'failed': return 'bg-red-500'
      case 'cancelled': return 'bg-gray-500'
      default: return 'bg-gray-500'
    }
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'code': return '{ }'
      case 'image': return '🖼'
      case 'video': return '🎬'
      default: return '?'
    }
  }

  const totalPages = Math.ceil(pagination.total / pagination.limit)
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Job History</h1>
        <button
          onClick={fetchJobs}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            >
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="running">Running</option>
              <option value="queued">Queued</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select
              value={filters.type}
              onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
            >
              <option value="">All</option>
              <option value="code">Code</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Model</label>
            <input
              type="text"
              value={filters.model}
              onChange={(e) => setFilters(prev => ({ ...prev, model: e.target.value }))}
              placeholder="Filter by model..."
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
          {error}
        </div>
      )}

      {/* Jobs Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No jobs found</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Model</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Prompt</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Worker</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-700/50">
                  <td className="px-4 py-3 text-sm">
                    <span className="text-lg" title={job.type || 'code'}>
                      {getTypeIcon(job.type || 'code')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)} bg-opacity-20 text-white`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor(job.status)} mr-1.5`}></span>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300 font-mono">{job.model}</td>
                  <td className="px-4 py-3 text-sm text-gray-300 max-w-xs truncate" title={job.prompt}>
                    {job.prompt?.substring(0, 50)}...
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{job.worker_id || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {job.duration_seconds ? `${job.duration_seconds}s` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {formatDate(job.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => viewJobDetails(job)}
                      className="text-primary-400 hover:text-primary-300 text-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-400">
            Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
              disabled={pagination.offset === 0}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-3 py-1 rounded text-sm"
            >
              Previous
            </button>
            <span className="px-3 py-1 text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
              disabled={pagination.offset + pagination.limit >= pagination.total}
              className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 text-white px-3 py-1 rounded text-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Job Details</h2>
              <button
                onClick={() => setSelectedJob(null)}
                className="text-gray-400 hover:text-white text-xl"
              >
                &times;
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-gray-400">Job ID</label>
                  <p className="text-white font-mono text-sm">{selectedJob.id}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Status</label>
                  <p className="text-white">{selectedJob.status}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Model</label>
                  <p className="text-white">{selectedJob.model}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Worker</label>
                  <p className="text-white">{selectedJob.worker_id || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Duration</label>
                  <p className="text-white">{selectedJob.duration_seconds ? `${selectedJob.duration_seconds}s` : 'N/A'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Tokens</label>
                  <p className="text-white">{selectedJob.tokens || 'N/A'}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-xs text-gray-400">Prompt</label>
                <div className="bg-gray-900 rounded p-3 mt-1">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap">{selectedJob.prompt}</pre>
                </div>
              </div>

              {selectedJob.result && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-gray-400">Result</label>
                    <div className="flex space-x-2">
                      {!isImageResult(selectedJob) && !isVideoResult(selectedJob) && (
                        <button
                          onClick={() => copyToClipboard(selectedJob.result)}
                          className="text-xs text-primary-400 hover:text-primary-300"
                        >
                          Copy
                        </button>
                      )}
                      <button
                        onClick={() => downloadJobResult(selectedJob)}
                        className="text-xs text-primary-400 hover:text-primary-300"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                  <div className="bg-gray-900 rounded p-3">
                    <JobResultDisplay job={selectedJob} />
                  </div>
                </div>
              )}

              {selectedJob.error && (
                <div className="mt-4 bg-red-900/50 border border-red-700 rounded p-3">
                  <label className="text-xs text-red-400">Error</label>
                  <p className="text-red-200 text-sm mt-1">{selectedJob.error}</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={() => setSelectedJob(null)}
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

// Helper functions for result type detection and display
function isImageResult(job) {
  return job.type === 'image' ||
         job.result_type === 'image' ||
         (typeof job.result === 'string' && (
           job.result.startsWith('data:image') ||
           job.result.match(/\.(png|jpg|jpeg|gif|webp)$/i)
         ))
}

function isVideoResult(job) {
  return job.type === 'video' ||
         job.result_type === 'video' ||
         (typeof job.result === 'string' &&
           job.result.match(/\.(mp4|webm|mov)$/i))
}

function JobResultDisplay({ job }) {
  if (!job.result) {
    return <span className="text-gray-400 italic">No result data</span>
  }

  if (isImageResult(job)) {
    const imageSrc = job.result.startsWith('data:') || job.result.startsWith('http')
      ? job.result
      : `data:image/png;base64,${job.result}`

    return (
      <div className="flex justify-center">
        <img
          src={imageSrc}
          alt="Generated image"
          className="max-w-full h-auto rounded-lg border border-gray-600"
          style={{ maxHeight: '400px', objectFit: 'contain' }}
        />
      </div>
    )
  }

  if (isVideoResult(job)) {
    const videoSrc = job.result.startsWith('data:') || job.result.startsWith('http')
      ? job.result
      : `data:video/mp4;base64,${job.result}`

    return (
      <div className="flex justify-center">
        <video
          src={videoSrc}
          controls
          className="max-w-full h-auto rounded-lg border border-gray-600"
          style={{ maxHeight: '400px' }}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    )
  }

  // Default: text/code result
  return (
    <pre className="text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
      {job.result}
    </pre>
  )
}

function downloadJobResult(job) {
  if (!job.result) return

  let content = job.result
  let filename = `result-${job.id || Date.now()}`
  let mimeType = 'text/plain'

  if (isImageResult(job)) {
    if (content.startsWith('data:image')) {
      const [header, base64] = content.split(',')
      const mime = header.match(/data:([^;]+)/)?.[1] || 'image/png'
      const ext = mime.split('/')[1] || 'png'
      filename = `${filename}.${ext}`

      const byteCharacters = atob(base64)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: mime })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }
    filename = `${filename}.png`
    mimeType = 'image/png'
  } else if (isVideoResult(job)) {
    filename = `${filename}.mp4`
    mimeType = 'video/mp4'
  } else {
    filename = `${filename}.txt`
    if (content.includes('def ') || content.includes('import ')) {
      filename = `${filename.replace('.txt', '')}.py`
    } else if (content.includes('function ') || content.includes('const ')) {
      filename = `${filename.replace('.txt', '')}.js`
    }
  }

  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default JobHistory
