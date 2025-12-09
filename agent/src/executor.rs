//! Command executor module (HiveShell)
//!
//! Executes commands received from the controller via NATS

use crate::AgentState;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::RwLock;
use tracing::{debug, error, info};
use futures::StreamExt;

/// Command execution request
#[derive(Debug, serde::Deserialize)]
pub struct CommandRequest {
    pub execution_id: String,
    pub command: String,
    pub timeout_secs: Option<u64>,
    pub use_sudo: bool,
    pub working_dir: Option<String>,
    pub env_vars: Option<std::collections::HashMap<String, String>>,
}

/// Command execution result
#[derive(Debug, serde::Serialize)]
pub struct CommandResult {
    pub execution_id: String,
    pub hostname: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub started_at: chrono::DateTime<chrono::Utc>,
    pub completed_at: chrono::DateTime<chrono::Utc>,
    pub duration_ms: u64,
}

/// Listen for command execution requests via NATS
pub async fn command_listener(state: Arc<RwLock<AgentState>>) {
    info!("Starting command executor listener");
    
    let state_read = state.read().await;
    let hostname = state_read.hostname.clone();
    
    let nats = match &state_read.nats_client {
        Some(client) => client.clone(),
        None => {
            error!("NATS client not available, command executor disabled");
            return;
        }
    };
    drop(state_read);
    
    // Subscribe to commands for this specific node and broadcast commands
    let node_subject = format!("metalhive.commands.{}", hostname);
    let broadcast_subject = "metalhive.commands.broadcast";
    
    let mut node_sub: async_nats::Subscriber = match nats.subscribe(node_subject.clone()).await {
        Ok(sub) => sub,
        Err(e) => {
            error!(error = %e, "Failed to subscribe to node commands");
            return;
        }
    };
    
    let mut broadcast_sub: async_nats::Subscriber = match nats.subscribe(broadcast_subject).await {
        Ok(sub) => sub,
        Err(e) => {
            error!(error = %e, "Failed to subscribe to broadcast commands");
            return;
        }
    };
    
    info!(
        node_subject = %node_subject,
        broadcast_subject = %broadcast_subject,
        "Subscribed to command subjects"
    );
    
    loop {
        tokio::select! {
            Some(msg) = node_sub.next() => {
                handle_command_message(&state, &nats, msg).await;
            }
            Some(msg) = broadcast_sub.next() => {
                handle_command_message(&state, &nats, msg).await;
            }
        }
    }
}

async fn handle_command_message(
    state: &Arc<RwLock<AgentState>>,
    nats: &async_nats::Client,
    msg: async_nats::Message,
) {
    let state_read = state.read().await;
    let hostname = state_read.hostname.clone();
    let vault_cache = state_read.vault_cache.clone();
    drop(state_read);
    
    match serde_json::from_slice::<CommandRequest>(&msg.payload) {
        Ok(mut request) => {
            info!(
                execution_id = %request.execution_id,
                command = %request.command,
                "Received command request"
            );
            
            // Inject vault env vars: prepend source command to load .env_vault
            // This ensures all vault configs are available as shell env vars
            // Use '.' (dot) instead of 'source' for POSIX shell compatibility
            let original_cmd = request.command.clone();
            request.command = format!(
                ". /etc/metalhive/.env_vault 2>/dev/null || true; {}",
                original_cmd
            );
            
            // Also merge vault cache into env_vars for direct process injection
            let vault_env = vault_cache.read().await.as_env_map();
            if !vault_env.is_empty() {
                let mut merged_env = vault_env;
                // Request-specified env vars take precedence over vault
                if let Some(req_env) = &request.env_vars {
                    merged_env.extend(req_env.clone());
                }
                request.env_vars = Some(merged_env);
            }
            
            // Use streaming execution for real-time output
            let output_subject = format!("metalhive.output.{}", request.execution_id);
            let nats_clone = nats.clone();
            
            let result = execute_command_streaming_nats(
                &hostname,
                &request,
                &nats_clone,
                &output_subject,
            ).await;
            
            // Publish final result
            let result_subject = format!("metalhive.results.{}", request.execution_id);
            if let Ok(payload) = serde_json::to_vec(&result) {
                if let Err(e) = nats.publish(result_subject, bytes::Bytes::from(payload)).await {
                    error!(error = %e, "Failed to publish command result");
                }
            }
        }
        Err(e) => {
            error!(error = %e, "Failed to parse command request");
        }
    }
}

