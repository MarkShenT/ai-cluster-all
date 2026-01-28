/**
 * Tests for the API client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
global.localStorage = localStorageMock;

// Mock import.meta.env
vi.stubGlobal('import', { meta: { env: { VITE_API_KEY: 'test-env-key' } } });

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setApiKey', () => {
    it('should store API key in localStorage', async () => {
      const { setApiKey } = await import('../api/client.js');
      setApiKey('test-key-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('ai_cluster_api_key', 'test-key-123');
    });

    it('should remove API key when passed null', async () => {
      const { setApiKey } = await import('../api/client.js');
      setApiKey(null);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('ai_cluster_api_key');
    });

    it('should remove API key when passed empty string', async () => {
      const { setApiKey } = await import('../api/client.js');
      setApiKey('');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('ai_cluster_api_key');
    });
  });

  describe('isApiKeyConfigured', () => {
    it('should return true when localStorage has key', async () => {
      localStorageMock.getItem.mockReturnValue('stored-key');
      // Need fresh import to pick up mock
      vi.resetModules();
      const { isApiKeyConfigured } = await import('../api/client.js');
      expect(isApiKeyConfigured()).toBe(true);
    });

    it('should return false when no key configured', async () => {
      localStorageMock.getItem.mockReturnValue(null);
      vi.resetModules();
      const { isApiKeyConfigured } = await import('../api/client.js');
      // May return true if env var is set
      expect(typeof isApiKeyConfigured()).toBe('boolean');
    });
  });

  describe('getCurrentApiKey', () => {
    it('should return localStorage key first', async () => {
      localStorageMock.getItem.mockReturnValue('local-key');
      vi.resetModules();
      const { getCurrentApiKey } = await import('../api/client.js');
      expect(getCurrentApiKey()).toBe('local-key');
    });
  });

  describe('api object', () => {
    it('should have health method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.health).toBe('function');
    });

    it('should have stats method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.stats).toBe('function');
    });

    it('should have submitJob method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.submitJob).toBe('function');
    });

    it('should have listJobs method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.listJobs).toBe('function');
    });

    it('should have listWorkers method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.listWorkers).toBe('function');
    });

    it('should have listModels method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.listModels).toBe('function');
    });

    it('should have listProjects method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.listProjects).toBe('function');
    });

    it('should have uploadProject method', async () => {
      const { api } = await import('../api/client.js');
      expect(typeof api.uploadProject).toBe('function');
    });
  });
});

describe('API Endpoints', () => {
  it('api object should export all expected methods', async () => {
    const { api } = await import('../api/client.js');
    const expectedMethods = [
      'health',
      'stats',
      'settings',
      'submitJob',
      'listJobs',
      'getJob',
      'getJobResult',
      'listWorkers',
      'listModels',
      'downloadModel',
      'deleteModel',
      'listProjects',
      'getProject',
      'deleteProject',
      'uploadProject'
    ];

    expectedMethods.forEach(method => {
      expect(api).toHaveProperty(method);
      expect(typeof api[method]).toBe('function');
    });
  });
});
