import { describe, expect, it } from 'vitest';

import { MeasurementValidationError } from '../contracts/measurement.js';
import { planMeasurementRun } from './measurement-policy.js';

const RUN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VAULT_ID = '99999999-9999-4999-8999-999999999999';
const PARENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('measurement policy', () => {
  it('normalizes a terminal run and derives duration without reading a clock', () => {
    expect(
      planMeasurementRun({
        id: RUN_ID,
        vaultId: VAULT_ID,
        parentRunId: PARENT_ID,
        kind: 'agent',
        name: '  implementation-agent  ',
        taskType: '  code-change  ',
        provider: '  openrouter  ',
        model: '  example/model  ',
        promptRef: '  prompts/implementer-v1  ',
        skillIds: [' test-driven-development ', 'dependency-boundary'],
        status: 'completed',
        startedAt: '2026-09-04T12:00:00.000Z',
        finishedAt: '2026-09-04T12:00:02.500Z',
        inputTokens: 120,
        outputTokens: 80,
        costMicrousd: 1234,
        correctionCount: 1,
        humanIntervention: false,
      }),
    ).toEqual({
      id: RUN_ID,
      vaultId: VAULT_ID,
      parentRunId: PARENT_ID,
      kind: 'agent',
      name: 'implementation-agent',
      taskType: 'code-change',
      provider: 'openrouter',
      model: 'example/model',
      promptRef: 'prompts/implementer-v1',
      skillIds: ['test-driven-development', 'dependency-boundary'],
      status: 'completed',
      startedAt: '2026-09-04T12:00:00.000Z',
      finishedAt: '2026-09-04T12:00:02.500Z',
      durationMs: 2500,
      inputTokens: 120,
      outputTokens: 80,
      costMicrousd: 1234,
      correctionCount: 1,
      humanIntervention: false,
    });
  });

  it('canonicalizes equivalent RFC3339 timezone representations', () => {
    expect(
      planMeasurementRun({
        id: RUN_ID,
        vaultId: VAULT_ID,
        kind: 'task',
        name: 'timezone-normalization',
        status: 'completed',
        startedAt: '2026-09-04T21:00:00+09:00',
        finishedAt: '2026-09-04T21:00:01+09:00',
      }),
    ).toMatchObject({
      startedAt: '2026-09-04T12:00:00.000Z',
      finishedAt: '2026-09-04T12:00:01.000Z',
      durationMs: 1000,
    });
  });

  it('does not invent optional metrics when they are unavailable', () => {
    expect(
      planMeasurementRun({
        id: RUN_ID,
        vaultId: VAULT_ID,
        kind: 'skill',
        name: 'requirements-guard',
        status: 'blocked',
        startedAt: '2026-09-04T12:00:00Z',
        finishedAt: '2026-09-04T12:00:00Z',
      }),
    ).toEqual({
      id: RUN_ID,
      vaultId: VAULT_ID,
      kind: 'skill',
      name: 'requirements-guard',
      skillIds: [],
      status: 'blocked',
      startedAt: '2026-09-04T12:00:00.000Z',
      finishedAt: '2026-09-04T12:00:00.000Z',
      durationMs: 0,
    });
  });

  it.each([
    ['parentRunId', { parentRunId: RUN_ID }],
    ['finishedAt', { finishedAt: '2026-09-04T11:59:59Z' }],
    ['inputTokens', { inputTokens: -1 }],
    ['costMicrousd', { costMicrousd: 1.5 }],
  ])('rejects invalid %s', (field, override) => {
    expect(() =>
      planMeasurementRun({
        id: RUN_ID,
        vaultId: VAULT_ID,
        kind: 'task',
        name: 'synthetic-task',
        status: 'failed',
        startedAt: '2026-09-04T12:00:00Z',
        finishedAt: '2026-09-04T12:00:01Z',
        ...override,
      }),
    ).toThrowError(MeasurementValidationError);

    try {
      planMeasurementRun({
        id: RUN_ID,
        vaultId: VAULT_ID,
        kind: 'task',
        name: 'synthetic-task',
        status: 'failed',
        startedAt: '2026-09-04T12:00:00Z',
        finishedAt: '2026-09-04T12:00:01Z',
        ...override,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(MeasurementValidationError);
      expect((error as MeasurementValidationError).field).toBe(field);
    }
  });
});
