# Personal Budget API

Tracked Cloudflare Worker source and versioned D1 migrations. Production resource IDs and secrets stay in the ignored `.codex-local/cloudflare-api/wrangler.jsonc`.

Safe local workflow:

```powershell
npx wrangler d1 migrations apply personal-budget-ru-db --local --config ".codex-local/cloudflare-api/wrangler.jsonc"
npx wrangler dev --local --config ".codex-local/cloudflare-api/wrangler.jsonc"
```

Before a production migration, export D1 to a path outside the repository, then run `migrations list`, `migrations apply --remote`, and a read-only schema check.

`GET /health` is a readiness check: it performs a read-only `SELECT 1` against D1 and returns the Worker version metadata. `HEAD /health` remains a lightweight liveness check. Responses expose `X-Request-Id`, `X-API-Version` and `Server-Timing` to the allowed frontend origin for safe production diagnostics.

The tracked config enables structured Workers Logs, sampled traces and the `CF_VERSION_METADATA` binding. The ignored production config must keep the same non-secret observability fields and binding names.
