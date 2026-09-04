# Docker Apache staging deployment

## Purpose

This profile runs the public Vault reference runtime as a small staging/reference instance without exposing the Node process directly on the host.

```text
host 127.0.0.1:18080
  -> Apache HTTP Server container :8080
  -> dedicated Docker edge network
  -> Node 24 container :3100
  -> Supabase over outbound HTTPS
```

The staging profile is intentionally bound to host loopback. A host-level TLS reverse proxy may later forward a dedicated hostname to `127.0.0.1:18080`; do not publish the Node service port.

The `edge` network is an ordinary bridge rather than a Docker `internal` network because Docker must install the loopback host-port binding for Apache. Node remains host-inaccessible because it has no `ports` mapping. Node also joins the `egress` network for Supabase.

## Images

The checked-in Dockerfiles pin both release tags and immutable digests:

- `node:24.20.0-alpine3.24@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf`
- `httpd:2.4.68-alpine3.24@sha256:1b766f17b84026429b7cb243317b142921b24432336e798bc881c43f45ed9567`

Update them through ordinary dependency review when the runtime baseline changes.

## Required runtime configuration

Provide these values at deployment time; never commit them:

```text
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

The normal runtime must not receive a Supabase service-role key.

For transport-only smoke testing, a synthetic URL/key can start the process and exercise `/health/live` and `/health/ready`. Document operations will not be functional until a real staging Supabase project with the repository migrations is configured.

Optional host port override:

```text
VAULT_STAGING_PORT=18080
```

## Local verification

From the repository root:

```bash
export SUPABASE_URL=https://example.supabase.co
export SUPABASE_ANON_KEY=synthetic-staging-key
export VAULT_STAGING_PORT=18080

docker compose -f deploy/docker/compose.staging.yml config --quiet
docker compose -f deploy/docker/compose.staging.yml build
docker compose -f deploy/docker/compose.staging.yml up -d
curl --fail http://127.0.0.1:18080/health/live
curl --fail http://127.0.0.1:18080/health/ready
docker compose -f deploy/docker/compose.staging.yml down --remove-orphans
```

## Security boundary

- Apache is the only service with a host port mapping.
- The host mapping is loopback-only by default.
- Node binds `0.0.0.0` only inside its container and only because `VAULT_ALLOW_PUBLIC_BIND=true` is explicitly set by this compose profile.
- Node has no published host port.
- Apache and Node share a dedicated edge bridge; Node additionally joins the egress bridge needed for Supabase.
- Containers run with read-only root filesystems, bounded memory/PID settings, and `no-new-privileges`.
- Caller `X-Request-ID` is replaced at the Apache boundary.
- Authorization is forwarded to Node so Supabase Auth/RLS remains authoritative.
- Do not store company/customer/private data in the public reference staging instance.

## VPS acceptance

A staging deployment is considered transport-ready only after read-back proves:

1. both containers are running;
2. Node is healthy;
3. Apache `/health/live` and `/health/ready` return 200 through the host loopback port;
4. Node port 3100 is not published on the host;
5. an attacker-supplied `X-Request-ID` is replaced by Apache;
6. anonymous `/v1/*` remains rejected by the Node capability boundary;
7. current disk/memory headroom remains within the operator's accepted bounds.

A real Supabase staging project adds a separate data-plane acceptance gate for migrations, JWT propagation, RLS, CRUD, conflict handling, and same-ID read-back.
