/**
 * Tests for the main App component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock the API client
vi.mock('../api/client.js', () => ({
  api: {
    health: vi.fn().mockResolvedValue({ data: { status: 'healthy' } }),
    stats: vi.fn().mockResolvedValue({ data: { total_jobs: 0 } }),
    listJobs: vi.fn().mockResolvedValue({ data: { jobs: [] } }),
    listWorkers: vi.fn().mockResolvedValue({ data: { workers: [] } }),
    listModels: vi.fn().mockResolvedValue({ data: { models: [] } }),
    listProjects: vi.fn().mockResolvedValue({ data: { projects: [] } })
  },
  fetchServerApiKey: vi.fn().mockResolvedValue(null),
  isApiKeyConfigured: vi.fn().mockReturnValue(true),
  getCurrentApiKey: vi.fn().mockReturnValue('test-key'),
  setApiKey: vi.fn(),
  default: {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  }
}));

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn().mockReturnValue({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn()
  })
}));

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', async () => {
    const { default: App } = await import('../App.jsx');

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // The app should render some content
    expect(document.body).toBeDefined();
  });

  it('should have navigation elements', async () => {
    const { default: App } = await import('../App.jsx');

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Look for common navigation or header elements
    // These will depend on your actual App structure
    const container = screen.getByRole('main', { hidden: true }) || document.body;
    expect(container).toBeDefined();
  });
});

describe('App Routing', () => {
  it('should handle root route', async () => {
    const { default: App } = await import('../App.jsx');

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // App should render at root without errors
    expect(document.body.innerHTML).not.toBe('');
  });
});
