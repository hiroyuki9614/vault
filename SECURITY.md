# Security Policy

## Scope

This repository is a public reference runtime and contract set. Security-sensitive behavior includes:

- Supabase Auth / RLS boundaries
- semantic RPC definitions
- document authorization and optimistic concurrency
- secret handling guidance
- TypeScript provider / core separation
- dependency and CI configuration

## Supported version

Security fixes are applied to the current `main` branch. Historical commits and copied forks are not maintained by this repository.

## Reporting a vulnerability

Prefer GitHub private vulnerability reporting / Security Advisories for this repository when that UI is available.

Do not put credentials, access tokens, service-role keys, private user data, exploit payloads containing real secrets, or other sensitive evidence in a public issue or pull request.

If private vulnerability reporting is not available, open a minimal public issue that contains only a non-sensitive request for a private contact path. Do not include the vulnerability details until a private channel is established.

## Response expectations

This public reference implementation does not provide a contractual security-response SLA. Reports should include, when safe to do so:

- affected commit / version
- affected capability or RPC
- expected security boundary
- observed behavior
- minimal reproduction using synthetic data
- impact assessment

## Security boundaries

The repository must not contain:

- Supabase service-role keys
- database passwords
- API tokens
- private keys
- production user data
- customer or employer confidential data

Runtime credentials must be injected by the deployment environment.

Supabase is the canonical mutable data backend. GitHub is not a write fallback when Supabase is unavailable.

## Deployment responsibility

Production operators remain responsible for environment-specific controls including:

- organization access policy and SSO/MFA
- Supabase project/network configuration
- backup / restore policy
- log retention and monitoring
- secret rotation
- incident response
- data residency / retention requirements
- compliance evidence and certification

See `docs/ENTERPRISE_READINESS.md` for the deployment baseline and non-claims.
