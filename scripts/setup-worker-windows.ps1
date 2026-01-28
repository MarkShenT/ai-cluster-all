# Dual License - AGPL-3.0 or Commercial - Copyright (c) 2025 MarkShenT
# See LICENSE file for details
#===============================================================================
# AI Cluster - Windows Worker Setup Script
#===============================================================================
# This script sets up and runs an AI worker on Windows machines.
#
# SETUP STEPS:
# ============
# 1. Copy these files from ai-cluster project to this Windows machine:
#    - scripts/setup-worker-windows.ps1 (this file)
#    - configs/worker-config.template
#
# 2. Rename worker-config.template to worker-config.env
#
# 3. Edit worker-config.env if coordinator IP differs from 10.10.10.75
#    To check coordinator IP from Proxmox host:
#      ssh root@10.10.10.5
#      pct exec 120 -- hostname -I
#
# 4. Run this script:
#    .\setup-worker-windows.ps1 --gpu          # For machines with NVIDIA GPU
#    .\setup-worker-windows.ps1 --cpu-only     # For machines without GPU
#
# OPTIONS:
#   --gpu              Enable CUDA GPU support
#   --cpu-only         CPU-only mode (no GPU)
#   --config PATH      Custom config file path
#   --uninstall        Remove worker and clean up
#
# PREREQUISITES:
#   - Python 3.11+ installed and in PATH
#   - For GPU: NVIDIA CUDA drivers installed
#
# COORDINATOR INFO:
#   - LXC CTID: 120
#   - Default IP: 10.10.10.75 (NOT the Proxmox host 10.10.10.5!)
#===============================================================================

param(
    [switch]$gpu,
    [switch]$cpuOnly,
    [string]$config = "",
    [switch]$uninstall,
    [switch]$help
)

#-------------------------------------------------------------------------------
# Configuration
#-------------------------------------------------------------------------------

$ScriptVersion = "1.0.0"
$WorkerDir = "$env:APPDATA\ai-worker"
$ConfigFile = if ($config) { $config } else { "worker-config.env" }

# Default values
$DEFAULT_COORDINATOR_IP = "10.10.10.75"
$DEFAULT_COORDINATOR_PORT = "80"

#-------------------------------------------------------------------------------
# Helper Functions
#-------------------------------------------------------------------------------

