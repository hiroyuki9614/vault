import { describe, expect, it } from 'vitest';

import type { RecordMeasurementRunCommand } from '../contracts/measurement.js';
import { planMeasurementRun } from './measurement-policy.js';

const RUN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const VAULT_ID = '99999999-9999-4999-8999-999999999999';

describe('skill measurement status compatibility', () => {
  it('preserves not_applicable as a first-class terminal skill outcome', () => {
    const command = {
      id: RUN_ID,
      vaultId: VAULT_ID,
      kind: 'skill',
      name: 'requirements-guard@1.0.0',
      skillIds: ['requirements-guard'],
      status: 'not_applicable',
      startedAt: '2026-09-04T13:10:00Z',
      finishedAt: '2026-09-04T13:10:00Z',
    } as unknown as RecordMeasurementRunCommand;

    expect(planMeasurementRun(command)).toMatchObject({
      kind: 'skill',
      name: 'requirements-guard@1.0.0',
      status: 'not_applicable',
      skillIds: ['requirements-guard'],
    });
  });
});
