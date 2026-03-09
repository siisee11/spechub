use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::Duration;

use anyhow::{anyhow, Result};

pub fn wait_for_http_ok(url: &str, attempts: usize, delay_ms: u64) -> Result<()> {
    for _ in 0..attempts {
        if let Ok(body) = http_get(url) {
            if body.contains("\"status\":\"ok\"") {
                return Ok(());
            }
        }
        thread::sleep(Duration::from_millis(delay_ms));
    }
    Err(anyhow!("healthcheck did not become ready for {url}"))
}

pub fn http_get(url: &str) -> Result<String> {
    let parsed = ParsedUrl::parse(url)?;
    let mut stream = TcpStream::connect((parsed.host.as_str(), parsed.port))?;
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        parsed.path, parsed.host
    );
    stream.write_all(request.as_bytes())?;
    let mut buffer = Vec::new();
    stream.read_to_end(&mut buffer)?;
    let response = String::from_utf8_lossy(&buffer);
    let (_, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| anyhow!("malformed http response"))?;
    Ok(body.to_string())
}

pub fn percent_encode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            _ => format!("%{:02X}", byte),
        })
        .collect::<Vec<_>>()
        .join("")
}

struct ParsedUrl {
    host: String,
    port: u16,
    path: String,
}

impl ParsedUrl {
    fn parse(url: &str) -> Result<Self> {
        let without_scheme = url
            .strip_prefix("http://")
            .ok_or_else(|| anyhow!("only http:// urls are supported"))?;
        let (host_port, path) = without_scheme
            .split_once('/')
            .unwrap_or((without_scheme, ""));
        let (host, port) = host_port
            .split_once(':')
            .ok_or_else(|| anyhow!("url missing port"))?;
        Ok(Self {
            host: host.to_string(),
            port: port.parse()?,
            path: format!("/{}", path),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::percent_encode;

    #[test]
    fn percent_encode_handles_spaces() {
        assert_eq!(percent_encode("hello world"), "hello%20world");
    }
}
