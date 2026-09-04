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

async function start(fetchFn?: typeof fetch): Promise<string> {
  const server = createVaultHttpServer(config, fetchFn === undefined ? {} : { fetchFn });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

describe('Vault HTTP server', () => {
  it('serves unauthenticated liveness for Apache/systemd probes', async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/health/live`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('rejects document requests without bearer auth', async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/v1/documents/get-by-id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vaultId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
      }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('requires JSON content type on authenticated API calls', async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/v1/documents/get-by-id`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'text/plain',
      },
      body: '{}',
    });
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({ error: 'unsupported_media_type' });
  });

  it('lets authenticated unknown API routes reach the Node router without calling Supabase', async () => {
    let upstreamCalls = 0;
    const fetchFn: typeof fetch = async () => {
      upstreamCalls += 1;
      throw new Error('unexpected upstream call');
    };
    const baseUrl = await start(fetchFn);
    const response = await fetch(`${baseUrl}/v1/not-a-route`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'application/json',
      },
      body: '{}',
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: 'not_found' });
    expect(upstreamCalls).toBe(0);
  });

  it('forwards bearer identity and anon key only to the named semantic RPC', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify([{
        id: '22222222-2222-4222-8222-222222222222',
        vault_id: '11111111-1111-4111-8111-111111111111',
        path: 'notes/example.md',
        title: 'Example',
        content: 'Body',
        metadata: {},
        version: 1,
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const baseUrl = await start(fetchFn);
    const response = await fetch(`${baseUrl}/v1/documents/get-by-id`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        vaultId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
      }),
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://example.supabase.co/rest/v1/rpc/get_document_by_id');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer user-jwt');
    expect(headers.apikey).toBe('public-key');
  });

  it('maps semantic permission denial to HTTP 403', async () => {
    const fetchFn: typeof fetch = async () => new Response(
      JSON.stringify({ message: 'permission_denied', code: 'P0001' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
    const baseUrl = await start(fetchFn);
    const response = await fetch(`${baseUrl}/v1/documents/get-by-id`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        vaultId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
      }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'permission_denied', retryable: false });
  });

  it('maps upstream availability failure to bounded HTTP 503', async () => {
    const fetchFn: typeof fetch = async () => new Response(
      JSON.stringify({ message: 'temporary upstream failure' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
    const baseUrl = await start(fetchFn);
    const response = await fetch(`${baseUrl}/v1/documents/get-by-id`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        vaultId: '11111111-1111-4111-8111-111111111111',
        documentId: '22222222-2222-4222-8222-222222222222',
      }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'unavailable', retryable: true });
  });

  it('enforces the configured request body limit', async () => {
    const baseUrl = await start();
    const response = await fetch(`${baseUrl}/v1/documents/get-by-id`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer user-jwt',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ payload: 'x'.repeat(5000) }),
    });
    expect(response.status).toBe(413);
  });
});
