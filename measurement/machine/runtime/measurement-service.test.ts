import { describe, expect, it, vi } from 'vitest';

import type { MeasurementRunRecord } from '../contracts/measurement.js';
import {
  MeasurementStoreError,
  type MeasurementStore,
} from '../ports/measurement-store.js';
import { createMeasurementService } from './measurement-service.js';

const RUN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VAULT_ID = '99999999-9999-4999-8999-999999999999';

function command() {
  return {
    id: RUN_ID,
    vaultId: VAULT_ID,
    kind: 'agent' as const,
    name: 'implementation-agent',
    status: 'completed' as const,
    startedAt: '2026-09-04T12:00:00Z',
    finishedAt: '2026-09-04T12:00:01Z',
    inputTokens: 10,
    outputTokens: 5,
  };
}

describe('measurement service', () => {
  it('records a normalized terminal run', async () => {
    const record = vi.fn(async (run: MeasurementRunRecord) => run);
    const service = createMeasurementService({ record });

    await expect(service.record(command())).resolves.toMatchObject({
      status: 'recorded',
      record: { id: RUN_ID, durationMs: 1000 },
    });
    expect(record).toHaveBeenCalledOnce();
  });

  it('returns validation failure without invoking storage', async () => {
    const record = vi.fn(async (run: MeasurementRunRecord) => run);
    const service = createMeasurementService({ record });

    await expect(service.record({ ...command(), inputTokens: -1 })).resolves.toEqual({
      status: 'not_recorded',
      code: 'invalid_measurement',
      retryable: false,
      field: 'inputTokens',
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('does not promote telemetry outage into a thrown subject failure', async () => {
    const store: MeasurementStore = {
      async record() {
        throw new MeasurementStoreError('unavailable', 'synthetic outage', { retryable: true });
      },
    };
    const service = createMeasurementService(store);

    await expect(service.record(command())).resolves.toEqual({
      status: 'not_recorded',
      code: 'unavailable',
      retryable: true,
    });
  });

  it('fails measurement closed when provider result does not match the planned run', async () => {
    const store: MeasurementStore = {
      async record(run) {
        return { ...run, durationMs: run.durationMs + 1 };
      },
    };
    const service = createMeasurementService(store);

    await expect(service.record(command())).resolves.toEqual({
      status: 'not_recorded',
      code: 'invalid_response',
      retryable: false,
    });
  });
});
