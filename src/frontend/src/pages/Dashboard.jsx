/**
 * Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
 * See LICENSE file for details
 */
import { useState, useEffect, useRef } from 'react'
import { api, isApiKeyConfigured } from '../api/client'

function Dashboard() {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState('')
  const [jobType, setJobType] = useState('code')
  const [loading, setLoading] = useState(false)
  const [currentJob, setCurrentJob] = useState(null)
  const [result, setResult] = useState(null)
  const [workers, setWorkers] = useState([])
  const [stats, setStats] = useState(null)
  const [availableModels, setAvailableModels] = useState([])

  // Project state
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef(null)

  // Fetch workers, stats, models and projects on mount
  useEffect(() => {
    fetchWorkers()
    fetchStats()
    fetchModels()
    fetchProjects()
    const interval = setInterval(() => {
      fetchWorkers()
      fetchStats()
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  const fetchProjects = async () => {
    try {
      const response = await api.listProjects()
      setProjects(response.data.projects || [])
    } catch (error) {
      console.error('Error fetching projects:', error)
    }
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.zip')) {
      setResult({ error: 'Please upload a ZIP file' })
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      const response = await api.uploadProject(
        file,
        file.name.replace('.zip', ''),
        '',
        (progress) => setUploadProgress(progress)
      )
      setProjects([...projects, response.data])
      setSelectedProject(response.data.project_id)
      setUploadProgress(100)
    } catch (error) {
      console.error('Error uploading project:', error)
      setResult({ error: error.response?.data?.error?.message || 'Failed to upload project' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteProject = async (projectId) => {
    try {
      await api.deleteProject(projectId)
      setProjects(projects.filter(p => p.id !== projectId))
      if (selectedProject === projectId) {
        setSelectedProject('')
      }
    } catch (error) {
      console.error('Error deleting project:', error)
    }
  }

  const fetchModels = async () => {
    try {
      const response = await api.listModels()
      const models = (response.data.models || []).filter(m => m.status === 'available')
      setAvailableModels(models)
      // Set default model to first available if not already set
      if (!model && models.length > 0) {
        setModel(models[0].id)
      }
    } catch (error) {
      console.error('Error fetching models:', error)
    }
  }

  // Poll for job status
  useEffect(() => {
    if (!currentJob) return

    const interval = setInterval(async () => {
      try {
        const response = await api.getJob(currentJob.job_id)
        if (response.data.status === 'completed') {
          const resultResponse = await api.getJobResult(currentJob.job_id)
          setResult(resultResponse.data)
          setCurrentJob(null)
          setLoading(false)
        } else if (response.data.status === 'failed') {
          setResult({ error: 'Job failed' })
          setCurrentJob(null)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error polling job:', error)
        if (error.response?.status === 401) {
          setResult({ error: 'Authentication failed - check API key in Settings' })
          setCurrentJob(null)
          setLoading(false)
        }
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [currentJob])

  const fetchWorkers = async () => {
    try {
      const response = await api.listWorkers()
      setWorkers(response.data.workers || [])
    } catch (error) {
      console.error('Error fetching workers:', error)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await api.stats()
      setStats(response.data)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const submitJob = async (e) => {
    e.preventDefault()
    if (!prompt.trim()) return

    // Check if API key is configured
    if (!isApiKeyConfigured()) {
      setResult({ error: 'API key not configured. Go to Settings to set your API key.' })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const jobData = {
        prompt: prompt.trim(),
        model,
        type: jobType
      }
      if (selectedProject) {
        jobData.project_id = selectedProject
      }
      const response = await api.submitJob(jobData)
      setCurrentJob(response.data)
    } catch (error) {
      console.error('Error submitting job:', error)
      if (error.response?.status === 401) {
        setResult({ error: 'Authentication failed - check API key in Settings' })
      } else if (error.response?.status === 403) {
        setResult({ error: 'Access denied - your IP is not in the allowed subnet' })
      } else {
        setResult({ error: error.response?.data?.error?.message || error.message })
      }
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Jobs Today" value={stats?.jobs_completed || 0} />
        <StatCard label="Queue" value={stats?.jobs_queued || 0} />
        <StatCard label="Running" value={stats?.jobs_running || 0} />
        <StatCard label="Workers" value={stats?.workers_online || 0} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Job Submission Form */}
        <div className="col-span-2 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Submit Job</h2>

          <form onSubmit={submitJob} className="space-y-4">
            {/* Job Type */}
            <div className="flex space-x-4">
              <JobTypeButton
                type="code"
                current={jobType}
                onClick={() => setJobType('code')}
                icon="code"
                label="Code"
              />
              <JobTypeButton
                type="image"
                current={jobType}
                onClick={() => setJobType('image')}
                icon="image"
                label="Image"
              />
              <JobTypeButton
                type="video"
                current={jobType}
                onClick={() => setJobType('video')}
                icon="video"
                label="Video"
              />
            </div>

            {/* Model Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Model
              </label>
              {availableModels.length === 0 ? (
                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-3 text-yellow-200 text-sm">
                  No models downloaded. Go to <a href="/models" className="underline hover:text-yellow-100">Models</a> to download one.
                </div>
              ) : (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id} ({m.size_gb?.toFixed(1) || '?'} GB)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Project Context (for code jobs) */}
            {jobType === 'code' && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Project Context (Optional)
                </label>
                <div className="flex space-x-2">
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">No project context</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.file_count} files)
                      </option>
                    ))}
                  </select>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".zip"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    {uploading ? `${uploadProgress}%` : 'Upload ZIP'}
                  </button>
                  {selectedProject && (
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(selectedProject)}
                      className="bg-red-700 hover:bg-red-600 text-white px-3 py-2 rounded-lg transition-colors"
                      title="Delete project"
                    >
                      ✕
                    </button>
                  )}
                </div>
                {uploading && (
                  <div className="mt-2 bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                placeholder={
                  jobType === 'code'
                    ? "Describe the code you want to generate..."
                    : jobType === 'image'
                      ? "Describe the image you want to create..."
                      : "Describe the video you want to generate..."
                }
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !prompt.trim() || availableModels.length === 0}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <LoadingSpinner />
                  <span className="ml-2">
                    {currentJob ? 'Processing...' : 'Submitting...'}
                  </span>
                </span>
              ) : (
                'Generate'
              )}
            </button>
          </form>

          {/* Result */}
          {result && (
            <div className="mt-6">
              <h3 className="text-lg font-medium text-white mb-2">Result</h3>
              {result.error ? (
                <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
                  {result.error}
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                  <ResultDisplay result={result} jobType={result.metadata?.job_type || jobType} />
                  {result.metadata && (
                    <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500 flex justify-between items-center">
                      <span>
                        Model: {result.metadata.model} |
                        {result.metadata.tokens && ` Tokens: ${result.metadata.tokens} |`}
                        Duration: {result.metadata.duration_seconds}s
                      </span>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => copyToClipboard(result.result)}
                          className="text-gray-400 hover:text-white transition-colors"
                          title="Copy to clipboard"
                        >
                          Copy
                        </button>
                        {result.result && (
                          <button
                            onClick={() => downloadResult(result, result.metadata?.job_type || jobType)}
                            className="text-gray-400 hover:text-white transition-colors"
                            title="Download"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Workers Sidebar */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Workers</h2>
          <div className="space-y-3">
            {workers.length === 0 ? (
              <p className="text-gray-500 text-sm">No workers online</p>
            ) : (
              workers.map((worker) => (
                <WorkerCard key={worker.id} worker={worker} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-gray-400">{label}</div>
    </div>
  )
}

function JobTypeButton({ type, current, onClick, label }) {
  const isActive = type === current

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
        isActive
          ? 'bg-primary-600 text-white'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {label}
    </button>
  )
}

function WorkerCard({ worker }) {
  const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-red-500',
    busy: 'bg-yellow-500'
  }

  return (
    <div className="bg-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full ${statusColors[worker.status]}`}></span>
          <span className="text-sm font-medium text-white">{worker.id}</span>
        </div>
        <span className="text-xs text-gray-400 capitalize">{worker.status}</span>
      </div>
      <div className="mt-2 text-xs text-gray-400">
        {worker.capabilities?.gpu?.type || 'CPU'} |
        {worker.capabilities?.ram_gb || '?'}GB RAM
      </div>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function ResultDisplay({ result, jobType }) {
  // Check if result is an image (base64 or URL)
  const isImage = jobType === 'image' ||
                  result.result_type === 'image' ||
                  (typeof result.result === 'string' && (
                    result.result.startsWith('data:image') ||
                    result.result.match(/\.(png|jpg|jpeg|gif|webp)$/i)
                  ))

  // Check if result is a video
  const isVideo = jobType === 'video' ||
                  result.result_type === 'video' ||
                  (typeof result.result === 'string' &&
                    result.result.match(/\.(mp4|webm|mov)$/i))

  if (!result.result) {
    return (
      <div className="text-gray-400 italic">No result data</div>
    )
  }

  if (isImage) {
    // Handle image result
    const imageSrc = result.result.startsWith('data:') || result.result.startsWith('http')
      ? result.result
      : `data:image/png;base64,${result.result}`

    return (
      <div className="space-y-3">
        <img
          src={imageSrc}
          alt="Generated image"
          className="max-w-full h-auto rounded-lg border border-gray-600"
          style={{ maxHeight: '500px', objectFit: 'contain' }}
        />
      </div>
    )
  }

  if (isVideo) {
    // Handle video result
    const videoSrc = result.result.startsWith('data:') || result.result.startsWith('http')
      ? result.result
      : `data:video/mp4;base64,${result.result}`

    return (
      <div className="space-y-3">
        <video
          src={videoSrc}
          controls
          className="max-w-full h-auto rounded-lg border border-gray-600"
          style={{ maxHeight: '500px' }}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    )
  }

  // Default: code/text result
  return (
    <pre className="text-sm text-gray-300 whitespace-pre-wrap overflow-x-auto font-mono">
      {result.result}
    </pre>
  )
}

function copyToClipboard(text) {
  if (!text) return

  // For images/binary data, this won't work well, but for code it's fine
  if (typeof text === 'string' && !text.startsWith('data:')) {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
      console.log('Copied to clipboard')
    }).catch(err => {
      console.error('Failed to copy:', err)
    })
  }
}

function downloadResult(result, jobType) {
  if (!result.result) return

  let content = result.result
  let filename = `result-${Date.now()}`

  // Helper function to download base64 data
  const downloadBase64 = (dataUrl, defaultMime, defaultExt) => {
    if (dataUrl.startsWith('data:')) {
      const [header, base64] = dataUrl.split(',')
      const mime = header.match(/data:([^;]+)/)?.[1] || defaultMime
      const ext = mime.split('/')[1] || defaultExt
      filename = `${filename}.${ext}`

      // Convert base64 to blob
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
      return true
    }
    return false
  }

  if (jobType === 'image' || result.result_type === 'image') {
    // Handle base64 image
    if (downloadBase64(content, 'image/png', 'png')) return

    // Raw base64 without data: prefix
    if (!content.startsWith('http')) {
      const blob = new Blob([Uint8Array.from(atob(content), c => c.charCodeAt(0))], { type: 'image/png' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }
  } else if (jobType === 'video' || result.result_type === 'video') {
    // Handle base64 video
    if (downloadBase64(content, 'video/mp4', 'mp4')) return

    // Raw base64 without data: prefix
    if (!content.startsWith('http')) {
      const blob = new Blob([Uint8Array.from(atob(content), c => c.charCodeAt(0))], { type: 'video/mp4' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      return
    }
  }

  // Code/text - detect language for extension
  let ext = 'txt'
  if (content.includes('def ') || content.includes('import ')) {
    ext = 'py'
  } else if (content.includes('function ') || content.includes('const ')) {
    ext = 'js'
  }

  // Download as text/code
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}.${ext}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default Dashboard
