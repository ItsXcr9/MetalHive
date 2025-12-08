# ==============================================================================
# MetalHive Agent Dockerfile
# ==============================================================================
# Multi-stage build for minimal production image
# Using Debian for build (better SSL) and Alpine for runtime (minimal size)
# ==============================================================================

# Stage 1: Build using Debian (better SSL/network compatibility)
FROM rust:1.83-slim-bookworm AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy source code
COPY Cargo.toml ./
COPY src ./src

# Build the binary
RUN cargo build --release


# Stage 2: Runtime (Alpine for minimal size)
FROM alpine:3.20

# Install runtime dependencies
RUN apk add --no-cache \
    ca-certificates \
    docker-cli \
    avahi-tools \
    libgcc \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 metalhive && \
    adduser -u 1000 -G metalhive -s /bin/sh -D metalhive

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/metalhive-agent /usr/local/bin/metalhive-agent

# Make binary executable
RUN chmod +x /usr/local/bin/metalhive-agent

# Note: Agent needs root for Docker socket access
# In production, use proper Docker group permissions
USER root

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost:9090/health || exit 1

# Default environment variables
ENV RUST_LOG=info
ENV AGENT_ID=auto
ENV CONTROLLER_URL=http://controller:8080
ENV NATS_URL=nats://nats:4222
ENV MDNS_ENABLED=false
ENV METRICS_INTERVAL=10

ENTRYPOINT ["metalhive-agent"]
