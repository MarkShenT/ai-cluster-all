# AI Cluster

[![CI](https://github.com/USERNAME/ai-cluster-all/actions/workflows/ci.yml/badge.svg)](https://github.com/USERNAME/ai-cluster-all/actions/workflows/ci.yml)
[![CodeQL](https://github.com/USERNAME/ai-cluster-all/actions/workflows/codeql.yml/badge.svg)](https://github.com/USERNAME/ai-cluster-all/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)

A distributed AI inference system for local code generation and image generation using heterogeneous hardware. Built for Proxmox clusters with support for Windows (CUDA), macOS (Metal), and Linux workers.

## Features

- **Multi-modal AI inference** - Code generation, image generation, and video generation
- **Project context upload** - Upload ZIP files of your codebase for context-aware generation
- **Heterogeneous hardware support** - NVIDIA CUDA, Apple Metal, CPU-only workers
- **Web dashboard** - React-based UI for job submission, monitoring, and model management
- **Distributed workers** - Dynamic worker pool with automatic capability detection
- **Model management** - Download, cache, and serve GGUF models to workers
- **Secure by design** - API key authentication, subnet restrictions, isolated coordinator

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Browser                              │
│              http://10.10.10.75                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│         Coordinator LXC (10.10.10.75)                     │
│  ┌─────────┐  ┌──────────────┐  ┌──────────────────┐       │
│  │  Nginx  │→ │  Flask API   │→ │      Redis       │       │
│  │  :80    │  │   :5000      │  │   (Job Queue)    │       │
│  └─────────┘  └──────────────┘  └──────────────────┘       │
│              Docker Volumes: models, results, projects      │
└─────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  GPU Worker  │    │  Mac Worker  │    │  CPU Worker  │
│  CUDA GPU    │    │  Apple Metal │    │  High RAM    │
│  Code+Image  │    │  Code Gen    │    │  CPU-only    │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Quick Start

### Prerequisites

- Proxmox VE with LXC container (CTID 120, IP 10.10.10.75)
- Docker and Docker Compose installed in the LXC
- Python 3.11+ on worker machines

### 1. Deploy Coordinator

```bash
# From your Mac/Linux machine
scp -r /path/to/ai-cluster root@10.10.10.5:/tmp/

# SSH to Proxmox host
ssh root@10.10.10.5
cd /tmp/ai-cluster
cp .env.example .env

# Edit .env with your API keys (or let setup.sh generate them)
nano .env

# Deploy to LXC
./scripts/deploy-to-lxc.sh --run-setup
```

### 2. Access the Dashboard

Open http://10.10.10.75 in your browser. You'll be prompted for your API key on first access.

### 3. Setup Workers

**Windows (with GPU):**
```powershell
# Copy setup script and config template to Windows machine
.\setup-worker-windows.ps1 --gpu
# Enter coordinator IP (10.10.10.75) and API key when prompted
```

**macOS:**
```bash
# Copy setup script and config template to Mac
./setup-worker-macos.sh
# Enter coordinator IP (10.10.10.75) and API key when prompted
# Service auto-starts on boot
```

### 4. Download a Model

Go to the **Models** page in the dashboard and download your first model (recommended: Qwen 2.5 Coder 7B or DeepSeek Coder 6.7B).

## Project Structure

```
ai-cluster/
├── docker-compose.yml      # Coordinator stack
├── .env.example            # Configuration template
├── setup.sh                # Master setup script
├── configs/
│   ├── nginx.conf          # Reverse proxy config
│   ├── models.json         # Model presets
│   └── worker-config.template
├── scripts/
│   ├── deploy-to-lxc.sh    # Deploy to Proxmox LXC
│   ├── setup-coordinator.sh
│   ├── setup-monitor-lxc.sh
│   ├── setup-worker-macos.sh
│   └── setup-worker-windows.ps1
└── src/
    ├── coordinator/        # Flask API + job queue
    ├── frontend/           # React dashboard
    ├── monitor/            # Pi 5 monitoring dashboard
    └── worker/             # Universal worker script
```

## Configuration

### Environment Variables

Key settings in `.env`:

| Variable | Description | Default |
|----------|-------------|---------|
| `COORDINATOR_IP` | LXC container IP | `10.10.10.75` |
| `API_KEY` | API authentication key | (required) |
| `ALLOWED_SUBNET` | Allowed client subnet | `10.10.10.0/24` |
| `REDIS_PASSWORD` | Redis authentication | (required) |

### Worker Configuration

Workers use `worker-config.env`:

```bash
COORDINATOR_IP=10.10.10.75
COORDINATOR_PORT=80
API_KEY=your-api-key-from-coordinator
```

## Security Model

1. **API Key Authentication** - All API requests require `X-API-Key` header
2. **Subnet Restriction** - Only allowed subnet (10.10.10.x) can access
3. **Redis Password** - Internal Redis communication is authenticated
4. **Network Isolation** - Coordinator has no internet by default

## Documentation

- **[QUICK-START.md](QUICK-START.md)** - Detailed setup guide with troubleshooting

## Development

### Running Tests

**Backend (Python):**
```bash
# Install test dependencies
pip install pytest pytest-cov httpx

# Run coordinator tests
pytest tests/coordinator/ -v

# Run worker tests
pytest tests/worker/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html
```

**Frontend (JavaScript):**
```bash
cd src/frontend

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### CI/CD

This project uses GitHub Actions for continuous integration:

- **CI Workflow** (`ci.yml`) - Runs on all pushes and PRs to main:
  - Python tests for coordinator and worker
  - Frontend build and lint
  - Docker image build verification
  - Security scanning with Bandit

- **Docker Publish** (`docker-publish.yml`) - Builds and publishes Docker images on release tags

- **CodeQL Analysis** (`codeql.yml`) - Weekly security vulnerability scanning

- **Dependabot** - Automated dependency updates for Python, npm, Docker, and GitHub Actions

### Code Quality

```bash
# Python linting
pip install flake8 black isort
black --check src/ tests/
isort --check-only src/ tests/
flake8 src/ tests/ --max-line-length=120

# Frontend linting
cd src/frontend && npm run lint
```

## Monitor Dashboard

Deploy a lightweight monitoring dashboard on Pi 5:

```bash
# On Proxmox Node 3 (Pi 5)
./scripts/setup-monitor-lxc.sh --coordinator 10.10.10.75
```

Access at http://10.10.10.101:8080 (or assigned LXC IP)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/system/health` | GET | Health check (no auth) |
| `/api/v1/jobs` | POST | Submit job (supports type: code, image, video) |
| `/api/v1/jobs/{id}` | GET | Get job status |
| `/api/v1/jobs/next` | GET | Worker polls for job |
| `/api/v1/workers` | GET | List workers |
| `/api/v1/workers/register` | POST | Register worker |
| `/api/v1/models` | GET | List models |
| `/api/v1/models/download` | POST | Download model |
| `/api/v1/projects` | GET | List uploaded projects |
| `/api/v1/projects/upload` | POST | Upload project ZIP |
| `/api/v1/projects/{id}` | GET | Get project details |
| `/api/v1/projects/{id}` | DELETE | Delete project |

## Worker Management

**Start/Stop workers:**

```bash
# macOS
launchctl load ~/Library/LaunchAgents/com.user.aiworker.plist
launchctl unload ~/Library/LaunchAgents/com.user.aiworker.plist

# Windows - just run/close the PowerShell script
.\setup-worker-windows.ps1 --gpu
# Ctrl+C to stop
```

**Uninstall workers:**

```bash
# macOS
./setup-worker-macos.sh --uninstall

# Windows
.\setup-worker-windows.ps1 --uninstall
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Check API_KEY in worker-config.env matches coordinator |
| 403 Forbidden | Verify your IP is in ALLOWED_SUBNET |
| Worker can't connect | Use LXC IP (10.10.10.75), not Proxmox host IP |
| No models available | Enable router ACL, download models via UI |

## Hardware Requirements

### Coordinator (LXC)
- RAM: 4GB minimum
- Storage: 300GB+ for models

### Workers (Examples)
- **GPU Worker**: NVIDIA GPU with 8GB+ VRAM (e.g., RTX 3060 or better), 32GB+ RAM
- **Mac Worker**: Apple Silicon (M1/M2/M3/M4) with 16GB+ unified memory
- **CPU Worker**: 64GB+ RAM for 70B models (inference will be slower)

## Roadmap / Future Enhancements

The following features are planned for future implementation:

- **Mobile Workers** - Support for Android/iOS devices as lightweight workers
  - Neural Engine on iPhones/iPads for small model inference
  - Qualcomm NPU support on Android devices
  - Remote job submission via mobile app
  - Push notifications for job completion
- **70B Distributed Inference** - Split large models across multiple workers
- **RAG Integration** - Retrieval-augmented generation with codebase context
- **CI/CD Integration** - Automated code review on git commits
- **Video Generation** - Stable Video Diffusion support
- **Fine-tuning Pipeline** - Custom model training on local data
- **Multi-user Authentication** - User accounts with job ownership

## License

This project is available under a **dual license**:

- **AGPL-3.0** - Free for open-source use with copyleft obligations
- **Commercial License** - Available for proprietary/commercial use

Copyright (c) 2025 MarkShenT. See [LICENSE](LICENSE) file for details.
