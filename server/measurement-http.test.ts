import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { VaultServerConfig } from './config.js';
import { createVaultHttpServer } from './http-app.js';

const config: VaultServerConfig = {
  host: '127.0.0.1',
  port: 3100,
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-key',
  upstreamTimeoutMs: 1000,
  requestTimeoutMs: 5000,
  headersTimeoutMs: 4000,
  keepAliveTimeoutMs: 1000,
  shutdownTimeoutMs: 1000,
  maxBodyBytes: 4096,
};

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start(fetchFn: typeof fetch): Promise<string> {
  const server = createVaultHttpServer(config, { fetchFn });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function measurementBody() {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    vaultId: '11111111-1111-4111-8111-111111111111',
    kind: 'agent',
    name: 'implementation-agent',
    provider: 'synthetic-provider',
    model: 'synthetic/model',
    promptRef: 'prompts/implementer-v1',
    skillIds: ['test-driven-development'],
    status: 'completed',
    startedAt: '2026-09-04T21:00:00+09:00',
    finishedAt: '2026-09-04T21:00:01+09:00',
    inputTokens: 10,
    outputTokens: 5,
    costMicrousd: 42,
  };
}

describe('Vault measurement HTTP endpoint', () => {
  it('records privacy-minimized terminal telemetry through the named semantic RPC', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify([{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        vault_id: '11111111-1111-4111-8111-111111111111',
        parent_run_id: null,
        kind: 'agent',
        name: 'implementation-agent',
        task_type: null,
        provider: 'synthetic-provider',
        model: 'synthetic/model',
        prompt_ref: 'prompts/implementer-v1',
        skill_ids: ['test-driven-development'],
        status: 'completed',
        started_at: '2026-09-04T12:00:00+00:00',
        finished_at: '2026-09-04T12:00:01+00:00',
        duration_ms: 1000,
        input_tokens: 10,
        output_tokens: 5,
        cost_microusd: 42,
        correction_count: null,
        human_intervention: null,
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const baseUrl = await start(fetchFn);
    const response = await fetch(`${baseUrl}/v1/measurements/record`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify(measurementBody()),
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://example.supabase.co/rest/v1/rpc/record_measurement_run');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      p_run_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_started_at: '2026-09-04T12:00:00.000Z',
      p_finished_at: '2026-09-04T12:00:01.000Z',
      p_duration_ms: 1000,
      p_cost_microusd: 42,
    });
    expect(await response.json()).toMatchObject({
      measurement: {
        status: 'recorded',
        record: {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          durationMs: 1000,
        },
      },
    });
  });

  it('rejects invalid metrics before making an upstream measurement call', async () => {
    let upstreamCalls = 0;
    const fetchFn: typeof fetch = async () => {
      upstreamCalls += 1;
      throw new Error('unexpected upstream call');
    };

    const baseUrl = await start(fetchFn);
    const response = await fetch(`${baseUrl}/v1/measurements/record`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...measurementBody(), inputTokens: -1 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_measurement' });
    expect(upstreamCalls).toBe(0);
  });
});
