# AI Cluster Quick Start Guide

> For project overview and basic setup, see [README.md](README.md). This guide provides detailed deployment instructions for your specific network.

## Your Network Setup

**Subnet:** 10.10.10.x

**Proxmox Hosts (DO NOT USE FOR SERVICES):**
- Node 1: 10.10.10.5
- Node 3 (Pi 5): 10.10.10.19

**LXC Containers (USE THESE):**
- **Coordinator LXC: 10.10.10.75 (CTID: 120)** ✅ EXISTING (internal-docker)
  - Already has Docker installed
  - No internet by default (secure)
  - Internet via router ACL when needed
- Monitor LXC: 10.10.10.101 (to be created on Pi 5)

**IMPORTANT - LXC Access:**
Cannot SSH directly to LXC. Access via Proxmox host:
```bash
ssh root@10.10.10.5   # SSH to Proxmox host first
pct enter 120            # Then enter the LXC container
```

## Security Setup (IMPORTANT!)

Before deploying, generate security credentials:

```bash
# Generate secrets (run on your Mac or any Linux/Unix system)
# Option A: Using /dev/urandom (works everywhere)
echo "API_KEY=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 64 | head -n 1)"
echo "SECRET_KEY=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 64 | head -n 1)"
echo "REDIS_PASSWORD=$(cat /dev/urandom | tr -dc 'a-f0-9' | fold -w 32 | head -n 1)"

# Option B: Using openssl (if available)
# echo "API_KEY=$(openssl rand -hex 32)"
# echo "SECRET_KEY=$(openssl rand -hex 32)"
# echo "REDIS_PASSWORD=$(openssl rand -hex 16)"
```

Copy these values to `.env` file before deploying.

**Note:** The setup.sh script auto-generates these for you, so manual generation is only needed if you skip the setup script.

### Security Model

This system has multiple layers of security suitable for a home lab:

1. **API Key Authentication** - All API requests require `X-API-Key` header
2. **Subnet Restriction** - Only 10.10.10.x IPs can access (at nginx AND Flask levels)
3. **Redis Password** - Internal Redis communication is authenticated
4. **Internet Isolation** - Coordinator has no internet by default

**For Home Lab Use:**
- API key stored in browser localStorage is acceptable because:
  - Only trusted devices on your subnet can access the UI
  - No external/internet access to the system
  - Single-user environment
- This is NOT suitable for production/public deployment without additional security

**IMPORTANT:** The API_KEY must be configured! If not set, all API endpoints will return 500 errors. This is a fail-safe to prevent accidental unauthenticated deployment.

## Quick Deploy (4 Steps)

```bash
# Step 1: From your Mac, copy project to Proxmox host
scp -r /path/to/ai-cluster root@10.10.10.5:/tmp/

# Step 2: SSH to Proxmox and configure security
ssh root@10.10.10.5
cd /tmp/ai-cluster
cp .env.example .env
# Edit .env with your generated secrets:
nano .env   # Set API_KEY, SECRET_KEY, REDIS_PASSWORD

# Step 3: Deploy to LXC
./scripts/deploy-to-lxc.sh --run-setup

# Step 4: Access UI
open http://10.10.10.75
```

## Detailed Setup Steps

### 1. Verify Coordinator LXC (10.10.10.75, CTID: 120)

```bash
# SSH to Proxmox host (NOT directly to LXC!)
ssh root@10.10.10.5

# Check LXC exists and is running
pct list | grep 120
pct status 120

# Enter and verify Docker
pct enter 120
docker --version
docker compose version
exit
```

### 2. Deploy Project to LXC

**Option A: Using deploy script (Recommended)**
```bash
# From your Mac
scp -r /path/to/ai-cluster root@10.10.10.5:/tmp/

# On Proxmox host
ssh root@10.10.10.5
cd /tmp/ai-cluster
./scripts/deploy-to-lxc.sh --run-setup
```

**Option B: Manual deployment**
```bash
# From your Mac
scp -r /path/to/ai-cluster root@10.10.10.5:/tmp/

# On Proxmox host
ssh root@10.10.10.5
cd /tmp && tar czf ai-cluster.tar.gz ai-cluster
pct push 120 /tmp/ai-cluster.tar.gz /opt/ai-cluster.tar.gz
pct exec 120 -- tar xzf /opt/ai-cluster.tar.gz -C /opt/
pct exec 120 -- rm /opt/ai-cluster.tar.gz
pct enter 120
cd /opt/ai-cluster
chmod +x setup.sh scripts/*.sh
./setup.sh
```

