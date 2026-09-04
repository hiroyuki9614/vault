import type {
  MeasurementRunKind,
  MeasurementRunRecord,
  MeasurementRunStatus,
  RecordMeasurementRunCommand,
} from '../contracts/measurement.js';
import { MeasurementValidationError } from '../contracts/measurement.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const RUN_KINDS = new Set<MeasurementRunKind>(['agent', 'skill', 'task']);
const RUN_STATUSES = new Set<MeasurementRunStatus>(['completed', 'failed', 'blocked', 'cancelled']);

function assertUuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) {
    throw new MeasurementValidationError('invalid_uuid', field, `${field} must be a UUID`);
  }
  return value;
}

function requiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized === '' || normalized.length > maxLength) {
    throw new MeasurementValidationError(
      'invalid_name',
      field,
      `${field} must contain 1-${maxLength} characters`,
    );
  }
  return normalized;
}

function optionalText(value: string | undefined, field: string, maxLength: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized === '' || normalized.length > maxLength) {
    throw new MeasurementValidationError(
      'invalid_reference',
      field,
      `${field} must contain 1-${maxLength} characters when present`,
    );
  }
  return normalized;
}

function normalizeTimestamp(value: string, field: string): { readonly value: string; readonly milliseconds: number } {
  if (!RFC3339_RE.test(value)) {
    throw new MeasurementValidationError('invalid_timestamp', field, `${field} must be RFC3339`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new MeasurementValidationError('invalid_timestamp', field, `${field} must be a valid timestamp`);
  }
  return { value: new Date(milliseconds).toISOString(), milliseconds };
}

function optionalMetric(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MeasurementValidationError(
      'invalid_metric',
      field,
      `${field} must be a non-negative safe integer`,
    );
  }
  return value;
}

function normalizeSkillIds(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return [];
  if (values.length > 32) {
    throw new MeasurementValidationError('invalid_reference', 'skillIds', 'skillIds must not exceed 32 entries');
  }
  const normalized = values.map((value, index) => requiredText(value, `skillIds[${index}]`, 120));
  return [...new Set(normalized)];
}

function assertKind(value: MeasurementRunKind): MeasurementRunKind {
  if (!RUN_KINDS.has(value)) {
    throw new MeasurementValidationError('invalid_kind', 'kind', 'kind is unsupported');
  }
  return value;
}

function assertStatus(value: MeasurementRunStatus): MeasurementRunStatus {
  if (!RUN_STATUSES.has(value)) {
    throw new MeasurementValidationError('invalid_status', 'status', 'status is unsupported');
  }
  return value;
}

export function planMeasurementRun(command: RecordMeasurementRunCommand): MeasurementRunRecord {
  const id = assertUuid(command.id, 'id');
  const vaultId = assertUuid(command.vaultId, 'vaultId');
  const parentRunId = command.parentRunId === undefined
    ? undefined
    : assertUuid(command.parentRunId, 'parentRunId');
  if (parentRunId === id) {
    throw new MeasurementValidationError(
      'invalid_reference',
      'parentRunId',
      'parentRunId must differ from id',
    );
  }

  const startedAt = normalizeTimestamp(command.startedAt, 'startedAt');
  const finishedAt = normalizeTimestamp(command.finishedAt, 'finishedAt');
  const durationMs = finishedAt.milliseconds - startedAt.milliseconds;
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new MeasurementValidationError(
      'invalid_duration',
      'finishedAt',
      'finishedAt must not be earlier than startedAt',
    );
  }

  const taskType = optionalText(command.taskType, 'taskType', 120);
  const provider = optionalText(command.provider, 'provider', 120);
  const model = optionalText(command.model, 'model', 200);
  const promptRef = optionalText(command.promptRef, 'promptRef', 256);
  const inputTokens = optionalMetric(command.inputTokens, 'inputTokens');
  const outputTokens = optionalMetric(command.outputTokens, 'outputTokens');
  const costMicrousd = optionalMetric(command.costMicrousd, 'costMicrousd');
  const correctionCount = optionalMetric(command.correctionCount, 'correctionCount');

  return {
    id,
    vaultId,
    ...(parentRunId === undefined ? {} : { parentRunId }),
    kind: assertKind(command.kind),
    name: requiredText(command.name, 'name', 120),
    ...(taskType === undefined ? {} : { taskType }),
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    ...(promptRef === undefined ? {} : { promptRef }),
    skillIds: normalizeSkillIds(command.skillIds),
    status: assertStatus(command.status),
    startedAt: startedAt.value,
    finishedAt: finishedAt.value,
    durationMs,
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(costMicrousd === undefined ? {} : { costMicrousd }),
    ...(correctionCount === undefined ? {} : { correctionCount }),
    ...(command.humanIntervention === undefined ? {} : { humanIntervention: command.humanIntervention }),
  };
}

export function measurementRunMatches(
  expected: MeasurementRunRecord,
  actual: MeasurementRunRecord,
): boolean {
  return (
    expected.id === actual.id &&
    expected.vaultId === actual.vaultId &&
    expected.parentRunId === actual.parentRunId &&
    expected.kind === actual.kind &&
    expected.name === actual.name &&
    expected.taskType === actual.taskType &&
    expected.provider === actual.provider &&
    expected.model === actual.model &&
    expected.promptRef === actual.promptRef &&
    expected.skillIds.length === actual.skillIds.length &&
    expected.skillIds.every((skillId, index) => skillId === actual.skillIds[index]) &&
    expected.status === actual.status &&
    expected.startedAt === actual.startedAt &&
    expected.finishedAt === actual.finishedAt &&
    expected.durationMs === actual.durationMs &&
    expected.inputTokens === actual.inputTokens &&
    expected.outputTokens === actual.outputTokens &&
    expected.costMicrousd === actual.costMicrousd &&
    expected.correctionCount === actual.correctionCount &&
    expected.humanIntervention === actual.humanIntervention
  );
}
