//! MetalHive Agent Library
//!
//! This crate provides the core functionality for the MetalHive agent.

pub mod config;
pub mod docker;
pub mod executor;
pub mod health;
pub mod metrics;
pub mod nats_client;

pub use config::AgentConfig;