### 3. Enable Internet Temporarily (for model downloads)

```
Router (10.10.10.1) → Firewall/ACL
Allow: 10.10.10.75 → Internet (HTTPS/443)
```

### 4. Disable Internet After Setup

```
Router → Disable ACL for 10.10.10.75
(Coordinator doesn't need internet anymore!)
```

### 5. Create Monitor LXC on Pi 5 (Optional)

```bash
# On Proxmox Node 3 (Pi 5)
ssh root@10.10.10.19
cd /tmp/ai-cluster  # Copy project here too
./scripts/setup-monitor-lxc.sh
```

**On Windows GPU Worker:**
```powershell
# Create config (get API_KEY from coordinator's .env file)
@"
COORDINATOR_IP=10.10.10.75
COORDINATOR_PORT=80
API_KEY=your-api-key-from-coordinator
"@ | Out-File worker-config.env

# Run worker setup
.\setup-worker-windows.ps1 --gpu

# Keep PowerShell window open
```

**On macOS Worker:**
```bash
# Create config (get API_KEY from coordinator's .env file)
cat > worker-config.env << EOF
COORDINATOR_IP=10.10.10.75
COORDINATOR_PORT=80
API_KEY=your-api-key-from-coordinator
EOF

# Run worker setup
./setup-worker-macos.sh

# Service auto-starts on boot
```

## Access Your System

- **Frontend:** http://10.10.10.75
- **API:** http://10.10.10.75/api/v1
- **Monitor:** http://10.10.10.101:8080

## Example Usage Breakdown

- **Code generation:** 75% (34B model on GPU worker)
- **Image generation:** 20% (Stable Diffusion on GPU worker)
- **Video generation:** 5% (future)

## Internet Access Strategy

**Coordinator (10.10.10.75):**
- ❌ **Default:** NO internet (secure, isolated)
- ✅ **Enable via router ACL:** Only for model downloads
- ⏱️ **Needed:** ~1 hour initial setup, rare updates (few times/year)
- ⏰ **Then disable:** 99% of time, no internet needed

**Why this is secure:**
- AI inference doesn't need internet
- Workers connect via LAN
- Models cached locally
- Only download models when you choose

**How to enable/disable:**
```
Router (10.10.10.1) → Firewall/ACL
Create rule: 10.10.10.75 → Internet
Protocol: HTTPS (443)
Toggle: ON when downloading, OFF rest of time
```

## Hardware Recommendations

### GPU Workers (Recommended for Image Generation)
- NVIDIA GPU with 8GB+ VRAM for code generation
- 12GB+ VRAM recommended for image generation (Stable Diffusion)
- Consider 16GB+ VRAM for advanced image models

### Mac Workers (Energy Efficient, Always-On)
- Apple Silicon M1/M2/M3/M4 with 16GB+ unified memory
- Good for 7B-13B code models
- 32GB+ unified memory enables 34B models

### CPU Workers (Budget Option)
- 64GB+ RAM for 34B models
- 128GB+ RAM for 70B models (slow but works)
- Useful as overflow capacity

## Common Issues

**Authentication failed (401 error):**
- Check: API_KEY in worker-config.env matches coordinator's .env
- Check: API_KEY header is being sent: `-H "X-API-Key: $API_KEY"`
- Fix: Verify API key is correct and restart worker

**Access denied (403 error):**
- Check: Your IP is in 10.10.10.x subnet
- Check: ALLOWED_SUBNET in coordinator's .env
- Fix: Update ALLOWED_SUBNET if using different network

**Worker can't connect:**
- Check: Using LXC IP (10.10.10.75) not Proxmox host IP (10.10.10.5)
- Check: `curl http://10.10.10.75/api/v1/system/health`
- Check: Coordinator LXC is running: `pct status <CTID>`
- Check: API_KEY is configured in worker-config.env

**Need to download new model:**
- Enable router ACL for 10.10.10.75 temporarily
- Use frontend Model Management page
- Wait for download (progress bar in UI)
- Disable router ACL

**Can't access frontend:**
- Verify LXC is running: `pct status <CTID>`
- Verify Docker containers: `pct exec <CTID> -- docker ps`
- Check correct IP: `pct exec <CTID> -- hostname -I`

