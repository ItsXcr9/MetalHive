//! MetalHive CLI - mhive
//!
//! Command-line interface for managing Docker container fleets.

mod commands;
mod api;
mod display;

use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::Colorize;

/// MetalHive CLI - Docker Fleet Orchestrator
#[derive(Parser)]
#[command(name = "mhive")]
#[command(author = "Xcr9 <team@xcr9.site>")]
#[command(version = "0.1.0")]
#[command(about = "AI-powered bare-metal Docker fleet orchestrator", long_about = None)]
#[command(propagate_version = true)]
struct Cli {
    /// Controller URL
    #[arg(long, env = "METALHIVE_URL", default_value = "http://localhost:8080")]
    url: String,

    /// Output format (table, json, yaml)
    #[arg(long, short, default_value = "table")]
    output: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Manage fleet nodes
    Nodes {
        #[command(subcommand)]
        action: NodeCommands,
    },
    /// List running containers (alias for containers ls)
    Ps {
        /// Filter by node
        #[arg(long, short)]
        node: Option<String>,
    },
    /// Manage containers
    Containers {
        #[command(subcommand)]
        action: ContainerCommands,
    },
    /// Execute commands across the fleet (HiveShell)
    Run {
        /// Command to execute
        command: String,

        /// Target specific nodes (comma-separated)
        #[arg(long, short)]
        nodes: Option<String>,

        /// Execution strategy (parallel, serial, rolling)
        #[arg(long, default_value = "parallel")]
        strategy: String,

        /// Run with sudo
        #[arg(long)]
        sudo: bool,

        /// Timeout in seconds
        #[arg(long, default_value = "300")]
        timeout: u64,
    },
    /// Run a playbook
    Playbook {
        #[command(subcommand)]
        action: PlaybookCommands,
    },
    /// Manage configuration (HiveVault)
    Config {
        #[command(subcommand)]
        action: ConfigCommands,
    },
    /// Deploy containers/stacks
    Deploy {
        /// Docker Compose file
        #[arg(short, long)]
        file: String,

        /// Target nodes
        #[arg(long, short)]
        nodes: Option<String>,

        /// Deployment strategy
        #[arg(long, default_value = "rolling")]
        strategy: String,
    },
    /// View logs for a container
    Logs {
        /// Container name or ID
        container: String,

        /// Follow log output
        #[arg(long, short)]
        follow: bool,

        /// Number of lines to show
        #[arg(long, short, default_value = "100")]
        tail: u32,
    },
    /// Ask MetalMind AI
    Ask {
        /// Question to ask
        query: Vec<String>,
    },
    /// Analyze fleet health
    Analyze {
        /// Time range in hours
        #[arg(long, default_value = "24")]
        hours: u32,

        /// Target node
        #[arg(long, short)]
        node: Option<String>,
    },
    /// System maintenance commands
    System {
        #[command(subcommand)]
        action: SystemCommands,
    },
    /// Show version information
    Version,
}

#[derive(Subcommand)]
enum NodeCommands {
    /// List all nodes
    Ls,
    /// Show node details
    Show { hostname: String },
    /// Add a node manually
    Add {
        hostname: String,
        #[arg(long)]
        ip: Option<String>,
    },
    /// Remove a node
    Remove { hostname: String },
    /// Drain a node (migrate containers)
    Drain { hostname: String },
    /// Cordon a node (prevent new containers)
    Cordon { hostname: String },
    /// Uncordon a node
    Uncordon { hostname: String },
}

#[derive(Subcommand)]
enum ContainerCommands {
    /// List containers
    Ls {
        #[arg(long, short)]
        node: Option<String>,
    },
    /// Start a container
    Start { id: String },
    /// Stop a container
    Stop { id: String },
    /// Restart a container
    Restart { id: String },
    /// Remove a container
    Rm {
        id: String,
        #[arg(long, short)]
        force: bool,
    },
    /// Execute command in container
    Exec {
        id: String,
        command: Vec<String>,
    },
}

