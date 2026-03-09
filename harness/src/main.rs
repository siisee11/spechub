use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};
use harnesscli::cmd;
use harnesscli::{QuerySignal, ServeKind};

#[derive(Parser)]
#[command(name = "harnesscli")]
#[command(about = "Harness engineering control plane for this repository.")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    Smoke,
    Test,
    Lint,
    Typecheck,
    Audit {
        path: Option<PathBuf>,
    },
    Init {
        #[arg(long, default_value = "main")]
        base_branch: String,
        #[arg(long)]
        work_branch: Option<String>,
    },
    Boot,
    Observability {
        #[command(subcommand)]
        command: ObservabilityCommand,
    },
    Cleanup {
        #[command(subcommand)]
        command: CleanupCommand,
    },
    #[command(hide = true)]
    Serve {
        kind: ServeKind,
        #[arg(long)]
        port: u16,
        #[arg(long)]
        worktree_id: String,
        #[arg(long)]
        repo_root: PathBuf,
    },
}

#[derive(Subcommand)]
enum ObservabilityCommand {
    Start,
    Stop {
        #[arg(long)]
        clean: bool,
    },
    Query {
        signal: QuerySignal,
        query: String,
    },
}

#[derive(Subcommand)]
enum CleanupCommand {
    Scan,
    Grade,
    Fix,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Smoke => cmd::smoke::run(),
        Command::Test => cmd::test::run(),
        Command::Lint => cmd::lint::run(),
        Command::Typecheck => cmd::typecheck::run(),
        Command::Audit { path } => cmd::audit::run(path),
        Command::Init {
            base_branch,
            work_branch,
        } => cmd::init::run(&base_branch, work_branch.as_deref()),
        Command::Boot => cmd::boot::run(),
        Command::Observability { command } => match command {
            ObservabilityCommand::Start => cmd::observability::start(),
            ObservabilityCommand::Stop { clean } => cmd::observability::stop(clean),
            ObservabilityCommand::Query { signal, query } => {
                cmd::observability::query(signal, &query)
            }
        },
        Command::Cleanup { command } => match command {
            CleanupCommand::Scan => cmd::cleanup::scan(),
            CleanupCommand::Grade => cmd::cleanup::grade(),
            CleanupCommand::Fix => cmd::cleanup::fix(),
        },
        Command::Serve {
            kind,
            port,
            worktree_id,
            repo_root,
        } => cmd::serve::run(kind, port, &worktree_id, &repo_root),
    }
}
