import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig, RuntimeConfigError } from './config.js';

const baseEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'public-key',
};

describe('parseRuntimeConfig', () => {
  it('defaults to loopback for Apache reverse-proxy use', () => {
    const config = parseRuntimeConfig(baseEnv);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3100);
    expect(config.upstreamTimeoutMs).toBe(8000);
    expect(config.maxBodyBytes).toBe(1048576);
  });

  it('rejects public bind unless explicitly enabled', () => {
    expect(() => parseRuntimeConfig({ ...baseEnv, VAULT_HOST: '0.0.0.0' })).toThrow(RuntimeConfigError);
  });

  it('allows an explicit public bind override', () => {
    const config = parseRuntimeConfig({
      ...baseEnv,
      VAULT_HOST: '0.0.0.0',
      VAULT_ALLOW_PUBLIC_BIND: 'true',
    });
    expect(config.host).toBe('0.0.0.0');
  });

  it('rejects Supabase URLs that embed credentials', () => {
    expect(() => parseRuntimeConfig({
      ...baseEnv,
      SUPABASE_URL: 'https://user:secret@example.supabase.co',
    })).toThrow(RuntimeConfigError);
  });

  it('rejects headers timeout longer than request timeout', () => {
    expect(() => parseRuntimeConfig({
      ...baseEnv,
      VAULT_REQUEST_TIMEOUT_MS: '5000',
      VAULT_HEADERS_TIMEOUT_MS: '6000',
    })).toThrow(RuntimeConfigError);
  });
});
