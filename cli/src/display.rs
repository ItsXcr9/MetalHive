//! Display formatting for CLI output

use crate::api::{AnalysisReport, ConfigEntry, Container, Node};
use colored::Colorize;
use tabled::{Table, Tabled};

#[derive(Tabled)]
struct NodeRow {
    #[tabled(rename = "HOSTNAME")]
    hostname: String,
    #[tabled(rename = "STATUS")]
    status: String,
    #[tabled(rename = "IP")]
    ip: String,
    #[tabled(rename = "LABELS")]
    labels: String,
}

pub fn print_nodes(nodes: &[Node], format: &str) {
    match format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(nodes).unwrap());
        }
        _ => {
            if nodes.is_empty() {
                println!("{}", "No nodes registered".yellow());
                return;
            }

            let rows: Vec<NodeRow> = nodes
                .iter()
                .map(|n| NodeRow {
                    hostname: n.hostname.clone(),
                    status: if n.online.unwrap_or(false) {
                        "● Online".green().to_string()
                    } else {
                        "○ Offline".red().to_string()
                    },
                    ip: n.ip.clone().unwrap_or_else(|| "-".to_string()),
                    labels: n
                        .labels
                        .as_ref()
                        .map(|l| {
                            l.iter()
                                .take(3)
                                .map(|(k, v)| format!("{}={}", k, v))
                                .collect::<Vec<_>>()
                                .join(", ")
                        })
                        .unwrap_or_else(|| "-".to_string()),
                })
                .collect();

            let table = Table::new(rows).to_string();
            println!("{}", table);
        }
    }
}

pub fn print_node(node: &Node, format: &str) {
    match format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(node).unwrap());
        }
        _ => {
            println!("Hostname: {}", node.hostname.cyan());
            println!(
                "Status:   {}",
                if node.online.unwrap_or(false) {
                    "Online".green()
                } else {
                    "Offline".red()
                }
            );
            println!(
                "IP:       {}",
                node.ip.as_deref().unwrap_or("-")
            );
            if let Some(labels) = &node.labels {
                println!("Labels:");
                for (k, v) in labels {
                    println!("  {}: {}", k.blue(), v);
                }
            }
        }
    }
}

#[derive(Tabled)]
struct ContainerRow {
    #[tabled(rename = "ID")]
    id: String,
    #[tabled(rename = "NAME")]
    name: String,
    #[tabled(rename = "IMAGE")]
    image: String,
    #[tabled(rename = "STATUS")]
    status: String,
    #[tabled(rename = "NODE")]
    node: String,
}

pub fn print_containers(containers: &[Container], format: &str) {
    match format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(containers).unwrap());
        }
        _ => {
            if containers.is_empty() {
                println!("{}", "No containers found".yellow());
                return;
            }

            let rows: Vec<ContainerRow> = containers
                .iter()
                .map(|c| ContainerRow {
                    id: c.id.chars().take(12).collect(),
                    name: c.name.clone(),
                    image: c.image.clone(),
                    status: match c.status.as_str() {
                        "running" => "● Running".green().to_string(),
                        "paused" => "◐ Paused".yellow().to_string(),
                        _ => format!("○ {}", c.status).red().to_string(),
                    },
                    node: c.node.clone().unwrap_or_else(|| "-".to_string()),
                })
                .collect();

            let table = Table::new(rows).to_string();
            println!("{}", table);
        }
    }
}

pub fn print_configs(configs: &[ConfigEntry], format: &str) {
    match format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(configs).unwrap());
        }
        _ => {
            if configs.is_empty() {
                println!("{}", "No config entries found".yellow());
                return;
            }

            for config in configs {
                let value = if config.is_secret {
                    "***".to_string()
                } else {
                    config.value.clone()
                };
                let secret_badge = if config.is_secret {
                    " [SECRET]".yellow().to_string()
                } else {
                    String::new()
                };
                println!("{}{} = {}", config.path.blue(), secret_badge, value);
            }
        }
    }
}

pub fn print_analysis(report: &AnalysisReport, format: &str) {
    match format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(report).unwrap());
        }
        _ => {
            let severity_color = match report.severity.as_str() {
                "critical" => "red",
                "warning" => "yellow",
                _ => "blue",
            };

            println!("\n{}", "━".repeat(60));
            println!(
                "Report ID: {} | Severity: {}",
                report.report_id.cyan(),
                match severity_color {
                    "red" => report.severity.red(),
                    "yellow" => report.severity.yellow(),
                    _ => report.severity.blue(),
                }
            );
            println!("{}", "━".repeat(60));

            println!("\n{}", "Summary:".bold());
            println!("{}\n", report.summary);

            if !report.anomalies.is_empty() {
                println!("{} ({} found):", "Anomalies".red(), report.anomalies.len());
                for anomaly in &report.anomalies {
                    println!("  • {}", anomaly);
                }
                println!();
            }

            if !report.trends.is_empty() {
                println!("{} ({} found):", "Trends".blue(), report.trends.len());
                for trend in &report.trends {
                    println!("  • {}", trend);
                }
                println!();
            }

            if !report.recommendations.is_empty() {
                println!("{}", "Recommendations:".green());
                for (i, rec) in report.recommendations.iter().enumerate() {
                    println!("  {}. {}", i + 1, rec);
                }
            }
        }
    }
}

pub fn print_updates(updates: &[serde_json::Value], format: &str) {
    match format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(updates).unwrap());
        }
        _ => {
            if updates.is_empty() {
                println!("{}", "No update history".yellow());
                return;
            }

            for update in updates {
                println!("{}", serde_json::to_string_pretty(update).unwrap());
            }
        }
    }
}

pub fn print_status(status: &serde_json::Value, format: &str) {
    match format {
        "json" => {
            println!("{}", serde_json::to_string_pretty(status).unwrap());
        }
        _ => {
            println!("{}", "Fleet Status".bold());
            println!("{}", "─".repeat(40));
            println!(
                "Controller: {}",
                status["status"].as_str().unwrap_or("unknown").green()
            );
            println!(
                "Timestamp:  {}",
                status["timestamp"].as_str().unwrap_or("-")
            );
            println!(
                "Version:    {}",
                status["version"].as_str().unwrap_or("-")
            );
        }
    }
}
