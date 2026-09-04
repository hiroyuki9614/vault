## Summary

Describe the change and the capability/responsibility it affects.

## Verification

- [ ] `npm run check` passes, including production build
- [ ] Architecture workflow passes, including built-runtime startup/shutdown smoke
- [ ] Database contract workflow passes when migrations/RLS/RPC behavior can be affected
- [ ] CodeQL passes when applicable
- [ ] OSV dependency vulnerability scan passes
- [ ] GitHub Dependency Review passes when Dependency Graph is enabled and the repository requires it
- [ ] Mutation/RLS changes include relevant tests or acceptance evidence
- [ ] Nginx/systemd/runtime changes include deployment-boundary verification when applicable
- [ ] No secrets, private data, or provider credentials are committed

## Boundary check

- [ ] Public contracts remain provider-free
- [ ] Functional core remains effect-free
- [ ] Supabase remains the only canonical mutable data backend
- [ ] Normal runtime does not introduce a service-role credential dependency
- [ ] Nginx deployments keep the Node listener loopback-only unless explicitly justified
- [ ] No new generic control plane / orchestrator was introduced without a capability-specific need

## Deployment / migration impact

State migration order, compatibility impact, rollout/rollback considerations, or `none`.
