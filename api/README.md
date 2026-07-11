# Personal Budget API

Tracked Cloudflare Worker source and versioned D1 migrations. Production resource IDs and secrets stay in the ignored `.codex-local/cloudflare-api/wrangler.jsonc`.

Safe local workflow:

```powershell
npx wrangler d1 migrations apply personal-budget-ru-db --local --config ".codex-local/cloudflare-api/wrangler.jsonc"
npx wrangler dev --local --config ".codex-local/cloudflare-api/wrangler.jsonc"
```

Before a production migration, export D1 to a path outside the repository, then run `migrations list`, `migrations apply --remote`, and a read-only schema check.
