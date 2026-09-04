import type {
  MeasurementRunKind,
  MeasurementRunRecord,
  MeasurementRunStatus,
  RecordMeasurementRunCommand,
} from '../contracts/measurement.js';
import { planMeasurementRun } from '../core/measurement-policy.js';
import {
  MeasurementStoreError,
  type MeasurementStore,
  type MeasurementStoreErrorCode,
} from '../ports/measurement-store.js';

interface RpcErrorLike {
  readonly message: string;
  readonly code?: string;
}

interface RpcResult<T> {
  readonly data: T | null;
  readonly error: RpcErrorLike | null;
}

export interface SupabaseMeasurementRpcClient {
  rpc<T = unknown>(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<RpcResult<T>>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETRYABLE_PROVIDER_CODES = new Set(['08000', '08003', '08006', '53300', '57014', '57P01', 'PGRST003']);
const RUN_KINDS = new Set<MeasurementRunKind>(['agent', 'skill', 'task']);
const RUN_STATUSES = new Set<MeasurementRunStatus>(['completed', 'failed', 'blocked', 'cancelled']);

function failInvalidResponse(message: string): never {
  throw new MeasurementStoreError('invalid_response', message);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return failInvalidResponse(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') return failInvalidResponse(`${key} must be a string`);
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') return failInvalidResponse(`${key} must be a string or null`);
  return value;
}

function requiredUuid(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!UUID_RE.test(value)) return failInvalidResponse(`${key} must be a UUID`);
  return value;
}

function optionalUuid(record: Record<string, unknown>, key: string): string | undefined {
  const value = optionalString(record, key);
  if (value === undefined) return undefined;
  if (!UUID_RE.test(value)) return failInvalidResponse(`${key} must be a UUID or null`);
  return value;
}

function optionalInteger(record: Record<string, unknown>, key: string): number | undefined {
  const raw = record[key];
  if (raw === null || raw === undefined) return undefined;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return failInvalidResponse(`${key} must be a non-negative safe integer or null`);
  }
  return value;
}

function requiredInteger(record: Record<string, unknown>, key: string): number {
  const value = optionalInteger(record, key);
  if (value === undefined) return failInvalidResponse(`${key} must be a non-negative safe integer`);
  return value;
}

function requiredKind(record: Record<string, unknown>): MeasurementRunKind {
  const value = requiredString(record, 'kind') as MeasurementRunKind;
  if (!RUN_KINDS.has(value)) return failInvalidResponse('kind is unsupported');
  return value;
}

function requiredStatus(record: Record<string, unknown>): MeasurementRunStatus {
  const value = requiredString(record, 'status') as MeasurementRunStatus;
  if (!RUN_STATUSES.has(value)) return failInvalidResponse('status is unsupported');
  return value;
}

function requiredSkillIds(record: Record<string, unknown>): readonly string[] {
  const value = record.skill_ids;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    return failInvalidResponse('skill_ids must be a string array');
  }
  return value as string[];
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'boolean') return failInvalidResponse(`${key} must be boolean or null`);
  return value;
}

function firstRow(value: unknown): unknown | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toRun(value: unknown): MeasurementRunRecord {
  const row = assertRecord(value, 'measurement row');
  const parentRunId = optionalUuid(row, 'parent_run_id');
  const taskType = optionalString(row, 'task_type');
  const provider = optionalString(row, 'provider');
  const model = optionalString(row, 'model');
  const promptRef = optionalString(row, 'prompt_ref');
  const inputTokens = optionalInteger(row, 'input_tokens');
  const outputTokens = optionalInteger(row, 'output_tokens');
  const costMicrousd = optionalInteger(row, 'cost_microusd');
  const correctionCount = optionalInteger(row, 'correction_count');
  const humanIntervention = optionalBoolean(row, 'human_intervention');

  const command: RecordMeasurementRunCommand = {
    id: requiredUuid(row, 'id'),
    vaultId: requiredUuid(row, 'vault_id'),
    ...(parentRunId === undefined ? {} : { parentRunId }),
    kind: requiredKind(row),
    name: requiredString(row, 'name'),
    ...(taskType === undefined ? {} : { taskType }),
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    ...(promptRef === undefined ? {} : { promptRef }),
    skillIds: requiredSkillIds(row),
    status: requiredStatus(row),
    startedAt: requiredString(row, 'started_at'),
    finishedAt: requiredString(row, 'finished_at'),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(costMicrousd === undefined ? {} : { costMicrousd }),
    ...(correctionCount === undefined ? {} : { correctionCount }),
    ...(humanIntervention === undefined ? {} : { humanIntervention }),
  };

  const planned = planMeasurementRun(command);
  if (requiredInteger(row, 'duration_ms') !== planned.durationMs) {
    return failInvalidResponse('duration_ms does not match timestamps');
  }
  return planned;
}

function semanticRpcError(error: RpcErrorLike): MeasurementStoreError {
  const message = error.message.toLowerCase();
  const providerCode = error.code;
  let code: MeasurementStoreErrorCode = 'unknown';
  let retryable = false;

  if (message.includes('measurement_conflict')) {
    code = 'measurement_conflict';
  } else if (
    providerCode === '42501' ||
    message.includes('permission_denied') ||
    message.includes('permission denied')
  ) {
    code = 'permission_denied';
  } else if (
    providerCode === 'PGRST301' ||
    message.includes('jwt') ||
    message.includes('not authenticated')
  ) {
    code = 'unauthenticated';
  } else if (
    providerCode === '23514' ||
    providerCode === '22P02' ||
    message.includes('invalid_measurement_request')
  ) {
    code = 'invalid_request';
  } else if (providerCode !== undefined && RETRYABLE_PROVIDER_CODES.has(providerCode)) {
    code = 'unavailable';
    retryable = true;
  }

  return new MeasurementStoreError(code, `measurement store operation failed: ${code}`, {
    retryable,
    ...(providerCode === undefined ? {} : { providerCode }),
  });
}

export function createSupabaseRpcMeasurementStore(
  client: SupabaseMeasurementRpcClient,
): MeasurementStore {
  return {
    async record(run) {
      const result = await client.rpc<unknown>('record_measurement_run', {
        p_run_id: run.id,
        p_vault_id: run.vaultId,
        p_parent_run_id: run.parentRunId ?? null,
        p_kind: run.kind,
        p_name: run.name,
        p_task_type: run.taskType ?? null,
        p_provider: run.provider ?? null,
        p_model: run.model ?? null,
        p_prompt_ref: run.promptRef ?? null,
        p_skill_ids: run.skillIds,
        p_status: run.status,
        p_started_at: run.startedAt,
        p_finished_at: run.finishedAt,
        p_duration_ms: run.durationMs,
        p_input_tokens: run.inputTokens ?? null,
        p_output_tokens: run.outputTokens ?? null,
        p_cost_microusd: run.costMicrousd ?? null,
        p_correction_count: run.correctionCount ?? null,
        p_human_intervention: run.humanIntervention ?? null,
      });

      if (result.error !== null) throw semanticRpcError(result.error);
      const row = firstRow(result.data);
      if (row === null) return failInvalidResponse('record_measurement_run returned no row');
      return toRun(row);
    },
  };
}
