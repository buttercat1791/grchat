# grchat

Simple full-stack Nostr chat app

## Local Development

### Dev Server

Development requires a local Valkey instance. Use the provided Docker container defined in [valkey.Dockerfile](./containers/valkey.Dockerfile).

To start the Valkey container, from the project root, run:

```bash
docker build -f containers/valkey.Dockerfile -t grchat-valkey .
docker run -t -i -p 6379:6379 grchat-valkey
```

Start the project dev server with:

```bash
deno task dev
```

### Docker Compose

Run the full stack as it would appear in production by using Docker Compose. Run the following from the project root:

```bash
cd containers && docker compose up -d && cd ..
```