#[derive(Subcommand)]
enum PlaybookCommands {
    /// Run a playbook
    Run {
        /// Path to playbook YAML
        file: String,
    },
    /// Validate a playbook
    Validate {
        /// Path to playbook YAML
        file: String,
    },
}

#[derive(Subcommand)]
enum ConfigCommands {
    /// Get a config value
    Get { path: String },
    /// Set a config value
    Set {
        path: String,
        value: String,
        #[arg(long)]
        secret: bool,
    },
    /// List config keys
    Ls { namespace: Option<String> },
    /// Delete a config key
    Rm { path: String },
    /// Import from .env file
    Import {
        file: String,
        #[arg(long)]
        namespace: Option<String>,
    },
    /// Export to .env file
    Export {
        namespace: String,
        #[arg(long, short)]
        output: Option<String>,
    },
    /// Watch for changes
    Watch { namespace: String },
    /// Show history
    History { path: String },
    /// Rollback to version
    Rollback {
        path: String,
        #[arg(long)]
        version: u32,
    },
}

#[derive(Subcommand)]
enum SystemCommands {
    /// Update fleet systems
    Update {
        /// Update type (os, docker, security)
        #[arg(long, default_value = "os")]
        update_type: String,

        /// Update strategy
        #[arg(long, default_value = "rolling")]
        strategy: String,

        /// Target nodes
        #[arg(long)]
        nodes: Option<String>,
    },
    /// Show update history
    History,
    /// Show fleet status
    Status,
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    // Print banner for interactive commands
    if matches!(cli.command, Commands::Version) {
        print_banner();
    }

    let client = api::Client::new(&cli.url);

