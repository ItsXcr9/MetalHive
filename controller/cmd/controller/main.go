// Package main is the entry point for the MetalHive Controller
package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
	"github.com/spf13/viper"

	"github.com/xcr9/metalhive/controller/internal/api"
	"github.com/xcr9/metalhive/controller/internal/store"
	"github.com/xcr9/metalhive/controller/internal/vault"
)

func main() {
	// Initialize logging
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr})

	log.Info().Msg("🐝 MetalHive Controller starting...")

	// Load configuration
	loadConfig()

	// Initialize components
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Connect to NATS
	nc, err := connectNATS()
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to NATS")
	}
	defer nc.Close()
	log.Info().Str("url", viper.GetString("nats.url")).Msg("Connected to NATS")

	// Connect to ClickHouse
	clickhouse, err := store.NewClickHouseClient(ctx, viper.GetString("clickhouse.url"))
	if err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to ClickHouse")
	}
	defer clickhouse.Close()
	log.Info().Str("url", viper.GetString("clickhouse.url")).Msg("Connected to ClickHouse")

	// Connect to DragonflyDB (Redis-compatible)
	rdb := redis.NewClient(&redis.Options{
		Addr:     viper.GetString("dragonfly.addr"),
		Password: viper.GetString("dragonfly.password"),
		DB:       0,
	})
	defer rdb.Close()

	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatal().Err(err).Msg("Failed to connect to DragonflyDB")
	}
	log.Info().Str("addr", viper.GetString("dragonfly.addr")).Msg("Connected to DragonflyDB")

	// Initialize HiveVault
	hiveVault := vault.NewHiveVault(rdb, clickhouse)

	// Initialize Fiber app
	app := fiber.New(fiber.Config{
		AppName:               "MetalHive Controller",
		DisableStartupMessage: true,
		ReadTimeout:           30 * time.Second,
		WriteTimeout:          30 * time.Second,
	})

	// Middleware
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${method} ${path} (${latency})\n",
	}))
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*",
		AllowMethods: "GET,POST,PUT,DELETE,PATCH,OPTIONS",
		AllowHeaders: "Origin,Content-Type,Accept,Authorization",
	}))

	// Setup API routes
	apiHandler := api.NewHandler(nc, clickhouse, rdb, hiveVault)
	api.SetupRoutes(app, apiHandler)

	// Start NATS subscribers
	go startNATSSubscribers(ctx, nc, clickhouse, rdb)

	// Start server
	host := viper.GetString("server.host")
	port := viper.GetString("server.port")
	addr := host + ":" + port

	go func() {
		log.Info().Str("addr", addr).Msg("Starting HTTP server")
		if err := app.Listen(addr); err != nil {
			log.Fatal().Err(err).Msg("Failed to start server")
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Info().Msg("Shutting down controller...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := app.ShutdownWithContext(shutdownCtx); err != nil {
		log.Error().Err(err).Msg("Error during shutdown")
	}

	log.Info().Msg("Controller stopped")
}

func loadConfig() {
	viper.SetDefault("server.host", "0.0.0.0")
	viper.SetDefault("server.port", "8080")
	viper.SetDefault("nats.url", "nats://localhost:4222")
	viper.SetDefault("clickhouse.url", "http://localhost:8123")
	viper.SetDefault("dragonfly.addr", "localhost:6379")
	viper.SetDefault("dragonfly.password", "")
	viper.SetDefault("log.level", "info")

	viper.SetEnvPrefix("METALHIVE")
	viper.AutomaticEnv()
	
	// Bind environment variables to nested config keys
	viper.BindEnv("server.host", "METALHIVE_SERVER_HOST")
	viper.BindEnv("server.port", "METALHIVE_SERVER_PORT")
	viper.BindEnv("nats.url", "METALHIVE_NATS_URL")
	viper.BindEnv("clickhouse.url", "METALHIVE_CLICKHOUSE_URL")
	viper.BindEnv("dragonfly.addr", "METALHIVE_DRAGONFLY_ADDR")
	viper.BindEnv("dragonfly.password", "METALHIVE_DRAGONFLY_PASSWORD")
	viper.BindEnv("log.level", "METALHIVE_LOG_LEVEL")

	// Try to load config file
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("/etc/metalhive")

	if err := viper.ReadInConfig(); err != nil {
		log.Debug().Err(err).Msg("No config file found, using defaults and environment")
	}
}

func connectNATS() (*nats.Conn, error) {
	url := viper.GetString("nats.url")
	
	opts := []nats.Option{
		nats.Name("metalhive-controller"),
		nats.ReconnectWait(2 * time.Second),
		nats.MaxReconnects(-1),
		nats.DisconnectErrHandler(func(nc *nats.Conn, err error) {
			log.Warn().Err(err).Msg("NATS disconnected")
		}),
		nats.ReconnectHandler(func(nc *nats.Conn) {
			log.Info().Msg("NATS reconnected")
		}),
	}

	return nats.Connect(url, opts...)
}

func startNATSSubscribers(ctx context.Context, nc *nats.Conn, ch *store.ClickHouseClient, rdb *redis.Client) {
	// Subscribe to agent heartbeats
	nc.Subscribe("metalhive.heartbeat.*", func(msg *nats.Msg) {
		log.Debug().Str("subject", msg.Subject).Msg("Received heartbeat")
		// TODO: Process heartbeat
	})

	// Subscribe to metrics
	nc.Subscribe("metalhive.metrics.>", func(msg *nats.Msg) {
		log.Debug().Str("subject", msg.Subject).Msg("Received metrics")
		// TODO: Store metrics in ClickHouse
	})

	// Subscribe to Docker events
	nc.Subscribe("metalhive.events.docker.>", func(msg *nats.Msg) {
		log.Debug().Str("subject", msg.Subject).Msg("Received Docker event")
		// TODO: Process Docker event
	})

	// Subscribe to command results
	nc.Subscribe("metalhive.results.>", func(msg *nats.Msg) {
		log.Debug().Str("subject", msg.Subject).Msg("Received command result")
		// TODO: Store command result
	})

	// Subscribe to health alerts
	nc.Subscribe("metalhive.health.alert.>", func(msg *nats.Msg) {
		log.Debug().Str("subject", msg.Subject).Msg("Received health alert")
		// TODO: Process health alert
	})

	log.Info().Msg("NATS subscribers started")

	<-ctx.Done()
}
