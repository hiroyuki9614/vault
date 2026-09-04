import type {
  MeasurementRunRecord,
  RecordMeasurementRunCommand,
} from '../contracts/measurement.js';
import { MeasurementValidationError } from '../contracts/measurement.js';
import { measurementRunMatches, planMeasurementRun } from '../core/measurement-policy.js';
import {
  MeasurementStoreError,
  type MeasurementStore,
  type MeasurementStoreErrorCode,
} from '../ports/measurement-store.js';

export type MeasurementNotRecordedCode = MeasurementStoreErrorCode | 'invalid_measurement';

export type MeasurementRecordResult =
  | {
      readonly status: 'recorded';
      readonly record: MeasurementRunRecord;
    }
  | {
      readonly status: 'not_recorded';
      readonly code: MeasurementNotRecordedCode;
      readonly retryable: boolean;
      readonly field?: string;
    };

export interface MeasurementService {
  /** Best-effort by contract: measurement failure is returned, never promoted to subject failure. */
  record(command: RecordMeasurementRunCommand): Promise<MeasurementRecordResult>;
}

export function createMeasurementService(store: MeasurementStore): MeasurementService {
  return {
    async record(command) {
      let planned: MeasurementRunRecord;
      try {
        planned = planMeasurementRun(command);
      } catch (error) {
        if (error instanceof MeasurementValidationError) {
          return {
            status: 'not_recorded',
            code: 'invalid_measurement',
            retryable: false,
            field: error.field,
          };
        }
        return { status: 'not_recorded', code: 'unknown', retryable: false };
      }

      try {
        const recorded = await store.record(planned);
        if (!measurementRunMatches(planned, recorded)) {
          return { status: 'not_recorded', code: 'invalid_response', retryable: false };
        }
        return { status: 'recorded', record: recorded };
      } catch (error) {
        if (error instanceof MeasurementStoreError) {
          return {
            status: 'not_recorded',
            code: error.code,
            retryable: error.retryable,
          };
        }
        return { status: 'not_recorded', code: 'unknown', retryable: false };
      }
    },
  };
}
