export type MeasurementRunKind = 'agent' | 'skill' | 'task';
export type MeasurementRunStatus = 'completed' | 'failed' | 'blocked' | 'cancelled';

export type MeasurementValidationErrorCode =
  | 'invalid_uuid'
  | 'invalid_kind'
  | 'invalid_status'
  | 'invalid_name'
  | 'invalid_reference'
  | 'invalid_timestamp'
  | 'invalid_duration'
  | 'invalid_metric';

export class MeasurementValidationError extends Error {
  readonly code: MeasurementValidationErrorCode;
  readonly field: string;

  constructor(code: MeasurementValidationErrorCode, field: string, message: string) {
    super(message);
    this.name = 'MeasurementValidationError';
    this.code = code;
    this.field = field;
  }
}

export interface RecordMeasurementRunCommand {
  readonly id: string;
  readonly vaultId: string;
  readonly parentRunId?: string;
  readonly kind: MeasurementRunKind;
  readonly name: string;
  readonly taskType?: string;
  readonly provider?: string;
  readonly model?: string;
  /** Stable prompt/version reference only. Raw prompt content is intentionally excluded. */
  readonly promptRef?: string;
  readonly skillIds?: readonly string[];
  readonly status: MeasurementRunStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  /** Integer micro-USD avoids floating-point currency ambiguity. */
  readonly costMicrousd?: number;
  readonly correctionCount?: number;
  readonly humanIntervention?: boolean;
}

export interface MeasurementRunRecord {
  readonly id: string;
  readonly vaultId: string;
  readonly parentRunId?: string;
  readonly kind: MeasurementRunKind;
  readonly name: string;
  readonly taskType?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly promptRef?: string;
  readonly skillIds: readonly string[];
  readonly status: MeasurementRunStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costMicrousd?: number;
  readonly correctionCount?: number;
  readonly humanIntervention?: boolean;
}
