import http from "node:http";

/**
 * One keep-alive agent for the whole run, so we pay TCP setup once instead of once
 * per sample. A browser reuses its connection too — measuring a fresh handshake on
 * every sample would bury the render cost we are actually trying to move.
 */
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

/**
 * Time one request. Returns the two numbers that matter:
 *
 *   ttfb — first byte of the response (headers). With streaming SSR this can arrive
 *          long before the page is actually renderable, so it is recorded, not gated.
 *   html — last byte of the HTML document. This is the gated number: the point at
 *          which the server is genuinely done with the page.
 *
 * `bytes` and `status` come back too — a route that starts returning 3KB instead of
 * 40KB, or quietly 500s / redirects to /login, would otherwise look like a huge win.
 */
export function timeRequest(port, path, cookie) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const ms = () => Number(process.hrtime.bigint() - start) / 1e6;

    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        agent,
        headers: {
          // A stable, realistic request. Accept-Encoding is pinned: letting the client
          // negotiate would let compression settings drift between runs.
          "accept": "text/html,application/xhtml+xml",
          "accept-encoding": "gzip",
          "user-agent": "perf-harness",
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        const ttfb = ms();
        let bytes = 0;
        res.on("data", (chunk) => {
          bytes += chunk.length;
        });
        res.on("end", () =>
          resolve({ ttfb, html: ms(), bytes, status: res.statusCode, location: res.headers.location }),
        );
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.end();
  });
}

/** p50 / p95 from raw samples. Median, never mean: one GC pause must not move the number. */
export function summarize(samples) {
  const at = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
  const pick = (key) => {
    const sorted = samples.map((s) => s[key]).sort((a, b) => a - b);
    return { p50: +at(sorted, 0.5).toFixed(1), p95: +at(sorted, 0.95).toFixed(1) };
  };
  return {
    ttfb: pick("ttfb"),
    html: pick("html"),
    bytes: samples[0].bytes,
    status: samples[0].status,
  };
}

export const closeAgent = () => agent.destroy();
