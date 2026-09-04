export class RuntimeConfigError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'RuntimeConfigError';
    this.field = field;
  }
}

export interface VaultServerConfig {
  readonly host: string;
  readonly port: number;
  readonly supabaseUrl: string;
  readonly supabaseAnonKey: string;
  readonly upstreamTimeoutMs: number;
  readonly requestTimeoutMs: number;
  readonly headersTimeoutMs: number;
  readonly keepAliveTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly maxBodyBytes: number;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new RuntimeConfigError(name, `${name} is required`);
  return value;
}

function boundedInteger(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RuntimeConfigError(name, `${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function supabaseOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RuntimeConfigError('SUPABASE_URL', 'SUPABASE_URL must be a valid URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RuntimeConfigError('SUPABASE_URL', 'SUPABASE_URL must use http or https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new RuntimeConfigError('SUPABASE_URL', 'SUPABASE_URL must not contain credentials, query, or fragment');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new RuntimeConfigError('SUPABASE_URL', 'SUPABASE_URL must be an origin URL without a path');
  }
  return url.origin;
}

export function parseRuntimeConfig(
  env: Readonly<Record<string, string | undefined>>,
): VaultServerConfig {
  const host = env.VAULT_HOST?.trim() || '127.0.0.1';
  const allowPublicBind = env.VAULT_ALLOW_PUBLIC_BIND?.trim() === 'true';
  if (!LOOPBACK_HOSTS.has(host) && !allowPublicBind) {
    throw new RuntimeConfigError(
      'VAULT_HOST',
      'non-loopback bind requires VAULT_ALLOW_PUBLIC_BIND=true; host reverse-proxy deployments should bind loopback only',
    );
  }

  const requestTimeoutMs = boundedInteger(env, 'VAULT_REQUEST_TIMEOUT_MS', 15_000, 1_000, 120_000);
  const headersTimeoutMs = boundedInteger(env, 'VAULT_HEADERS_TIMEOUT_MS', 10_000, 1_000, 120_000);
  if (headersTimeoutMs > requestTimeoutMs) {
    throw new RuntimeConfigError('VAULT_HEADERS_TIMEOUT_MS', 'header timeout must not exceed request timeout');
  }

  return {
    host,
    port: boundedInteger(env, 'VAULT_PORT', 3100, 1, 65_535),
    supabaseUrl: supabaseOrigin(required(env, 'SUPABASE_URL')),
    supabaseAnonKey: required(env, 'SUPABASE_ANON_KEY'),
    upstreamTimeoutMs: boundedInteger(env, 'SUPABASE_RPC_TIMEOUT_MS', 8_000, 500, 60_000),
    requestTimeoutMs,
    headersTimeoutMs,
    keepAliveTimeoutMs: boundedInteger(env, 'VAULT_KEEP_ALIVE_TIMEOUT_MS', 5_000, 500, 60_000),
    shutdownTimeoutMs: boundedInteger(env, 'VAULT_SHUTDOWN_TIMEOUT_MS', 10_000, 1_000, 60_000),
    maxBodyBytes: boundedInteger(env, 'VAULT_MAX_BODY_BYTES', 1_048_576, 1_024, 10_485_760),
  };
}
