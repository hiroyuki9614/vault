import type {
  MeasurementRunRecord,
  RecordMeasurementRunCommand,
} from '../contracts/measurement.js';

export function planMeasurementRun(
  _command: RecordMeasurementRunCommand,
): MeasurementRunRecord {
  throw new Error('measurement capability not implemented');
}
