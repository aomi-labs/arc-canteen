use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

pub(crate) struct RecordedRequest {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) authorization: Option<String>,
    pub(crate) body: Vec<u8>,
}

pub(crate) struct MockResponse {
    pub(crate) status: u16,
    pub(crate) reason: &'static str,
    pub(crate) body: String,
    pub(crate) delay: Duration,
}

impl MockResponse {
    pub(crate) fn json(status: u16, body: impl Into<String>) -> Self {
        Self {
            status,
            reason: reason_phrase(status),
            body: body.into(),
            delay: Duration::ZERO,
        }
    }

    pub(crate) fn delayed(status: u16, body: impl Into<String>, delay: Duration) -> Self {
        Self {
            status,
            reason: reason_phrase(status),
            body: body.into(),
            delay,
        }
    }
}

pub(crate) struct MockServer {
    addr: SocketAddr,
    shutdown: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl MockServer {
    pub(crate) fn base_url(&self) -> String {
        format!("http://{}", self.addr)
    }
}

impl Drop for MockServer {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect_timeout(&self.addr, Duration::from_millis(50));
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

pub(crate) fn spawn(
    handler: impl Fn(&RecordedRequest) -> MockResponse + Send + Sync + 'static,
) -> MockServer {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock payment API");
    listener
        .set_nonblocking(false)
        .expect("blocking mock listener");
    let addr = listener.local_addr().expect("mock listener address");
    let shutdown = Arc::new(AtomicBool::new(false));
    let thread_shutdown = shutdown.clone();
    let handler = Arc::new(handler);

    let handle = thread::spawn(move || {
        listener.set_nonblocking(true).ok();
        while !thread_shutdown.load(Ordering::SeqCst) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    if thread_shutdown.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(request) = read_http_request(&mut stream) {
                        let response = handler(&request);
                        if !response.delay.is_zero() {
                            thread::sleep(response.delay);
                        }
                        let _ = write_http_response(&mut stream, &response);
                    }
                }
                Err(error)
                    if error.kind() == std::io::ErrorKind::WouldBlock
                        || error.kind() == std::io::ErrorKind::Interrupted =>
                {
                    thread::sleep(Duration::from_millis(5));
                }
                Err(_) => break,
            }
        }
    });

    MockServer {
        addr,
        shutdown,
        handle: Some(handle),
    }
}

fn read_http_request(stream: &mut TcpStream) -> std::io::Result<RecordedRequest> {
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];

    loop {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..read]);
        if buf.windows(4).any(|window| window == b"\r\n\r\n") || buf.len() > 64 * 1024 {
            break;
        }
    }

    let header_end = buf
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "incomplete headers"))?;
    let header_bytes = &buf[..header_end];
    let mut leftover = buf[header_end + 4..].to_vec();
    let headers = String::from_utf8_lossy(header_bytes);
    let mut lines = headers.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "missing request line"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();

    let mut authorization = None;
    let mut content_length = 0usize;
    for line in lines {
        let (name, value) = match line.split_once(':') {
            Some(pair) => pair,
            None => continue,
        };
        if name.eq_ignore_ascii_case("authorization") {
            authorization = Some(value.trim().to_string());
        }
        if name.eq_ignore_ascii_case("content-length") {
            content_length = value.trim().parse().unwrap_or(0);
        }
    }

    while leftover.len() < content_length {
        let read = stream.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        leftover.extend_from_slice(&chunk[..read]);
    }
    leftover.truncate(content_length);

    Ok(RecordedRequest {
        method,
        path,
        authorization,
        body: leftover,
    })
}

fn write_http_response(stream: &mut TcpStream, response: &MockResponse) -> std::io::Result<()> {
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    let header = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        response.status,
        response.reason,
        response.body.len()
    );
    stream.write_all(header.as_bytes())?;
    stream.write_all(response.body.as_bytes())?;
    stream.flush()
}

fn reason_phrase(status: u16) -> &'static str {
    match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        500 => "Internal Server Error",
        _ => "OK",
    }
}