function Write-Success { param($Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "[WARN] $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }

function Show-Help {
    Write-Host @"

AI Cluster Windows Worker Setup
================================

Usage:
    .\setup-worker-windows.ps1 [options]

Options:
    --gpu           Enable CUDA GPU support (for machines with NVIDIA GPU)
    --cpu-only      CPU-only mode (for machines without GPU)
    --config PATH   Path to worker-config.env file
    --uninstall     Remove worker and clean up
    --help          Show this help message

Examples:
    .\setup-worker-windows.ps1 --gpu
    .\setup-worker-windows.ps1 --cpu-only
    .\setup-worker-windows.ps1 --gpu --config "C:\path\to\worker-config.env"
    .\setup-worker-windows.ps1 --uninstall

The worker will:
1. Load configuration from worker-config.env (or prompt for coordinator IP/API key)
2. Install required Python dependencies
3. Download worker.py from the coordinator
4. Start the worker process (stays open in console)

Press Ctrl+C to stop the worker.

"@
}

function Uninstall-Worker {
    Write-Host ""
    Write-Info "Uninstalling AI Cluster Worker..."
    Write-Host ""

    # Stop any running worker processes
    Write-Info "Checking for running worker processes..."
    $workerProcesses = Get-Process -Name python -ErrorAction SilentlyContinue | Where-Object {
        $_.CommandLine -like "*worker.py*"
    }

    if ($workerProcesses) {
        Write-Info "Stopping worker processes..."
        $workerProcesses | Stop-Process -Force
        Write-Success "Worker processes stopped"
    } else {
        Write-Info "No worker processes running"
    }

    # Remove worker directory
    if (Test-Path $WorkerDir) {
        Write-Host ""
        $confirm = Read-Host "Remove worker directory and models? ($WorkerDir) [y/N]"
        if ($confirm -match '^[Yy]$') {
            Remove-Item -Path $WorkerDir -Recurse -Force
            Write-Success "Worker directory removed"
        } else {
            Write-Info "Keeping worker directory"
        }
    }

    # Remove local config file if exists
    if (Test-Path "worker-config.env") {
        $confirmConfig = Read-Host "Remove local worker-config.env? [y/N]"
        if ($confirmConfig -match '^[Yy]$') {
            Remove-Item -Path "worker-config.env" -Force
            Write-Success "Local config file removed"
        }
    }

    Write-Host ""
    Write-Success "Uninstall complete"
    exit 0
}

function Test-Prerequisites {
    Write-Info "Checking prerequisites..."

    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        Write-Error "PowerShell 5.1 or later required"
        Write-Host "Current version: $($PSVersionTable.PSVersion)"
        exit 1
    }
    Write-Success "PowerShell $($PSVersionTable.PSVersion) OK"

    # Check Python
    try {
        $pythonVersion = & python --version 2>&1
        if ($pythonVersion -match "Python (\d+)\.(\d+)") {
            $major = [int]$Matches[1]
            $minor = [int]$Matches[2]
            if ($major -ge 3 -and $minor -ge 11) {
                Write-Success "Python $pythonVersion OK"
            } else {
                Write-Warning "Python 3.11+ recommended, found $pythonVersion"
            }
        }
    } catch {
        Write-Error "Python not found in PATH"
        Write-Host "Please install Python 3.11+ from https://python.org"
        exit 1
    }

    # Check pip
    try {
        $pipVersion = & pip --version 2>&1
        Write-Success "pip installed"
    } catch {
        Write-Error "pip not found"
        exit 1
    }

    # Check CUDA (if GPU mode)
    if ($gpu) {
        if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
            try {
                $gpuInfo = & nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>&1
                Write-Success "NVIDIA GPU detected: $gpuInfo"
            } catch {
                Write-Warning "nvidia-smi found but couldn't query GPU"
            }
        } else {
            Write-Warning "nvidia-smi not found - CUDA may not be installed"
            Write-Host "Falling back to CPU mode..."
            $script:gpu = $false
            $script:cpuOnly = $true
        }
    }
}

function Load-Configuration {
    Write-Info "Loading configuration..."

    # Check for config file
    if (Test-Path $ConfigFile) {
        Write-Success "Found config file: $ConfigFile"

        Get-Content $ConfigFile | ForEach-Object {
            if ($_ -match '^\s*([^#][^=]+)\s*=\s*(.*)$') {
                $name = $Matches[1].Trim()
                $value = $Matches[2].Trim()
                Set-Variable -Name $name -Value $value -Scope Script
            }
        }

        if ($script:COORDINATOR_IP) {
            Write-Success "Coordinator IP: $script:COORDINATOR_IP"
        }
    } else {
        Write-Warning "No config file found at: $ConfigFile"
        Write-Host ""

        $inputIP = Read-Host "Enter Coordinator IP [$DEFAULT_COORDINATOR_IP]"
        $script:COORDINATOR_IP = if ($inputIP) { $inputIP } else { $DEFAULT_COORDINATOR_IP }
        $script:COORDINATOR_PORT = $DEFAULT_COORDINATOR_PORT

        Write-Host ""
        Write-Info "API Key is required for worker authentication."
        Write-Info "Find it in the coordinator's .env file (API_KEY=...)"
        Write-Host ""
        $script:API_KEY = Read-Host "Enter API Key"

        if (-not $script:API_KEY) {
            Write-Warning "No API key provided - worker may fail to authenticate"
        }

        # Save config for next time
        $configContent = @"
# AI Cluster Worker Configuration
# Auto-generated: $(Get-Date)

COORDINATOR_IP=$($script:COORDINATOR_IP)
COORDINATOR_PORT=$($script:COORDINATOR_PORT)
API_KEY=$($script:API_KEY)
WORKER_ID=
GPU_TYPE=$(if ($gpu) { "cuda" } else { "cpu" })
WORKER_TYPES=inference
"@

        # Create directory if needed
        $configDir = Split-Path -Parent $ConfigFile
        if ($configDir -and !(Test-Path $configDir)) {
            New-Item -ItemType Directory -Path $configDir -Force | Out-Null
        }

        $configContent | Out-File -FilePath $ConfigFile -Encoding UTF8
        Write-Success "Configuration saved to $ConfigFile"
    }

    # Set defaults if not loaded
    if (-not $script:COORDINATOR_IP) { $script:COORDINATOR_IP = $DEFAULT_COORDINATOR_IP }
    if (-not $script:COORDINATOR_PORT) { $script:COORDINATOR_PORT = $DEFAULT_COORDINATOR_PORT }

    # Prompt for API key if not in config
    if (-not $script:API_KEY) {
        Write-Host ""
        Write-Warning "No API key in config file."
        Write-Info "API Key is required for worker authentication."
        Write-Info "Find it in the coordinator's .env file (API_KEY=...)"
        Write-Host ""
        $inputKey = Read-Host "Enter API Key (or press Enter to skip)"
        $script:API_KEY = $inputKey

        # Update config file with API key if provided
        if ($script:API_KEY -and (Test-Path $ConfigFile)) {
            $configContent = Get-Content $ConfigFile -Raw
            if ($configContent -match 'API_KEY=') {
                $configContent = $configContent -replace 'API_KEY=.*', "API_KEY=$($script:API_KEY)"
            } else {
                $configContent += "`nAPI_KEY=$($script:API_KEY)"
            }
            $configContent | Out-File -FilePath $ConfigFile -Encoding UTF8
            Write-Success "API key saved to config file"
        }
    }
}

