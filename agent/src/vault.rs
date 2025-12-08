//! HiveVault Configuration Client
//!
//! Fetches and caches configuration from the MetalHive controller's HiveVault.
//! Configs are stored locally and can be accessed by the agent or exported as
//! environment variables for containers.

use anyhow::Result;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Local configuration cache
#[derive(Debug, Clone, Default)]
pub struct VaultCache {
    /// Cached configurations (path -> value)
    pub configs: HashMap<String, String>,
    /// Last sync timestamp
    pub last_sync: Option<chrono::DateTime<chrono::Utc>>,
}

/// Vault client for fetching configs from controller
pub struct VaultClient {
    controller_url: String,
    http_client: reqwest::Client,
    cache: Arc<RwLock<VaultCache>>,
    /// Namespaces to watch/sync
    namespaces: Vec<String>,
}

impl VaultClient {
    /// Create a new vault client
    pub fn new(controller_url: &str, namespaces: Vec<String>) -> Self {
        Self {
            controller_url: controller_url.to_string(),
            http_client: reqwest::Client::new(),
            cache: Arc::new(RwLock::new(VaultCache::default())),
            namespaces,
        }
    }

    /// Get a config value from cache
    pub async fn get(&self, path: &str) -> Option<String> {
        let cache = self.cache.read().await;
        cache.configs.get(path).cloned()
    }

    /// Get all configs matching a namespace prefix
    pub async fn get_namespace(&self, namespace: &str) -> HashMap<String, String> {
        let cache = self.cache.read().await;
        cache
            .configs
            .iter()
            .filter(|(k, _)| k.starts_with(namespace))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    /// Fetch a single config from controller
    pub async fn fetch_config(&self, path: &str) -> Result<Option<String>> {
        let url = format!("{}/api/v1/config/{}", self.controller_url, path.trim_start_matches('/'));
        
        let response = self.http_client.get(&url).send().await?;
        
        if response.status().is_success() {
            let data: serde_json::Value = response.json().await?;
            if let Some(value) = data.get("value").and_then(|v| v.as_str()) {
                // Update cache
                let mut cache = self.cache.write().await;
                cache.configs.insert(path.to_string(), value.to_string());
                return Ok(Some(value.to_string()));
            }
        } else if response.status().as_u16() == 404 {
            return Ok(None);
        }
        
        Err(anyhow::anyhow!("Failed to fetch config: {}", path))
    }

    /// Sync all configs for watched namespaces
    pub async fn sync(&self) -> Result<usize> {
        let mut total_synced = 0;
        
        for namespace in &self.namespaces {
            match self.sync_namespace(namespace).await {
                Ok(count) => {
                    total_synced += count;
                    debug!(namespace = %namespace, count = count, "Synced namespace");
                }
                Err(e) => {
                    warn!(namespace = %namespace, error = %e, "Failed to sync namespace");
                }
            }
        }
        
        // Update last sync time
        let mut cache = self.cache.write().await;
        cache.last_sync = Some(chrono::Utc::now());
        
        Ok(total_synced)
    }

    /// Sync a specific namespace
    async fn sync_namespace(&self, namespace: &str) -> Result<usize> {
        let url = format!(
            "{}/api/v1/config?namespace={}",
            self.controller_url,
            urlencoding::encode(namespace)
        );
        
        let response = self.http_client.get(&url).send().await?;
        
        if response.status().is_success() {
            let data: serde_json::Value = response.json().await?;
            
            if let Some(configs) = data.get("configs").and_then(|c| c.as_array()) {
                let mut cache = self.cache.write().await;
                let mut count = 0;
                
                for config in configs {
                    if let (Some(path), Some(value)) = (
                        config.get("path").and_then(|p| p.as_str()),
                        config.get("value").and_then(|v| v.as_str()),
                    ) {
                        cache.configs.insert(path.to_string(), value.to_string());
                        count += 1;
                    }
                }
                
                return Ok(count);
            }
        }
        
        Ok(0)
    }

    /// Export configs as environment variables (for container injection)
    pub async fn as_env_vars(&self) -> Vec<(String, String)> {
        let cache = self.cache.read().await;
        cache
            .configs
            .iter()
            .map(|(path, value)| {
                // Convert path to env var name: /production/api/DATABASE_URL -> DATABASE_URL
                let env_name = path
                    .split('/')
                    .last()
                    .unwrap_or(path)
                    .to_uppercase()
                    .replace('-', "_");
                (env_name, value.clone())
            })
            .collect()
    }

    /// Write configs to a .env file
    pub async fn write_env_file(&self, path: &str) -> Result<()> {
        let env_vars = self.as_env_vars().await;
        let content: String = env_vars
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("\n");
        
        tokio::fs::write(path, content).await?;
        info!(path = %path, count = env_vars.len(), "Wrote env file");
        Ok(())
    }
}

/// Background task that syncs configs periodically
pub async fn config_sync_loop(
    controller_url: String,
    namespaces: Vec<String>,
    sync_interval: u64,
    cache: Arc<RwLock<VaultCache>>,
) {
    let client = VaultClient {
        controller_url,
        http_client: reqwest::Client::new(),
        cache,
        namespaces,
    };

    info!(interval = sync_interval, "Starting config sync loop");

    loop {
        match client.sync().await {
            Ok(count) => {
                if count > 0 {
                    info!(count = count, "Synced {} configs from controller", count);
                } else {
                    debug!("No new configs to sync");
                }
            }
            Err(e) => {
                error!(error = %e, "Config sync failed");
            }
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(sync_interval)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_vault_cache() {
        let client = VaultClient::new("http://localhost:8080", vec!["/global/".to_string()]);
        
        // Test empty cache
        assert!(client.get("/global/TEST").await.is_none());
        
        // Test namespace filtering
        let ns_configs = client.get_namespace("/global/").await;
        assert!(ns_configs.is_empty());
    }
}
