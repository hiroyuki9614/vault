import type { SupabaseRpcClient } from '../documents/machine/adapters/supabase-rpc-document-store.js';

export interface SupabaseHttpRpcClientConfig {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  readonly accessToken: string;
  readonly timeoutMs: number;
  readonly fetchFn?: typeof fetch;
}

function providerCodeForStatus(status: number): string | undefined {
  if (status === 401) return 'PGRST301';
  if (status === 403) return '42501';
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return '08006';
  }
  return undefined;
}

function asProviderError(value: unknown, status: number): { readonly message: string; readonly code?: string } {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Readonly<Record<string, unknown>>;
    const message = typeof record.message === 'string' ? record.message : `supabase_http_${status}`;
    const code = typeof record.code === 'string' ? record.code : providerCodeForStatus(status);
    return code === undefined ? { message } : { message, code };
  }
  const code = providerCodeForStatus(status);
  return code === undefined ? { message: `supabase_http_${status}` } : { message: `supabase_http_${status}`, code };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createSupabaseHttpRpcClient(config: SupabaseHttpRpcClientConfig): SupabaseRpcClient {
  const fetchFn = config.fetchFn ?? fetch;
  const baseUrl = config.supabaseUrl.replace(/\/$/, '');

  return {
    async rpc<T = unknown>(functionName: string, args: Readonly<Record<string, unknown>>) {
      const signal = AbortSignal.timeout(config.timeoutMs);
      try {
        const response = await fetchFn(`${baseUrl}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
          method: 'POST',
          headers: {
            apikey: config.anonKey,
            authorization: `Bearer ${config.accessToken}`,
            accept: 'application/json',
            'content-type': 'application/json',
            'x-client-info': 'vault-reference-runtime/0.2',
          },
          body: JSON.stringify(args),
          signal,
        });
        const payload = await parseJsonResponse(response);
        if (!response.ok) {
          return { data: null, error: asProviderError(payload, response.status) };
        }
        return { data: payload as T | null, error: null };
      } catch {
        return {
          data: null,
          error: signal.aborted
            ? { message: 'supabase_upstream_timeout', code: '57014' }
            : { message: 'supabase_transport_unavailable', code: '08006' },
        };
      }
    },
  };
}
