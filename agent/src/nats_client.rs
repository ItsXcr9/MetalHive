//! NATS client module
//!
//! Handles NATS connection and messaging

use anyhow::Result;
use tracing::{error, info, warn};

/// NATS client wrapper with reconnection handling
pub struct NatsClient {
    client: async_nats::Client,
    url: String,
}

impl NatsClient {
    /// Connect to NATS server
    pub async fn connect(url: &str) -> Result<Self> {
        let client = async_nats::connect(url).await?;
        info!(url = %url, "Connected to NATS");
        
        Ok(Self {
            client,
            url: url.to_string(),
        })
    }
    
    /// Get the underlying client
    pub fn client(&self) -> &async_nats::Client {
        &self.client
    }
    
    /// Publish a message
    pub async fn publish(&self, subject: &str, payload: Vec<u8>) -> Result<()> {
        self.client.publish(subject.to_string(), payload.into()).await?;
        Ok(())
    }
    
    /// Publish JSON serializable data
    pub async fn publish_json<T: serde::Serialize>(&self, subject: &str, data: &T) -> Result<()> {
        let payload = serde_json::to_vec(data)?;
        self.publish(subject, payload).await
    }
    
    /// Subscribe to a subject
    pub async fn subscribe(&self, subject: &str) -> Result<async_nats::Subscriber> {
        let sub = self.client.subscribe(subject.to_string()).await?;
        Ok(sub)
    }
    
    /// Request-reply pattern
    pub async fn request(&self, subject: &str, payload: Vec<u8>) -> Result<async_nats::Message> {
        let msg = self.client.request(subject.to_string(), payload.into()).await?;
        Ok(msg)
    }
}

/// Create a NATS client with JetStream enabled
pub async fn create_jetstream_client(url: &str) -> Result<async_nats::jetstream::Context> {
    let client = async_nats::connect(url).await?;
    let jetstream = async_nats::jetstream::new(client);
    
    info!(url = %url, "Connected to NATS JetStream");
    Ok(jetstream)
}
