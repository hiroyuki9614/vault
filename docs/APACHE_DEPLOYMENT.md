# Apache Deployment Baseline

## Purpose

This repository can run as a loopback-only Node.js HTTP upstream behind Apache HTTP Server 2.4.

```text
Internet / internal client
        |
        v
Apache :443
  TLS termination
  request size / timeout boundary
  trusted request correlation id
  reverse-proxy headers
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

Apache is the public listener. The Node process binds `127.0.0.1` by default and refuses a non-loopback bind unless `VAULT_ALLOW_PUBLIC_BIND=true` is explicitly set.

## Security boundary

The normal runtime does **not** use a Supabase service-role key.

Each `/v1/*` request must carry:

```text
Authorization: Bearer <Supabase user access token>
```

The Apache reference vhost preserves the incoming Authorization value at the trusted proxy boundary. The Node adapter forwards that user access token to the named semantic Supabase RPC together with the configured publishable/anon key. Supabase Auth + RLS remain authoritative.

Correlation identity is different from caller identity. Clients must not control the request ID used for operational correlation. The reference vhost enables `mod_unique_id` and replaces any incoming `X-Request-ID` with Apache's `UNIQUE_ID` before proxying to Node. Node returns that trusted value in the response and structured request log. Direct loopback Node requests that do not pass through Apache still generate a UUID when no acceptable request ID is supplied.

Do not log or persist the Authorization header, captured Authorization environment variable, Supabase key, user token, or request body.

## Build

Use Node.js 24 and npm 11.

```bash
npm ci --no-audit --no-fund
npm run check
npm run build
```

Production output is written to `dist/` and is intentionally not committed. CI builds the same output, starts `dist/server/main.js`, checks loopback liveness, sends SIGTERM, and requires a clean shutdown.

## Runtime environment

Store the production environment outside the repository, for example `/etc/vault/vault.env` owned by root and readable by the `vault` service account only.

Required:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

Recommended Apache topology defaults:

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

`VAULT_ALLOW_PUBLIC_BIND` should be omitted for an Apache deployment.

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

## Apache HTTP Server

Reference configuration:

```text
deploy/apache/vault.conf.example
```

The reference vhost uses `mod_ssl`, `mod_proxy`, `mod_proxy_http`, `mod_headers`, `mod_setenvif`, and `mod_unique_id`.

On Debian/Ubuntu, enable the modules and create the intentionally empty fallback document root:

```bash
sudo a2enmod ssl proxy proxy_http headers setenvif unique_id
sudo install -d -o root -g root -m 0755 /var/www/vault-empty
```

Copy the vhost, replace every `vault.example.com` occurrence and certificate path, then validate before enabling/reloading:

```bash
sudo cp deploy/apache/vault.conf.example /etc/apache2/sites-available/vault.conf
sudo apachectl configtest
sudo a2ensite vault.conf
sudo systemctl reload apache2
```

For RHEL-family systems, place the equivalent vhost under the distribution's `httpd` configuration directory and use its normal module/service management commands.

The reference config:

- terminates TLS at Apache;
- redirects HTTP to a fixed configured canonical hostname rather than reflecting the incoming Host header;
- keeps `ProxyRequests Off` so the server is not a forward proxy;
- proxies only `/v1/` and health endpoints to `127.0.0.1:3100`;
- explicitly preserves the caller Authorization header without logging it;
- replaces caller-controlled `X-Request-ID` with `mod_unique_id`'s `UNIQUE_ID` before proxying;
- sets `X-Forwarded-Proto: https` at the trusted proxy boundary;
- leaves Host preservation disabled because the Node runtime does not require the public Host value;
- limits request bodies to 1 MiB and bounds request-header size/count;
- bounds proxy connect/read handling with per-route timeouts;
- uses an intentionally empty document root for non-proxied paths;
- disables directory indexes and `.htaccess` overrides for that empty root.

Do not expose port `3100` through the host firewall when Apache is the intended public entrypoint.

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

Authenticated POST requests must use `Content-Type: application/json` and stay within the configured body limit.

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
5. `apachectl configtest` returns `Syntax OK` before reload.
6. HTTP redirects to the intended fixed production hostname.
7. HTTPS health through Apache succeeds.
8. a caller-supplied `X-Request-ID` is replaced by a different Apache-generated correlation ID.
9. anonymous `/v1/*` returns 401.
10. non-JSON authenticated POST returns 415.
11. owner/editor/viewer RLS behavior matches the database contract.
12. Apache and Node logs contain the same trusted request correlation ID but no Authorization/token/key/body values.
13. Supabase outage returns a bounded 503 rather than creating a second canonical store.
14. SIGTERM stops the Node service cleanly through systemd.
15. non-proxied paths do not serve repository/application files.

## Organization-owned controls

This deployment reference does not manage:

- DNS
- certificate issuance/renewal policy
- host firewall policy
- OS patching
- Apache package/module lifecycle
- production secrets distribution
- log retention/aggregation
- monitoring/alerting
- backup/restore
- repository rulesets
- Supabase administrator settings

Those remain deployment/organization responsibilities.
