# Measurement Capability

## Purpose

Measurement is optional observability for Agent, Skill, and task executions. It is deliberately not part of Document or Skill success semantics.

```text
caller / composition root
  +-> subject operation
  +-> optional Measurement.record(...)
```

A Measurement outage returns `not_recorded`; it must not turn an otherwise successful subject operation into failure.

## Public contract

The stable provider-free entrypoint is `measurement/public.ts`.

A record is one immutable terminal run snapshot:

```text
id                  stable run UUID
vaultId             tenant boundary
parentRunId?        optional parent/subagent lineage
kind                agent | skill | task
name                semantic run/role/skill name
taskType?           reusable task classification
provider? / model?  model execution identity when known
promptRef?          stable prompt/version reference only
skillIds[]          Skills materially used by the run
status              completed | failed | blocked | cancelled
startedAt/finishedAt caller-supplied RFC3339 timestamps
durationMs          derived by the pure core
input/output tokens optional aggregate counters
costMicrousd        optional integer micro-USD cost
correctionCount     optional correction/rework count
humanIntervention   optional coarse human-intervention signal
```

The public schema intentionally does not contain raw prompt text, user input, model output, document content, customer identity, employee identity, or company-specific KPI fields.

## Functional boundary

```text
RecordMeasurementRunCommand
  -> pure planMeasurementRun()
  -> MeasurementStore Port
  -> Supabase RPC Adapter
  -> record_measurement_run
  -> measurement_runs
```

The pure core validates identity, bounded semantic labels, RFC3339 timestamps, parent/self relationship, metrics, and derives duration without reading a clock.

## Best-effort runtime

`MeasurementService.record()` returns:

```text
recorded
not_recorded
```

`not_recorded` carries a semantic code such as `invalid_measurement`, `unavailable`, `permission_denied`, or `measurement_conflict`. Provider error objects/messages are not the public contract.

The caller decides whether to retry telemetry. No retry timer/backoff is owned by the pure core or Measurement service.

## Persistence and replay

`measurement_runs` is immutable terminal telemetry in Supabase PostgreSQL.

- owner/editor may record;
- any vault member may read under RLS;
- anon and non-members cannot access another vault's telemetry;
- normal runtime uses caller identity, not service-role credentials;
- exact replay of the same run ID and state returns the existing row;
- the same run ID with different state raises `measurement_conflict`;
- update/delete are not granted to normal authenticated callers.

Measurement is telemetry, not business-state canonical completion, so it does not require the extra same-ID read-back round trip used by Document mutation completion.

## Privacy boundary

Do not put raw work content into Measurement merely because it is useful for debugging.

Prefer stable references and aggregates:

```text
promptRef     instead of prompt body
taskType      instead of customer/job description
model         instead of provider response object
token counts  instead of model output
```

Company-specific metrics belong in the private consumer/integration layer. In particular, employee scoring or surveillance policy is not a Public Vault responsibility.

## Future agent orchestration

`parentRunId` makes parent/child and future parallel-subagent runs measurable, but Measurement does not create, schedule, route, or supervise agents. Agent orchestration remains a separate capability/product boundary.