    match cli.command {
        Commands::Version => {
            println!("mhive version {}", env!("CARGO_PKG_VERSION"));
            println!("Controller: {}", cli.url);
        }

        Commands::Nodes { action } => match action {
            NodeCommands::Ls => {
                let nodes = client.list_nodes()?;
                display::print_nodes(&nodes, &cli.output);
            }
            NodeCommands::Show { hostname } => {
                let node = client.get_node(&hostname)?;
                display::print_node(&node, &cli.output);
            }
            NodeCommands::Add { hostname, ip } => {
                client.add_node(&hostname, ip.as_deref())?;
                println!("{} Node {} added", "✓".green(), hostname.cyan());
            }
            NodeCommands::Remove { hostname } => {
                client.remove_node(&hostname)?;
                println!("{} Node {} removed", "✓".green(), hostname.cyan());
            }
            NodeCommands::Drain { hostname } => {
                client.drain_node(&hostname)?;
                println!("{} Node {} is draining", "✓".green(), hostname.cyan());
            }
            NodeCommands::Cordon { hostname } => {
                client.cordon_node(&hostname)?;
                println!("{} Node {} cordoned", "✓".green(), hostname.cyan());
            }
            NodeCommands::Uncordon { hostname } => {
                client.uncordon_node(&hostname)?;
                println!("{} Node {} uncordoned", "✓".green(), hostname.cyan());
            }
        },

        Commands::Ps { node } => {
            let containers = client.list_containers(node.as_deref())?;
            display::print_containers(&containers, &cli.output);
        }

        Commands::Containers { action } => match action {
            ContainerCommands::Ls { node } => {
                let containers = client.list_containers(node.as_deref())?;
                display::print_containers(&containers, &cli.output);
            }
            ContainerCommands::Start { id } => {
                client.start_container(&id)?;
                println!("{} Container {} started", "✓".green(), id.cyan());
            }
            ContainerCommands::Stop { id } => {
                client.stop_container(&id)?;
                println!("{} Container {} stopped", "✓".green(), id.cyan());
            }
            ContainerCommands::Restart { id } => {
                client.restart_container(&id)?;
                println!("{} Container {} restarted", "✓".green(), id.cyan());
            }
            ContainerCommands::Rm { id, force: _ } => {
                client.remove_container(&id)?;
                println!("{} Container {} removed", "✓".green(), id.cyan());
            }
            ContainerCommands::Exec { id, command } => {
                println!("Executing in {}: {}", id.cyan(), command.join(" "));
                // TODO: Implement exec
            }
        },

        Commands::Run {
            command,
            nodes,
            strategy,
            sudo,
            timeout,
        } => {
            let target_nodes: Vec<String> = nodes
                .map(|n| n.split(',').map(|s| s.trim().to_string()).collect())
                .unwrap_or_default();

            println!(
                "{} Executing: {}",
                "→".blue(),
                command.yellow()
            );
            println!(
                "  Strategy: {}, Nodes: {}",
                strategy.cyan(),
                if target_nodes.is_empty() {
                    "all".to_string()
                } else {
                    target_nodes.join(", ")
                }
            );

            let result = client.run_command(&command, &target_nodes, &strategy, sudo, timeout)?;
            println!("{} Execution ID: {}", "✓".green(), result.execution_id.cyan());
        }

        Commands::Ask { query } => {
            let question = query.join(" ");
            println!("{} Asking MetalMind: {}", "🤖".purple(), question.italic());
            
            let response = client.ask_ai(&question)?;
            println!("\n{}\n", response.response);
            
            if !response.recommendations.is_empty() {
                println!("{}", "Recommendations:".yellow());
                for rec in response.recommendations {
                    println!("  • {}", rec);
                }
            }
        }

        Commands::Analyze { hours, node } => {
            println!("{} Analyzing fleet (last {} hours)...", "🔍".blue(), hours);
            let report = client.analyze(node.as_deref(), hours)?;
            display::print_analysis(&report, &cli.output);
        }

        Commands::Config { action } => match action {
            ConfigCommands::Get { path } => {
                let value = client.get_config(&path)?;
                println!("{}", value);
            }
            ConfigCommands::Set { path, value, secret } => {
                client.set_config(&path, &value, secret)?;
                println!("{} Config {} set", "✓".green(), path.cyan());
            }
            ConfigCommands::Ls { namespace } => {
                let configs = client.list_config(namespace.as_deref())?;
                display::print_configs(&configs, &cli.output);
            }
            ConfigCommands::Rm { path } => {
                client.delete_config(&path)?;
                println!("{} Config {} deleted", "✓".green(), path.cyan());
            }
            _ => {
                println!("Command not yet implemented");
            }
        },

        Commands::System { action } => match action {
            SystemCommands::Update {
                update_type,
                strategy,
                nodes,
            } => {
                let target_nodes: Vec<String> = nodes
                    .map(|n| n.split(',').map(|s| s.trim().to_string()).collect())
                    .unwrap_or_default();

                println!(
                    "{} Triggering {} update ({})",
                    "→".blue(),
                    update_type.cyan(),
                    strategy
                );
                
                let result = client.trigger_update(&update_type, &strategy, &target_nodes)?;
                println!("{} Update ID: {}", "✓".green(), result.update_id.cyan());
            }
            SystemCommands::History => {
                let history = client.get_update_history()?;
                display::print_updates(&history, &cli.output);
            }
            SystemCommands::Status => {
                let status = client.get_fleet_status()?;
                display::print_status(&status, &cli.output);
            }
        },

        _ => {
            println!("Command not yet implemented");
        }
    }

    Ok(())
}

fn print_banner() {
    println!(
        r#"
  __  __      _        _ _   _ _           
 |  \/  | ___| |_ __ _| | | | (_)_   _____ 
 | |\/| |/ _ \ __/ _` | | |_| | \ \ / / _ \
 | |  | |  __/ || (_| | |  _  | |\ V /  __/
 |_|  |_|\___|\__\__,_|_|_| |_|_| \_/ \___|
                                           
  AI-Powered Docker Fleet Orchestrator
"#
    );
}
