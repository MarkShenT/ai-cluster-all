# Contributing to AI Cluster

Thank you for your interest in contributing to AI Cluster! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 20+
- Docker and Docker Compose
- Git

### Setting Up the Development Environment

1. **Clone the repository:**
   ```bash
   git clone https://github.com/USERNAME/ai-cluster-all.git
   cd ai-cluster-all
   ```

2. **Set up Python environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate

   # Install coordinator dependencies
   pip install -r src/coordinator/requirements.txt
   pip install pytest pytest-cov httpx flake8 black isort

   # Install worker dependencies
   pip install -r src/worker/requirements.txt
   ```

3. **Set up frontend environment:**
   ```bash
   cd src/frontend
   npm install
   ```

4. **Copy environment template:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Running Tests

### Backend Tests

```bash
# Run all Python tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html

# Run specific test file
pytest tests/coordinator/test_api.py -v
```

### Frontend Tests

```bash
cd src/frontend

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm test -- --watch
```

## Code Style

### Python

We use `black` for code formatting, `isort` for import sorting, and `flake8` for linting.

```bash
# Format code
black src/ tests/
isort src/ tests/

# Check formatting
black --check src/ tests/
isort --check-only src/ tests/

# Lint
flake8 src/ tests/ --max-line-length=120
```

### JavaScript/React

We use ESLint for linting.

```bash
cd src/frontend
npm run lint
```

## Pull Request Process

1. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes and commit:**
   ```bash
   git add .
   git commit -m "Add your descriptive commit message"
   ```

3. **Ensure all tests pass:**
   ```bash
   pytest tests/ -v
   cd src/frontend && npm test -- --run
   ```

4. **Ensure code style is correct:**
   ```bash
   black --check src/ tests/
   isort --check-only src/ tests/
   flake8 src/ tests/ --max-line-length=120
   ```

5. **Push and create a pull request:**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Fill out the PR template** with:
   - Description of changes
   - Related issue number (if applicable)
   - Test plan

## CI/CD Pipeline

All pull requests trigger the CI workflow which runs:

- Python tests for coordinator and worker
- Frontend build and lint
- Docker build verification
- Security scanning

PRs must pass all CI checks before merging.

## Reporting Issues

When reporting issues, please include:

- Description of the problem
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Python version, Node version, etc.)
- Relevant logs or error messages

## Security

If you discover a security vulnerability, please do NOT open a public issue. Instead, send details to the maintainers privately.

## License

By contributing to AI Cluster, you agree that your contributions will be licensed under the same dual license (AGPL-3.0 or Commercial) as the project.
