# Storage settings

Browsers upload and download file bytes straight to the bucket with signed links, so each bucket
lets the app's own site (and nothing else) send `PUT` and `GET` requests. The only headers it may
send are `content-type` (uploads) and `range` (text previews read just the first 1 MB):

| File                      | Bucket             | Allowed site                           |
| ------------------------- | ------------------ | -------------------------------------- |
| `r2-cors.staging.json`    | `lockerly-staging` | https://staging.lockerly.heymuneeb.dev |
| `r2-cors.production.json` | `lockerly-prod`    | https://lockerly.heymuneeb.dev         |

Apply a change with Wrangler (needs a Cloudflare login with R2 access):

```bash
pnpm dlx wrangler@4 r2 bucket cors set lockerly-staging --file storage/r2-cors.staging.json
pnpm dlx wrangler@4 r2 bucket cors list lockerly-staging
```

Locally, `pnpm db:start` (through `pnpm storage:init`) applies the same rules to the RustFS bucket
for `http://localhost:3000` and `http://localhost:3100` (the e2e server).

Vercel preview deployments use their own `*.vercel.app` addresses, which aren't listed, so uploads
only work on the staging and production domains.
