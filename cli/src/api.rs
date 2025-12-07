//! API client for MetalHive CLI

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

pub struct Client {
    base_url: String,
    client: reqwest::blocking::Client,
}

#[derive(Debug, Deserialize)]
pub struct Node {
    pub hostname: String,
    pub ip: Option<String>,
    pub labels: Option<std::collections::HashMap<String, String>>,
    pub online: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct NodesResponse {
    pub nodes: Vec<Node>,
    pub total: usize,
}

#[derive(Debug, Deserialize)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub node: Option<String>,
    pub ports: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ContainersResponse {
    pub containers: Vec<Container>,
    pub total: usize,
}

#[derive(Debug, Deserialize)]
pub struct ExecutionResult {
    pub execution_id: String,
    pub status: String,
    pub command: String,
}

#[derive(Debug, Deserialize)]
pub struct AIResponse {
    pub query: String,
    pub response: String,
    pub confidence: f64,
    pub sources: Vec<String>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct AnalysisReport {
    pub report_id: String,
    pub summary: String,
    pub severity: String,
    pub anomalies: Vec<serde_json::Value>,
    pub trends: Vec<serde_json::Value>,
    pub recommendations: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateResult {
    pub update_id: String,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct ConfigEntry {
    pub path: String,
    pub value: String,
    pub is_secret: bool,
}

impl Client {
    pub fn new(base_url: &str) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client: reqwest::blocking::Client::new(),
        }
    }

    fn get<T: for<'de> Deserialize<'de>>(&self, path: &str) -> Result<T> {
        let url = format!("{}/api/v1{}", self.base_url, path);
        let response = self.client.get(&url).send()?;
        
        if !response.status().is_success() {
            return Err(anyhow!("API error: {}", response.status()));
        }
        
        Ok(response.json()?)
    }

    fn post<T: for<'de> Deserialize<'de>, B: Serialize>(&self, path: &str, body: &B) -> Result<T> {
        let url = format!("{}/api/v1{}", self.base_url, path);
        let response = self.client.post(&url).json(body).send()?;
        
        if !response.status().is_success() {
            return Err(anyhow!("API error: {}", response.status()));
        }
        
        Ok(response.json()?)
    }

    fn delete(&self, path: &str) -> Result<()> {
        let url = format!("{}/api/v1{}", self.base_url, path);
        let response = self.client.delete(&url).send()?;
        
        if !response.status().is_success() {
            return Err(anyhow!("API error: {}", response.status()));
        }
        
        Ok(())
    }

    // Nodes
    pub fn list_nodes(&self) -> Result<Vec<Node>> {
        let response: NodesResponse = self.get("/nodes")?;
        Ok(response.nodes)
    }

    pub fn get_node(&self, hostname: &str) -> Result<Node> {
        self.get(&format!("/nodes/{}", hostname))
    }

    pub fn add_node(&self, hostname: &str, ip: Option<&str>) -> Result<()> {
        let body = serde_json::json!({
            "hostname": hostname,
            "ip": ip.unwrap_or(""),
        });
        let _: serde_json::Value = self.post("/nodes", &body)?;
        Ok(())
    }

    pub fn remove_node(&self, hostname: &str) -> Result<()> {
        self.delete(&format!("/nodes/{}", hostname))
    }

    pub fn drain_node(&self, hostname: &str) -> Result<()> {
        let _: serde_json::Value = self.post(&format!("/nodes/{}/drain", hostname), &())?;
        Ok(())
    }

    pub fn cordon_node(&self, hostname: &str) -> Result<()> {
        let _: serde_json::Value = self.post(&format!("/nodes/{}/cordon", hostname), &())?;
        Ok(())
    }

    pub fn uncordon_node(&self, hostname: &str) -> Result<()> {
        let _: serde_json::Value = self.post(&format!("/nodes/{}/uncordon", hostname), &())?;
        Ok(())
    }

    // Containers
    pub fn list_containers(&self, node: Option<&str>) -> Result<Vec<Container>> {
        let path = match node {
            Some(n) => format!("/containers?hostname={}", n),
            None => "/containers".to_string(),
        };
        let response: ContainersResponse = self.get(&path)?;
        Ok(response.containers)
    }

    pub fn start_container(&self, id: &str) -> Result<()> {
        let _: serde_json::Value = self.post(&format!("/containers/{}/start", id), &())?;
        Ok(())
    }

    pub fn stop_container(&self, id: &str) -> Result<()> {
        let _: serde_json::Value = self.post(&format!("/containers/{}/stop", id), &())?;
        Ok(())
    }

    pub fn restart_container(&self, id: &str) -> Result<()> {
        let _: serde_json::Value = self.post(&format!("/containers/{}/restart", id), &())?;
        Ok(())
    }

    pub fn remove_container(&self, id: &str) -> Result<()> {
        self.delete(&format!("/containers/{}", id))
    }

    // HiveShell
    pub fn run_command(
        &self,
        command: &str,
        nodes: &[String],
        strategy: &str,
        sudo: bool,
        timeout: u64,
    ) -> Result<ExecutionResult> {
        let body = serde_json::json!({
            "command": command,
            "nodes": nodes,
            "strategy": strategy,
            "sudo": sudo,
            "timeout_secs": timeout,
        });
        self.post("/exec/run", &body)
    }

    // AI
    pub fn ask_ai(&self, query: &str) -> Result<AIResponse> {
        let body = serde_json::json!({ "query": query });
        self.post("/ai/ask", &body)
    }

    pub fn analyze(&self, node: Option<&str>, hours: u32) -> Result<AnalysisReport> {
        let body = serde_json::json!({
            "hostname": node,
            "time_range_hours": hours,
        });
        self.post("/ai/analyze", &body)
    }

    // Config
    pub fn get_config(&self, path: &str) -> Result<String> {
        let response: serde_json::Value = self.get(&format!("/config/{}", path))?;
        Ok(response["value"].as_str().unwrap_or("").to_string())
    }

    pub fn set_config(&self, path: &str, value: &str, secret: bool) -> Result<()> {
        let body = serde_json::json!({
            "path": path,
            "value": value,
            "secret": secret,
        });
        let _: serde_json::Value = self.post("/config", &body)?;
        Ok(())
    }

    pub fn list_config(&self, namespace: Option<&str>) -> Result<Vec<ConfigEntry>> {
        let path = match namespace {
            Some(ns) => format!("/config/{}*", ns),
            None => "/config/*".to_string(),
        };
        // This would return a list in a real implementation
        Ok(vec![])
    }

    pub fn delete_config(&self, path: &str) -> Result<()> {
        self.delete(&format!("/config/{}", path))
    }

    // System
    pub fn trigger_update(
        &self,
        update_type: &str,
        strategy: &str,
        nodes: &[String],
    ) -> Result<UpdateResult> {
        let body = serde_json::json!({
            "type": update_type,
            "strategy": strategy,
            "nodes": nodes,
        });
        self.post("/system/update", &body)
    }

    pub fn get_update_history(&self) -> Result<Vec<serde_json::Value>> {
        let response: serde_json::Value = self.get("/system/updates")?;
        Ok(response["updates"].as_array().cloned().unwrap_or_default())
    }

    pub fn get_fleet_status(&self) -> Result<serde_json::Value> {
        self.get("/health")
    }
}