/// Execute a command and capture output
pub async fn execute_command(hostname: &str, request: &CommandRequest) -> CommandResult {
    let started_at = chrono::Utc::now();
    
    // Build command
    let shell_cmd = if request.use_sudo {
        format!("sudo {}", request.command)
    } else {
        request.command.clone()
    };
    
    // Use nsenter to execute in the host's namespace (PID 1)
    // This requires --privileged or specific capabilities and --pid=host
    let mut cmd = Command::new("nsenter");
    cmd.args([
        "-t", "1",           // Target PID 1 (host's init process)
        "-m",                // Mount namespace
        "-u",                // UTS namespace (hostname)
        "-i",                // IPC namespace
        "-n",                // Network namespace
        "-p",                // PID namespace
        "--",                // End of nsenter args
        "/bin/sh", "-c", &shell_cmd,  // Run shell command on host
    ]);
    
    // Set working directory if specified
    if let Some(ref dir) = request.working_dir {
        // For nsenter, we need to cd inside the command
        let shell_cmd_with_cd = format!("cd {} && {}", dir, shell_cmd);
        cmd = Command::new("nsenter");
        cmd.args([
            "-t", "1", "-m", "-u", "-i", "-n", "-p", "--",
            "/bin/sh", "-c", &shell_cmd_with_cd,
        ]);
    }
    
    // Set environment variables
    if let Some(ref env_vars) = request.env_vars {
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
    }
    
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    // Spawn process
    let child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            let completed_at = chrono::Utc::now();
            return CommandResult {
                execution_id: request.execution_id.clone(),
                hostname: hostname.to_string(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Failed to spawn process: {}", e),
                started_at,
                completed_at,
                duration_ms: (completed_at - started_at).num_milliseconds() as u64,
            };
        }
    };
    
    // Handle timeout
    let timeout = tokio::time::Duration::from_secs(request.timeout_secs.unwrap_or(300));
    
    let result = tokio::time::timeout(timeout, async {
        let output = child.wait_with_output().await;
        output
    }).await;
    
    let completed_at = chrono::Utc::now();
    let duration_ms = (completed_at - started_at).num_milliseconds() as u64;
    
    match result {
        Ok(Ok(output)) => {
            CommandResult {
                execution_id: request.execution_id.clone(),
                hostname: hostname.to_string(),
                exit_code: output.status.code().unwrap_or(-1),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                started_at,
                completed_at,
                duration_ms,
            }
        }
        Ok(Err(e)) => {
            CommandResult {
                execution_id: request.execution_id.clone(),
                hostname: hostname.to_string(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Process error: {}", e),
                started_at,
                completed_at,
                duration_ms,
            }
        }
        Err(_) => {
            CommandResult {
                execution_id: request.execution_id.clone(),
                hostname: hostname.to_string(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Command timed out after {} seconds", timeout.as_secs()),
                started_at,
                completed_at,
                duration_ms,
            }
        }
    }
}

/// Execute a command and stream output line by line (for real-time feedback)
pub async fn execute_command_streaming<F>(
    hostname: &str,
    request: &CommandRequest,
    on_output: F,
) -> CommandResult
where
    F: Fn(&str, bool) + Send + Sync, // (line, is_stderr)
{
    let started_at = chrono::Utc::now();
    
    let shell_cmd = if request.use_sudo {
        format!("sudo {}", request.command)
    } else {
        request.command.clone()
    };
    
    // Use nsenter to execute in the host's namespace (PID 1)
    let mut cmd = Command::new("nsenter");
    cmd.args([
        "-t", "1", "-m", "-u", "-i", "-n", "-p", "--",
        "/bin/sh", "-c", &shell_cmd,
    ]);
    
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            let completed_at = chrono::Utc::now();
            return CommandResult {
                execution_id: request.execution_id.clone(),
                hostname: hostname.to_string(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Failed to spawn process: {}", e),
                started_at,
                completed_at,
                duration_ms: (completed_at - started_at).num_milliseconds() as u64,
            };
        }
    };
    
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();
    
    let mut stdout_output = String::new();
    let mut stderr_output = String::new();
    
    loop {
        tokio::select! {
            line = stdout_reader.next_line() => {
                match line {
                    Ok(Some(line)) => {
                        on_output(&line, false);
                        stdout_output.push_str(&line);
                        stdout_output.push('\n');
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
            line = stderr_reader.next_line() => {
                match line {
                    Ok(Some(line)) => {
                        on_output(&line, true);
                        stderr_output.push_str(&line);
                        stderr_output.push('\n');
                    }
                    Ok(None) => {}
                    Err(_) => {}
                }
            }
        }
    }
    
    let status = child.wait().await;
    let completed_at = chrono::Utc::now();
    
    CommandResult {
        execution_id: request.execution_id.clone(),
        hostname: hostname.to_string(),
        exit_code: status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1),
        stdout: stdout_output,
        stderr: stderr_output,
        started_at,
        completed_at,
        duration_ms: (completed_at - started_at).num_milliseconds() as u64,
    }
}

/// Output line message for streaming
#[derive(Debug, serde::Serialize)]
pub struct OutputLine {
    pub execution_id: String,
    pub hostname: String,
    pub line: String,
    pub is_stderr: bool,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Execute a command and stream output via NATS
pub async fn execute_command_streaming_nats(
    hostname: &str,
    request: &CommandRequest,
    nats: &async_nats::Client,
    output_subject: &str,
) -> CommandResult {
    let started_at = chrono::Utc::now();
    let execution_id = request.execution_id.clone();
    let hostname_str = hostname.to_string();
    
    let shell_cmd = if request.use_sudo {
        format!("sudo {}", request.command)
    } else {
        request.command.clone()
    };
    
    // Use nsenter to execute in the host's namespace (PID 1)
    let mut cmd = Command::new("nsenter");
    cmd.args([
        "-t", "1", "-m", "-u", "-i", "-n", "-p", "--",
        "/bin/sh", "-c", &shell_cmd,
    ]);
    
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            let completed_at = chrono::Utc::now();
            return CommandResult {
                execution_id: request.execution_id.clone(),
                hostname: hostname.to_string(),
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Failed to spawn process: {}", e),
                started_at,
                completed_at,
                duration_ms: (completed_at - started_at).num_milliseconds() as u64,
            };
        }
    };
    
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();
    
    let mut stdout_output = String::new();
    let mut stderr_output = String::new();
    
    loop {
        tokio::select! {
            line = stdout_reader.next_line() => {
                match line {
                    Ok(Some(line_content)) => {
                        // Publish line to NATS
                        let output_line = OutputLine {
                            execution_id: execution_id.clone(),
                            hostname: hostname_str.clone(),
                            line: line_content.clone(),
                            is_stderr: false,
                            timestamp: chrono::Utc::now(),
                        };
                        if let Ok(payload) = serde_json::to_vec(&output_line) {
                            let _ = nats.publish(output_subject.to_string(), bytes::Bytes::from(payload)).await;
                        }
                        stdout_output.push_str(&line_content);
                        stdout_output.push('\n');
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
            line = stderr_reader.next_line() => {
                match line {
                    Ok(Some(line_content)) => {
                        // Publish line to NATS
                        let output_line = OutputLine {
                            execution_id: execution_id.clone(),
                            hostname: hostname_str.clone(),
                            line: line_content.clone(),
                            is_stderr: true,
                            timestamp: chrono::Utc::now(),
                        };
                        if let Ok(payload) = serde_json::to_vec(&output_line) {
                            let _ = nats.publish(output_subject.to_string(), bytes::Bytes::from(payload)).await;
                        }
                        stderr_output.push_str(&line_content);
                        stderr_output.push('\n');
                    }
                    Ok(None) => {}
                    Err(_) => {}
                }
            }
        }
    }
    
    let status = child.wait().await;
    let completed_at = chrono::Utc::now();
    
    CommandResult {
        execution_id: request.execution_id.clone(),
        hostname: hostname.to_string(),
        exit_code: status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1),
        stdout: stdout_output,
        stderr: stderr_output,
        started_at,
        completed_at,
        duration_ms: (completed_at - started_at).num_milliseconds() as u64,
    }
}
