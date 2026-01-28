/**
 * Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
 * See LICENSE file for details
 *
 * API Client with authentication support
 *
 * The API key is loaded from (in priority order):
 * 1. localStorage 'ai_cluster_api_key' (runtime, set via Settings page)
 * 2. Server-side stored key (fetched once on load, shared across all browsers)
 * 3. VITE_API_KEY environment variable (build time)
 */

import axios from 'axios'

const API_URL = '/api/v1'

// Cache for server-side API key
let serverApiKey = null
let serverKeyFetched = false

// Get API key from localStorage, server, or env
const getApiKey = () => {
  // First check localStorage (user can override)
  const storedKey = localStorage.getItem('ai_cluster_api_key')
  if (storedKey) return storedKey

  // Check cached server key
  if (serverApiKey) return serverApiKey

  // Fall back to build-time env var
  return import.meta.env.VITE_API_KEY || ''
}

// Fetch server-side stored API key (called once on app load)
export const fetchServerApiKey = async () => {
  if (serverKeyFetched) return serverApiKey

  try {
    // This endpoint returns the configured client API key without authentication
    const response = await axios.get(`${API_URL}/system/client-config`)
    if (response.data?.api_key) {
      serverApiKey = response.data.api_key
      serverKeyFetched = true
      return serverApiKey
    }
  } catch (err) {
    // Server doesn't have client config or endpoint not available
    console.log('No server-side API key configured')
  }
  serverKeyFetched = true
  return null
}

// Store API key on server (for sharing across all browsers)
export const saveApiKeyToServer = async (key) => {
  try {
    const response = await axios.post(`${API_URL}/system/client-config`, {
      api_key: key
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': key // Use the key itself to authenticate the save
      }
    })
    if (response.data?.success) {
      serverApiKey = key
      return true
    }
  } catch (err) {
    console.error('Failed to save API key to server:', err)
  }
  return false
}

// Create axios instance with interceptors
const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Request interceptor to add API key
apiClient.interceptors.request.use(
  (config) => {
    const apiKey = getApiKey()
    if (apiKey) {
      config.headers['X-API-Key'] = apiKey
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // Handle specific error codes
      if (error.response.status === 401) {
        console.error('API Authentication failed - check API key')
        // Could trigger a login modal or redirect here
      } else if (error.response.status === 403) {
        console.error('Access denied - IP not in allowed subnet')
      }
    }
    return Promise.reject(error)
  }
)

// API methods
export const api = {
  // System
  health: () => apiClient.get('/system/health'),
  stats: () => apiClient.get('/system/stats'),
  settings: () => apiClient.get('/system/settings'),

  // Jobs
  submitJob: (data) => apiClient.post('/jobs', data),
  listJobs: (params) => apiClient.get('/jobs', { params }),
  getJob: (jobId) => apiClient.get(`/jobs/${jobId}`),
  getJobResult: (jobId) => apiClient.get(`/jobs/${jobId}/result`),

  // Workers
  listWorkers: () => apiClient.get('/workers'),

  // Models
  listModels: () => apiClient.get('/models'),
  downloadModel: (data) => apiClient.post('/models/download', data),
  deleteModel: (modelId) => apiClient.delete(`/models/${modelId}`),
  getModelStatus: (modelId) => apiClient.get(`/models/${modelId}/status`),
  cancelDownload: (modelId) => apiClient.post(`/models/${modelId}/cancel`),

  // Projects
  listProjects: () => apiClient.get('/projects'),
  getProject: (projectId) => apiClient.get(`/projects/${projectId}`),
  deleteProject: (projectId) => apiClient.delete(`/projects/${projectId}`),
  getProjectFile: (projectId, filePath) => apiClient.get(`/projects/${projectId}/files/${filePath}`),
  uploadProject: (file, name, description, onProgress) => {
    const formData = new FormData()
    formData.append('file', file)
    if (name) formData.append('name', name)
    if (description) formData.append('description', description)

    return apiClient.post('/projects/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: onProgress ? (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percentCompleted)
      } : undefined
    })
  }
}

// Utility to set API key at runtime
export const setApiKey = (key) => {
  if (key) {
    localStorage.setItem('ai_cluster_api_key', key)
  } else {
    localStorage.removeItem('ai_cluster_api_key')
  }
}

// Utility to get current API key
export const getCurrentApiKey = () => getApiKey()

// Check if API key is configured
export const isApiKeyConfigured = () => !!getApiKey()

export default apiClient
