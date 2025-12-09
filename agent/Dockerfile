# ==============================================================================
# MetalHive Agent Dockerfile
# ==============================================================================
# Multi-stage build for minimal production image
# Using Debian for both build and runtime for glibc compatibility
# ==============================================================================

# Stage 1: Build
FROM rust:1.91-slim-bookworm AS builder

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


# Stage 2: Runtime (slim Debian for glibc compatibility)
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    docker.io \
    libssl3 \
    avahi-utils \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1000 metalhive && \
    useradd -u 1000 -g metalhive -s /bin/sh metalhive

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/metalhive-agent /usr/local/bin/metalhive-agent

# Make binary executable
RUN chmod +x /usr/local/bin/metalhive-agent

# Note: Agent needs root for Docker socket access
USER root



# Default environment variables
ENV RUST_LOG=info
ENV AGENT_ID=auto
ENV CONTROLLER_URL=http://controller:8080
ENV NATS_URL=nats://nats:4222
ENV MDNS_ENABLED=false
ENV METRICS_INTERVAL=10

ENTRYPOINT ["metalhive-agent"]
