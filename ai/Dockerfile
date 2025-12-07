# ==============================================================================
# MetalMind AI Engine Dockerfile
# ==============================================================================
# Uses Python 3.13 with minimal runtime
# ==============================================================================

# Stage 1: Build
FROM python:3.13-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install pip and build tools
RUN pip install --no-cache-dir --upgrade pip hatch

# Copy project files
COPY pyproject.toml ./
COPY src ./src

# Build wheel
RUN pip wheel --no-cache-dir --wheel-dir /wheels .

# Stage 2: Runtime
FROM python:3.13-slim

# Create non-root user
RUN groupadd -g 1000 metalhive && \
    useradd -u 1000 -g metalhive -s /bin/bash -m metalhive

WORKDIR /app

# Copy wheels from builder
COPY --from=builder /wheels /wheels

# Install the package
RUN pip install --no-cache-dir /wheels/*.whl && \
    rm -rf /wheels

# Switch to non-root user
USER metalhive

# Expose port
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8081/health')" || exit 1

# Default environment variables
ENV METALMIND_HOST=0.0.0.0
ENV METALMIND_PORT=8081
ENV METALMIND_LOG_LEVEL=INFO
ENV METALMIND_NATS_URL=nats://nats:4222
ENV METALMIND_CLICKHOUSE_URL=http://clickhouse:8123
ENV METALMIND_REDIS_URL=redis://dragonfly:6379

# Run the application
CMD ["python", "-m", "metalmind.main"]
