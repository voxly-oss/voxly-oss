#!/bin/bash

# Voxly Deployment Script
# Usage: ./deploy.sh [staging|prod]

ENVIRONMENT=${1:-prod}
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Deploying Voxly to $ENVIRONMENT..."

# Load env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Pull latest
echo "📥 Pulling latest code..."
git pull origin main

# Build
echo "🔨 Building Docker images..."
docker-compose -f $COMPOSE_FILE build --no-cache

# Migrations
echo "📊 Running database migrations..."
docker-compose -f $COMPOSE_FILE run --rm backend alembic upgrade head

# Up
echo "🔄 Restarting services..."
docker-compose -f $COMPOSE_FILE up -d --force-recreate --remove-orphans

# Clean up
echo "🧹 Cleaning up old images..."
docker image prune -af

echo "✅ Voxly $ENVIRONMENT deployment complete!"
