# Lockerly

[![CI](https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/muneebulhassanpak/nextjs-supabase-r2-cloud-drive/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-black)
![Supabase](https://img.shields.io/badge/Supabase-RLS-3ecf8e)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-f38020)
![License: MIT](https://img.shields.io/badge/license-MIT-blue)

Cloud file storage: upload, organise, preview, share and search your files, with access enforced by the database itself.
Built with Next.js, Supabase (Postgres, Auth, row-level security) and Cloudflare R2.

> Work in progress. A live demo and full documentation will follow.

## Run it locally

Needs Node.js 22, pnpm 10 and Docker. No accounts or API keys.

```bash
pnpm install
pnpm db:start   # local Supabase + S3 storage in Docker
pnpm dev        # http://localhost:3000
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, environments and checks.

## License

[MIT](LICENSE). A personal portfolio project by [Muhammad Muneeb-Ul-Hassan](https://github.com/muneebulhassanpak).
