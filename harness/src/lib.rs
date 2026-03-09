pub mod cmd;
pub mod lint;
pub mod util;

#[derive(Clone, Debug, clap::ValueEnum)]
pub enum QuerySignal {
    Logs,
    Metrics,
    Traces,
}

#[derive(Clone, Debug, clap::ValueEnum)]
pub enum ServeKind {
    App,
    Collector,
    Logs,
    Metrics,
    Traces,
}
