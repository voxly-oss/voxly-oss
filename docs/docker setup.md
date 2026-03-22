# Task: Create Production-Ready Docker Deployment

## Context
Deploy the complete Client AI Platform (FastAPI + Next.js + Celery + Redis) 
on a Hetzner VPS using Docker Compose with Nginx reverse proxy and SSL.

## Tech Stack
- Docker & Docker Compose
- Nginx (reverse proxy)
- Let's Encrypt (SSL)
- Hetzner VPS (4GB RAM)

## Requirements

### 1. Create Complete Docker Setup

**backend/Dockerfile:**
```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Run migrations and start server
CMD alembic upgrade head && \
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
```

**frontend/Dockerfile:**
```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]
```
**docker-compose.prod.yml:**
```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: clientai-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped
    networks:
      - clientai-network

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: clientai-frontend
    environment:
      - NEXT_PUBLIC_API_URL=https://api.yourdomain.com
    restart: unless-stopped
    networks:
      - clientai-network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: clientai-backend
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
      - TWILIO_WHATSAPP_NUMBER=${TWILIO_WHATSAPP_NUMBER}
      - SECRET_KEY=${SECRET_KEY}
      - SENTRY_DSN=${SENTRY_DSN}
    restart: unless-stopped
    depends_on:
      - redis
    networks:
      - clientai-network

  celery-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: clientai-celery-worker
    command: celery -A app.tasks.celery_app worker --loglevel=info --concurrency=2
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
    restart: unless-stopped
    depends_on:
      - redis
    networks:
      - clientai-network

  celery-beat:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: clientai-celery-beat
    command: celery -A app.tasks.celery_app beat --loglevel=info
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    restart: unless-stopped
    depends_on:
      - redis
    networks:
      - clientai-network

  redis:
    image: redis:7-alpine
    container_name: clientai-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - clientai-network

volumes:
  redis_data:

networks:
  clientai-network:
    driver: bridge
```

**nginx/nginx.conf:**
```nginx
events {
    worker_connections 1024;
}

http {
    upstream frontend {
        server frontend:3000;
    }

    upstream backend {
        server backend:8000;
    }

    # Redirect HTTP to HTTPS
    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com api.yourdomain.com;
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://$host$request_uri;
        }
    }

    # Frontend (yourdomain.com)
    server {
        listen 443 ssl http2;
        server_name yourdomain.com www.yourdomain.com;

        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            proxy_pass http://frontend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }

    # Backend API (api.yourdomain.com)
    server {
        listen 443 ssl http2;
        server_name api.yourdomain.com;

        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # CORS headers
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
            add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type' always;
            
            if ($request_method = 'OPTIONS') {
                return 204;
            }
        }
    }
}
```

### 2. Deployment Scripts

**deploy.sh:**
```bash
#!/bin/bash

set -e

echo "🚀 Deploying Client AI Platform..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Build images
echo "🔨 Building Docker images..."
docker-compose -f docker-compose.prod.yml build --no-cache

# Run database migrations
echo "📊 Running database migrations..."
docker-compose -f docker-compose.prod.yml run --rm backend alembic upgrade head

# Deploy with zero-downtime
echo "🔄 Deploying services..."
docker-compose -f docker-compose.prod.yml up -d --force-recreate --remove-orphans

# Cleanup old images
echo "🧹 Cleaning up..."
docker image prune -af

# Health check
echo "🏥 Running health check..."
sleep 10

if curl -f https://api.yourdomain.com/health; then
    echo "✅ Deployment successful!"
else
    echo "❌ Deployment failed - health check failed"
    docker-compose -f docker-compose.prod.yml logs backend
    exit 1
fi

echo "🎉 Deployment complete!"
```

**setup-server.sh (Run once on new VPS):**
```bash
#!/bin/bash

set -e

echo "🔧 Setting up Hetzner VPS..."

# Update system
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
rm get-docker.sh

# Install Docker Compose
apt-get install -y docker-compose-plugin

# Install Certbot
apt-get install -y certbot

# Create app directory
mkdir -p /opt/clientai
cd /opt/clientai

# Clone repository
echo "Enter your GitHub repo URL:"
read repo_url
git clone $repo_url .

# Create .env file
echo "Creating .env file..."
cat > .env << EOF
DATABASE_URL=your_neon_url_here
REDIS_URL=your_upstash_url_here
ANTHROPIC_API_KEY=your_key_here
GITHUB_TOKEN=your_token_here
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
SECRET_KEY=$(openssl rand -hex 32)
SENTRY_DSN=your_sentry_dsn_here
EOF

echo "⚠️  Please edit .env file with your actual credentials"
echo "Run: nano .env"
echo ""
echo "After editing .env, run:"
echo "1. ./setup-ssl.sh yourdomain.com"
echo "2. ./deploy.sh"
```