**Internet not working in coordinator:**
- This is normal and correct (secure by default)
- Only enable via router ACL when needed
- For model downloads, not normal operations

## File Locations

**In Coordinator LXC (10.10.10.75):**
- Repository: `/opt/ai-cluster/`
- Models: Docker volume `models/` (150GB)
- Results: Docker volume `results/` (100GB)
- Projects: Docker volume `projects/` (50GB)
- Database: Docker volume `job_db/` (5GB)

**On Workers:**
- Windows: `%APPDATA%\ai-worker\`
- macOS: `~/.ai-worker/`

## Key Configuration Files

**Coordinator (.env in LXC 10.10.10.75):**
```bash
COORDINATOR_IP=10.10.10.75  # LXC IP, not Proxmox host
COORDINATOR_PORT=80
API_KEY=your-generated-api-key       # Required for API access
SECRET_KEY=your-generated-secret     # Flask session security
REDIS_PASSWORD=your-redis-password   # Redis authentication
ALLOWED_SUBNET=10.10.10.0/24       # Only allow this subnet
```

**Worker (worker-config.env):**
```bash
COORDINATOR_IP=10.10.10.75  # LXC IP, not Proxmox host
COORDINATOR_PORT=80
API_KEY=your-api-key-from-coordinator  # Must match coordinator
```

## Testing Your Setup

```bash
# Set your API key (from coordinator's .env file)
export API_KEY="your-api-key-here"

# 1. Health check (no API key needed)
curl http://10.10.10.75/api/v1/system/health

# 2. Check workers (API key required)
curl -H "X-API-Key: $API_KEY" http://10.10.10.75/api/v1/workers

# 3. Submit test job (API key required)
curl -X POST http://10.10.10.75/api/v1/jobs \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"prompt":"Write hello world","model":"34b"}'

# 4. Check job status (use job_id from previous response)
curl -H "X-API-Key: $API_KEY" http://10.10.10.75/api/v1/jobs/<job_id>
```

## Important Reminders

✅ **DO:**
- Use LXC IP: 10.10.10.75 (coordinator)
- Control internet via router ACL
- Work inside LXC containers (pct enter)
- Configure workers with LXC IP: 10.10.10.75
- Enable internet only for model downloads
- Disable internet for normal operations
- Generate unique API_KEY, SECRET_KEY, REDIS_PASSWORD
- Keep API_KEY secure and share only with workers

❌ **DON'T:**
- Use Proxmox host IPs (10.10.10.5, 10.10.10.19)
- Run services directly on Proxmox hosts
- Leave internet enabled 24/7 (security risk)
- Forget to disable internet after downloads
- Share API_KEY publicly or commit to git
- Use default/example passwords in production

## Router ACL Configuration

**When to enable internet for 10.10.10.75:**
1. Initial setup (model downloads): ~1 hour
2. Adding new models: ~30 min per model
3. System updates (rare): ~15 min

**How to configure:**
```
Router Admin: http://10.10.10.1
→ Firewall / Access Control / Outbound Rules
→ Add Rule:
   Source: 10.10.10.75
   Destination: Internet/WAN
   Protocol: HTTPS (443)
   Action: ALLOW
→ Toggle: ON/OFF as needed
```

## Next Steps

1. Review README.md for complete documentation
2. Complete Phase 0 (verify LXC, create monitor)
3. Enable router ACL temporarily
4. Follow Phase 1 (core infrastructure)
5. Disable router ACL
6. Phase 2 (frontend UI)
7. Phase 4 (add more workers + image generation)

## Questions During Setup?

**Checking coordinator LXC:**
```bash
pct list | grep 75
pct status <CTID>
pct enter <CTID>
```

**Viewing Docker logs in LXC:**
```bash
pct exec <CTID> -- docker compose logs -f
```

**Testing internet access (should fail by default):**
```bash
pct exec <CTID> -- curl -I https://google.com
# Should timeout - this is correct!
```

**After enabling router ACL:**
```bash
pct exec <CTID> -- curl -I https://google.com
# Should work now
```

---

**Key Advantage of 10.10.10.75:**
- ✅ Existing LXC with Docker (saves setup time)
- ✅ Secure by default (no internet)
- ✅ Flexible (enable/disable internet as needed)
- ✅ Workers can always reach via LAN
- ✅ Best practice architecture

For complete documentation, return to **[README.md](README.md)**

