import type { MeasurementRunRecord } from '../contracts/measurement.js';

export type MeasurementStoreErrorCode =
  | 'measurement_conflict'
  | 'permission_denied'
  | 'unauthenticated'
  | 'invalid_request'
  | 'unavailable'
  | 'invalid_response'
  | 'unknown';

export class MeasurementStoreError extends Error {
  readonly code: MeasurementStoreErrorCode;
  readonly retryable: boolean;
  readonly providerCode: string | undefined;

  constructor(
    code: MeasurementStoreErrorCode,
    message: string,
    options: { readonly retryable?: boolean; readonly providerCode?: string } = {},
  ) {
    super(message);
    this.name = 'MeasurementStoreError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.providerCode = options.providerCode;
  }
}

export interface MeasurementStore {
  record(run: MeasurementRunRecord): Promise<MeasurementRunRecord>;
}
