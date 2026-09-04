## Summary

Describe the change and the capability/responsibility it affects.

## Verification

- [ ] `npm run check` passes
- [ ] Architecture workflow passes
- [ ] CodeQL passes when applicable
- [ ] OSV dependency vulnerability scan passes
- [ ] GitHub Dependency Review passes when Dependency Graph is enabled and the repository requires it
- [ ] Mutation/RLS changes include relevant tests or acceptance evidence
- [ ] No secrets, private data, or provider credentials are committed

## Boundary check

- [ ] Public contracts remain provider-free
- [ ] Functional core remains effect-free
- [ ] Supabase remains the only canonical mutable data backend
- [ ] No new generic control plane / orchestrator was introduced without a capability-specific need

## Deployment / migration impact

State migration order, compatibility impact, rollout/rollback considerations, or `none`.
