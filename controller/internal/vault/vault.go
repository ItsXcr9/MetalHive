// Package vault implements HiveVault - the central configuration store
package vault

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"

	"github.com/xcr9/metalhive/controller/internal/store"
)

// HiveVault provides centralized configuration management
type HiveVault struct {
	redis      *redis.Client
	clickhouse *store.ClickHouseClient
}

// ConfigEntry represents a configuration entry
type ConfigEntry struct {
	Path      string    `json:"path"`
	Value     string    `json:"value"`
	IsSecret  bool      `json:"is_secret"`
	UpdatedAt time.Time `json:"updated_at"`
	UpdatedBy string    `json:"updated_by"`
}

// NewHiveVault creates a new HiveVault instance
func NewHiveVault(rdb *redis.Client, ch *store.ClickHouseClient) *HiveVault {
	return &HiveVault{
		redis:      rdb,
		clickhouse: ch,
	}
}

// Set stores a configuration value
func (v *HiveVault) Set(ctx context.Context, path, value string, isSecret bool) error {
	// Normalize path
	path = normalizePath(path)

	// Create entry
	entry := ConfigEntry{
		Path:      path,
		Value:     value,
		IsSecret:  isSecret,
		UpdatedAt: time.Now().UTC(),
		UpdatedBy: "system", // TODO: Get from auth context
	}

	// Store in Redis
	key := "metalhive:config:" + path
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}

	if err := v.redis.Set(ctx, key, data, 0).Err(); err != nil {
		return err
	}

	// Log to ClickHouse for history
	// TODO: Insert into config_history table

	log.Info().
		Str("path", path).
		Bool("is_secret", isSecret).
		Msg("Config set")

	return nil
}

// Get retrieves a configuration value
func (v *HiveVault) Get(ctx context.Context, path string) (string, error) {
	path = normalizePath(path)
	key := "metalhive:config:" + path

	data, err := v.redis.Get(ctx, key).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", errors.New("key not found")
		}
		return "", err
	}

	var entry ConfigEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return "", err
	}

	return entry.Value, nil
}

// Delete removes a configuration value
func (v *HiveVault) Delete(ctx context.Context, path string) error {
	path = normalizePath(path)
	key := "metalhive:config:" + path

	if err := v.redis.Del(ctx, key).Err(); err != nil {
		return err
	}

	log.Info().Str("path", path).Msg("Config deleted")
	return nil
}

// List returns all keys under a namespace
func (v *HiveVault) List(ctx context.Context, namespace string) ([]ConfigEntry, error) {
	namespace = normalizePath(namespace)
	pattern := "metalhive:config:" + namespace + "*"

	keys, err := v.redis.Keys(ctx, pattern).Result()
	if err != nil {
		return nil, err
	}

	entries := make([]ConfigEntry, 0, len(keys))
	for _, key := range keys {
		data, err := v.redis.Get(ctx, key).Bytes()
		if err != nil {
			continue
		}

		var entry ConfigEntry
		if err := json.Unmarshal(data, &entry); err != nil {
			continue
		}

		// Mask secret values
		if entry.IsSecret {
			entry.Value = "**********"
		}

		entries = append(entries, entry)
	}

	return entries, nil
}

// Watch returns a channel that receives updates for a namespace
func (v *HiveVault) Watch(ctx context.Context, namespace string) (<-chan ConfigEntry, error) {
	namespace = normalizePath(namespace)
	pattern := "__keyspace@0__:metalhive:config:" + namespace + "*"

	pubsub := v.redis.PSubscribe(ctx, pattern)
	ch := make(chan ConfigEntry, 100)

	go func() {
		defer close(ch)
		defer pubsub.Close()

		for {
			select {
			case <-ctx.Done():
				return
			case msg := <-pubsub.Channel():
				// Extract key from notification
				key := strings.TrimPrefix(msg.Channel, "__keyspace@0__:")
				path := strings.TrimPrefix(key, "metalhive:config:")

				// Get the updated value
				value, err := v.Get(ctx, path)
				if err != nil {
					continue
				}

				ch <- ConfigEntry{
					Path:      path,
					Value:     value,
					UpdatedAt: time.Now().UTC(),
				}
			}
		}
	}()

	return ch, nil
}

// Import imports configuration from a map
func (v *HiveVault) Import(ctx context.Context, namespace string, configs map[string]string) error {
	namespace = normalizePath(namespace)

	for key, value := range configs {
		path := namespace + key
		if err := v.Set(ctx, path, value, false); err != nil {
			return err
		}
	}

	log.Info().
		Str("namespace", namespace).
		Int("count", len(configs)).
		Msg("Config imported")

	return nil
}

// Export exports all configuration under a namespace
func (v *HiveVault) Export(ctx context.Context, namespace string) (map[string]string, error) {
	entries, err := v.List(ctx, namespace)
	if err != nil {
		return nil, err
	}

	result := make(map[string]string, len(entries))
	for _, entry := range entries {
		key := strings.TrimPrefix(entry.Path, namespace)
		result[key] = entry.Value
	}

	return result, nil
}

// normalizePath ensures path starts with / and has consistent format
func normalizePath(path string) string {
	path = strings.TrimSpace(path)
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	// Remove trailing slash unless it's the root
	if len(path) > 1 && strings.HasSuffix(path, "/") {
		path = strings.TrimSuffix(path, "/")
	}
	return path
}