**setup-ssl.sh:**
```bash
#!/bin/bash

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "Usage: ./setup-ssl.sh yourdomain.com"
    exit 1
fi

echo "🔒 Setting up SSL for $DOMAIN..."

# Get SSL certificate
certbot certonly --standalone \
    -d $DOMAIN \
    -d www.$DOMAIN \
    -d api.$DOMAIN \
    --agree-tos \
    --non-interactive \
    --email admin@$DOMAIN

# Setup auto-renewal
echo "0 0 * * * certbot renew --quiet && docker-compose -f /opt/clientai/docker-compose.prod.yml restart nginx" | crontab -

echo "✅ SSL certificates installed!"
echo "Certificates location: /etc/letsencrypt/live/$DOMAIN/"
```

### 3. Monitoring & Logs

**docker-compose.monitoring.yml (Optional):**
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    restart: unless-stopped

volumes:
  prometheus_data:
  grafana_data:
```

### 4. GitHub Actions CI/CD (.github/workflows/deploy.yml)

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/clientai
            ./deploy.sh
```

### 5. Complete Deployment Checklist

```markdown
## Pre-Deployment
- [ ] Buy domain from Namecheap/GoDaddy
- [ ] Setup Hetzner VPS (CPX21 - 4GB RAM)
- [ ] Point domain A records to VPS IP
- [ ] Create Neon Postgres database
- [ ] Create Upstash Redis database
- [ ] Get Claude API key (Anthropic)
- [ ] Setup Twilio WhatsApp sandbox
- [ ] Get GitHub personal access token

## Server Setup
- [ ] SSH into VPS: `ssh root@your-vps-ip`
- [ ] Run: `./setup-server.sh`
- [ ] Edit .env with real credentials
- [ ] Run: `./setup-ssl.sh yourdomain.com`
- [ ] Run: `./deploy.sh`

## Post-Deployment
- [ ] Test frontend: https://yourdomain.com
- [ ] Test API: https://api.yourdomain.com/docs
- [ ] Test WhatsApp webhook
- [ ] Setup Sentry for error tracking
- [ ] Setup BetterUptime for monitoring
- [ ] Configure Twilio webhook URL
- [ ] Test end-to-end flow with real client

## Monitoring
- [ ] Check logs: `docker-compose -f docker-compose.prod.yml logs -f`
- [ ] Check Celery worker: `docker exec -it clientai-celery-worker celery -A app.tasks.celery_app inspect active`
- [ ] Monitor Redis: `docker exec -it clientai-redis redis-cli INFO`
- [ ] Check disk space: `df -h`
- [ ] Check memory: `free -h`
```

## Deliverables

1. Complete Docker setup (all Dockerfiles)
2. Production docker-compose.yml
3. Nginx configuration with SSL
4. Deployment scripts (automated)
5. Server setup script
6. SSL setup script
7. GitHub Actions CI/CD
8. Monitoring setup (optional)
9. Complete deployment checklist

## Important Notes

- Use `.env` for all secrets (never commit to Git)
- Setup firewall: Allow ports 80, 443, 22 only
- Enable auto-renewal for SSL certificates
- Use healthchecks in docker-compose
- Setup log rotation (Docker handles this by default)
- Backup database regularly (Neon has built-in backups)
- Monitor disk space (Redis can grow)
- Use Docker restart policies
- Test rollback procedure

Generate all deployment files and scripts now.
```

---

## 🎯 **SUMMARY: HOW TO USE THESE PROMPTS**

### **Workflow:**

```bash
# Step 1: Backend (Day 1-2)
Copy PROMPT 1 → Paste in Claude/Cursor → Get complete FastAPI backend

# Step 2: Frontend (Day 3-4)
Copy PROMPT 2 → Paste in Claude/v0/Cursor → Get complete Next.js dashboard

# Step 3: AI Integration (Day 5-6)
Copy PROMPT 3 → Paste in Claude/Cursor → Get AI chat service + GitHub sync

# Step 4: Deployment (Day 7)
Copy PROMPT 4 → Paste in Claude/Cursor → Get Docker deployment files

# Step 5: Deploy
SSH into VPS → Run setup-server.sh → Run deploy.sh → DONE! 🎉
```

---

**Iske alawa kuch chahiye? Ready to start? Bol bhai! 🚀**