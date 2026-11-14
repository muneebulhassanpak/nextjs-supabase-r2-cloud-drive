# Project notes

Lockerly keeps files in **Cloudflare R2** and everything else in **Postgres**.

- Uploads go straight from the browser to storage.
- Row-level security decides who sees what.
- Previews never run a file's scripts.

```ts
const greeting = "hello";
```
