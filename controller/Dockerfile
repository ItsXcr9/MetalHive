# ==============================================================================
# MetalHive Controller Dockerfile
# ==============================================================================
# Multi-stage build for minimal production image
# ==============================================================================

# Stage 1: Build
FROM golang:1.23-alpine AS builder

# Install build dependencies
RUN apk add --no-cache gcc musl-dev

WORKDIR /app

# Copy source code
COPY . .

# Download dependencies and build
RUN go mod tidy && go mod download

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /controller ./cmd/controller

# Stage 2: Runtime
FROM alpine:3.20

# Install runtime dependencies including Docker CLI for product management
RUN apk add --no-cache ca-certificates tzdata docker-cli docker-cli-compose && \
    rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1000 metalhive && \
    adduser -u 1000 -G metalhive -s /bin/sh -D metalhive

WORKDIR /app

# Copy binary from builder
COPY --from=builder /controller /usr/local/bin/controller

# Make binary executable
RUN chmod +x /usr/local/bin/controller

# Run as root for Docker socket access
# USER metalhive

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost:8080/health || exit 1

# Default environment variables
ENV METALHIVE_SERVER_HOST=0.0.0.0
ENV METALHIVE_SERVER_PORT=8080
ENV METALHIVE_NATS_URL=nats://nats:4222
ENV METALHIVE_CLICKHOUSE_URL=clickhouse:9000
ENV METALHIVE_DRAGONFLY_ADDR=dragonfly:6379
ENV METALHIVE_LOG_LEVEL=info

ENTRYPOINT ["controller"]