function Initialize-WorkerDirectory {
    Write-Info "Setting up worker directory..."

    if (!(Test-Path $WorkerDir)) {
        New-Item -ItemType Directory -Path $WorkerDir -Force | Out-Null
        Write-Success "Created $WorkerDir"
    }

    # Create models subdirectory
    $modelsDir = "$WorkerDir\models"
    if (!(Test-Path $modelsDir)) {
        New-Item -ItemType Directory -Path $modelsDir -Force | Out-Null
    }

    # Copy config to worker directory
    if (Test-Path $ConfigFile) {
        Copy-Item $ConfigFile -Destination "$WorkerDir\worker-config.env" -Force
    }
}

function Install-Dependencies {
    Write-Info "Installing Python dependencies..."

    $packages = @(
        "requests",
        "psutil"
    )

    if ($gpu) {
        Write-Info "Installing llama-cpp-python with CUDA support..."
        Write-Host "This may take several minutes..."

        # Install llama-cpp-python with CUDA
        try {
            & pip install llama-cpp-python --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121 --upgrade 2>&1 | Out-Null
            Write-Success "llama-cpp-python (CUDA) installed"
        } catch {
            Write-Warning "CUDA installation failed, trying CPU version..."
            & pip install llama-cpp-python --upgrade 2>&1 | Out-Null
        }
    } else {
        Write-Info "Installing llama-cpp-python (CPU only)..."
        & pip install llama-cpp-python --upgrade 2>&1 | Out-Null
        Write-Success "llama-cpp-python (CPU) installed"
    }

    # Install other packages
    foreach ($package in $packages) {
        try {
            & pip install $package --upgrade 2>&1 | Out-Null
            Write-Success "$package installed"
        } catch {
            Write-Error "Failed to install $package"
        }
    }
}

