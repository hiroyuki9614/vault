# Nginx Deployment Baseline

## Purpose

This repository can run as a loopback-only Node.js HTTP upstream behind Nginx.

```text
Internet / internal client
        |
        v
Nginx :443
  TLS termination
  request size / timeout boundary
  request id / proxy headers
        |
        v
127.0.0.1:3100
Node.js Vault HTTP adapter
        |
        v
semantic DocumentService
        |
        v
Supabase REST/RPC
  caller Bearer JWT + publishable/anon key
        |
        v
Supabase Auth + RLS + PostgreSQL
```

Nginx is the public listener. The Node process binds `127.0.0.1` by default and refuses a non-loopback bind unless `VAULT_ALLOW_PUBLIC_BIND=true` is explicitly set.

## Security boundary

The normal runtime does **not** use a Supabase service-role key.

Each `/v1/*` request must carry:

```text
Authorization: Bearer <Supabase user access token>
```

The Node adapter forwards that user access token to the named semantic Supabase RPC together with the configured publishable/anon key. Supabase Auth + RLS remain authoritative.

Do not log or persist the Authorization header, Supabase key, or user token.

## Build

Use Node.js 24 and npm 11.

```bash
npm ci --no-audit --no-fund
npm run check
npm run build
```

Production output is written to `dist/`.

## Runtime environment

Store the production environment outside the repository, for example `/etc/vault/vault.env` owned by root and readable by the `vault` service account only.

Required:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Recommended Nginx topology defaults:

```text
VAULT_HOST=127.0.0.1
VAULT_PORT=3100
SUPABASE_RPC_TIMEOUT_MS=8000
VAULT_REQUEST_TIMEOUT_MS=15000
VAULT_HEADERS_TIMEOUT_MS=10000
VAULT_KEEP_ALIVE_TIMEOUT_MS=5000
VAULT_SHUTDOWN_TIMEOUT_MS=10000
VAULT_MAX_BODY_BYTES=1048576
```

`VAULT_ALLOW_PUBLIC_BIND` should be omitted for an Nginx deployment.

## systemd

Reference unit:

```text
deploy/systemd/vault.service.example
```

Suggested installation shape:

```text
/opt/vault/current/              application release
/etc/vault/vault.env             runtime configuration
/etc/systemd/system/vault.service
```

After placing a built release:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vault.service
sudo systemctl status vault.service
```

The reference unit uses a dedicated `vault` user, no Linux capabilities, `NoNewPrivileges`, filesystem protection, private temporary/device namespaces, and journald output.

## Nginx

Reference configuration:

```text
deploy/nginx/vault.conf.example
```

Replace `vault.example.com` and certificate paths for the target environment, then validate before reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The reference config:

- terminates TLS at Nginx;
- proxies only `/v1/` and health endpoints to `127.0.0.1:3100`;
- explicitly forwards `Authorization`;
- overwrites forwarding/request-id headers at the trusted proxy boundary;
- limits request bodies to 1 MiB;
- bounds connect/send/read timeouts;
- returns 404 for other paths.

Do not expose port `3100` through the host firewall when Nginx is the intended public entrypoint.

## HTTP API

Unauthenticated probes:

```text
GET /health/live
GET /health/ready
```

`/health/ready` means the process parsed configuration and is accepting HTTP requests. It intentionally does not perform a database query on every probe; database/upstream availability remains an operation-level signal.

Authenticated document endpoints:

```text
POST /v1/documents/get-by-path
POST /v1/documents/get-by-id
POST /v1/documents/put
POST /v1/documents/delete
```

Example identity read:

```json
{
  "vaultId": "11111111-1111-4111-8111-111111111111",
  "documentId": "22222222-2222-4222-8222-222222222222"
}
```

The HTTP layer exposes only the Document Capability. It is not a generic Supabase RPC proxy.

## Completion and error semantics

The existing service contract remains authoritative:

```text
HTTP request
 -> pure validation / effect plan
 -> semantic DocumentStore
 -> Supabase RPC
 -> same-document-ID read-back
 -> HTTP completion
```

Provider details are not returned to callers. Stable HTTP error bodies use semantic codes such as `unauthenticated`, `permission_denied`, `version_conflict`, `idempotency_conflict`, `path_conflict`, `unavailable`, and `read_back_mismatch`.

`unavailable` maps to HTTP 503 and may be retried only according to the operation's existing reconciliation rules.

## Deployment acceptance

Before routing production traffic, verify:

1. `npm run check` and `npm run build` pass for the exact release.
2. `systemctl status vault.service` is healthy.
3. `curl http://127.0.0.1:3100/health/live` succeeds on the host.
4. port `3100` is not externally reachable.
5. `nginx -t` succeeds before reload.
6. HTTPS health through Nginx succeeds.
7. anonymous `/v1/*` returns 401.
8. owner/editor/viewer RLS behavior matches the database contract.
9. request logs contain request IDs but no Authorization/token/key values.
10. Supabase outage returns a bounded 503 rather than creating a second canonical store.

## Organization-owned controls

This deployment reference does not manage:

- DNS
- certificate issuance/renewal policy
- host firewall policy
- OS patching
- Nginx package lifecycle
- production secrets distribution
- log retention/aggregation
- monitoring/alerting
- backup/restore
- repository rulesets
- Supabase administrator settings

Those remain deployment/organization responsibilities.
