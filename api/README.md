# Personal Budget API

Tracked Cloudflare Worker source and versioned D1 migrations. `wrangler.example.jsonc` contains placeholders only; production resource IDs, credentials and operational runbooks are intentionally not stored in this public repository.

`GET /health` is a readiness check: it performs a read-only `SELECT 1` against D1 and returns the Worker version metadata. `HEAD /health` remains a lightweight liveness check. Responses expose `X-Request-Id`, `X-API-Version` and `Server-Timing` to the allowed frontend origin for safe production diagnostics.

The example config keeps complete low-volume Workers Logs and samples 1% of traces. Success logs are limited to meaningful writes and security events, while login names, session IDs and financial data are never included.
