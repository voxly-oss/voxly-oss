#!/bin/bash

# setup_prod.sh - One-command production setup for Ubuntu/Debian

set -e

echo "🔧 Setting up Voxly Production Server..."

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
fi

# Install Docker Compose
sudo apt-get install -y docker-compose-plugin

# Install Certbot (for SSL)
sudo apt-get install -y certbot

# Setup project directories
mkdir -p nginx/ssl

# Done
echo "✅ Server setup complete!"
echo "Next steps:"
echo "1. Configure your .env file"
echo "2. Run: sudo certbot certonly --standalone -d yourdomain.com"
echo "3. Run: ./scripts/deploy_voxly.sh"
