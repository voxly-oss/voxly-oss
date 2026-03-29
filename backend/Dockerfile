FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m voxly && chown -R voxly:voxly /app
USER voxly

# Expose default port (Cloud Run overrides via $PORT env var)
EXPOSE 8000

# Run migrations (non-fatal — tables may already exist) then start server.
# Cloud Run injects $PORT; we MUST bind to it or the TCP health probe fails.
CMD ["sh", "-c", "alembic upgrade head || echo 'Migration skipped (already applied or error)' && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
