import { describe, expect, it } from 'vitest';

import type { MeasurementRunRecord } from '../contracts/measurement.js';
import { MeasurementStoreError } from '../ports/measurement-store.js';
import {
  createSupabaseRpcMeasurementStore,
  type SupabaseMeasurementRpcClient,
} from './supabase-rpc-measurement-store.js';

const RUN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VAULT_ID = '99999999-9999-4999-8999-999999999999';

const run: MeasurementRunRecord = {
  id: RUN_ID,
  vaultId: VAULT_ID,
  kind: 'agent',
  name: 'implementation-agent',
  skillIds: ['test-driven-development'],
  status: 'completed',
  startedAt: '2026-09-04T12:00:00.000Z',
  finishedAt: '2026-09-04T12:00:01.000Z',
  durationMs: 1000,
  inputTokens: 10,
  outputTokens: 5,
  costMicrousd: 42,
};

function row(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: RUN_ID,
    vault_id: VAULT_ID,
    parent_run_id: null,
    kind: 'agent',
    name: 'implementation-agent',
    task_type: null,
    provider: null,
    model: null,
    prompt_ref: null,
    skill_ids: ['test-driven-development'],
    status: 'completed',
    started_at: '2026-09-04T12:00:00+00:00',
    finished_at: '2026-09-04T12:00:01+00:00',
    duration_ms: '1000',
    input_tokens: '10',
    output_tokens: '5',
    cost_microusd: '42',
    correction_count: null,
    human_intervention: null,
    ...overrides,
  };
}

function clientWith(
  handler: (name: string, args: Readonly<Record<string, unknown>>) => unknown,
): SupabaseMeasurementRpcClient {
  return {
    async rpc<T>(name: string, args: Readonly<Record<string, unknown>>) {
      return {
        data: handler(name, args) as T,
        error: null,
      };
    },
  };
}

function failingClient(message: string, code = 'P0001'): SupabaseMeasurementRpcClient {
  return {
    async rpc<T>() {
      return {
        data: null as T | null,
        error: { message, code },
      };
    },
  };
}

describe('Supabase RPC measurement adapter', () => {
  it('maps a terminal run to the semantic RPC and provider-free record', async () => {
    const client = clientWith((name, args) => {
      expect(name).toBe('record_measurement_run');
      expect(args).toMatchObject({
        p_run_id: RUN_ID,
        p_vault_id: VAULT_ID,
        p_duration_ms: 1000,
        p_cost_microusd: 42,
      });
      return [row()];
    });

    const store = createSupabaseRpcMeasurementStore(client);
    await expect(store.record(run)).resolves.toEqual(run);
  });

  it('maps divergent replay to a semantic measurement conflict', async () => {
    const store = createSupabaseRpcMeasurementStore(failingClient('measurement_conflict'));

    const failure = store.record(run);
    await expect(failure).rejects.toBeInstanceOf(MeasurementStoreError);
    await expect(failure).rejects.toMatchObject({
      code: 'measurement_conflict',
      retryable: false,
    });
  });

  it('rejects provider rows whose derived duration is inconsistent', async () => {
    const client = clientWith(() => [row({ duration_ms: 999 })]);
    const store = createSupabaseRpcMeasurementStore(client);

    const failure = store.record(run);
    await expect(failure).rejects.toBeInstanceOf(MeasurementStoreError);
    await expect(failure).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