function Get-WorkerScript {
    $coordinatorUrl = "http://$($script:COORDINATOR_IP):$($script:COORDINATOR_PORT)"
    $workerScriptUrl = "$coordinatorUrl/setup/worker.py"
    $workerScriptPath = "$WorkerDir\worker.py"

    Write-Info "Downloading worker.py from $coordinatorUrl..."

    try {
        # First test connectivity
        $healthUrl = "$coordinatorUrl/api/v1/system/health"
        $healthResponse = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10
        Write-Success "Coordinator is reachable"

        # Download worker.py
        Invoke-WebRequest -Uri $workerScriptUrl -OutFile $workerScriptPath -UseBasicParsing
        Write-Success "worker.py downloaded"
    } catch {
        Write-Error "Failed to connect to coordinator at $coordinatorUrl"
        Write-Host ""
        Write-Host "Possible issues:"
        Write-Host "  1. Coordinator not running"
        Write-Host "  2. Wrong IP address (check COORDINATOR_IP in config)"
        Write-Host "  3. Network connectivity problem"
        Write-Host ""
        Write-Host "Test with: curl $healthUrl"
        Write-Host ""

        # Check if we have a cached worker.py
        if (Test-Path $workerScriptPath) {
            Write-Warning "Using cached worker.py (may be outdated)"
        } else {
            exit 1
        }
    }
}

function Test-VersionUpdate {
    $coordinatorUrl = "http://$($script:COORDINATOR_IP):$($script:COORDINATOR_PORT)"

    try {
        $remoteVersion = (Invoke-WebRequest -Uri "$coordinatorUrl/setup/worker-version.txt" -UseBasicParsing -TimeoutSec 5).Content.Trim()

        if ($remoteVersion -ne $ScriptVersion) {
            Write-Warning "New version available ($remoteVersion)"
            Write-Host "Current version: $ScriptVersion"
            Write-Host "Download latest from coordinator or update manually"
        }
    } catch {
        # Silent fail - version check is optional
    }
}

function Start-Worker {
    $coordinatorUrl = "http://$($script:COORDINATOR_IP):$($script:COORDINATOR_PORT)"
    $gpuType = if ($gpu) { "cuda" } else { "cpu" }
    $workerId = $env:COMPUTERNAME

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host " AI Cluster Worker Starting" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Coordinator: $coordinatorUrl"
    Write-Host "Worker ID:   $workerId"
    Write-Host "GPU Type:    $gpuType"
    Write-Host "RAM:         $([math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB))GB"
    Write-Host "API Key:     $(if ($script:API_KEY) { 'Configured' } else { 'Not set' })"
    Write-Host ""
    Write-Host "Config file: $WorkerDir\worker-config.env"
    Write-Host ""
    Write-Host "To change coordinator IP or API Key:"
    Write-Host "  1. Edit $WorkerDir\worker-config.env"
    Write-Host "  2. Update COORDINATOR_IP=<new-ip> or API_KEY=<key>"
    Write-Host "  3. Restart this script"
    Write-Host ""
    Write-Host "Press Ctrl+C to stop"
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""

    # Start the worker
    $workerScript = "$WorkerDir\worker.py"

    if (Test-Path $workerScript) {
        # Set API_KEY environment variable for the worker process
        $env:API_KEY = $script:API_KEY

        & python $workerScript `
            --coordinator $coordinatorUrl `
            --worker-id $workerId `
            --gpu-type $gpuType
    } else {
        Write-Error "worker.py not found at $workerScript"
        exit 1
    }
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

function Main {
    # Show help if requested
    if ($help) {
        Show-Help
        exit 0
    }

    # Handle uninstall
    if ($uninstall) {
        Uninstall-Worker
    }

    # Default to CPU if neither specified
    if (-not $gpu -and -not $cpuOnly) {
        Write-Warning "No GPU mode specified, defaulting to --cpu-only"
        Write-Host "Use --gpu for CUDA support (if you have an NVIDIA GPU)"
        Write-Host ""
        $script:cpuOnly = $true
    }

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host " AI Cluster Windows Worker Setup" -ForegroundColor Blue
    Write-Host "============================================" -ForegroundColor Blue
    Write-Host ""
    Write-Host "Mode: $(if ($gpu) { 'GPU (CUDA)' } else { 'CPU Only' })"
    Write-Host ""

    Test-Prerequisites
    Load-Configuration
    Initialize-WorkerDirectory
    Install-Dependencies
    Get-WorkerScript
    Test-VersionUpdate
    Start-Worker
}

# Run main
Main
