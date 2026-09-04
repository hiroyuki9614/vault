import { describe, expect, it } from 'vitest';

import { DocumentStoreError } from '../ports/document-store.js';
import {
  createSupabaseRpcDocumentStore,
  type SupabaseRpcClient,
} from './supabase-rpc-document-store.js';

const VAULT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

function clientWith(
  handler: (name: string, args: Readonly<Record<string, unknown>>) => unknown,
): SupabaseRpcClient {
  return {
    async rpc<T>(name: string, args: Readonly<Record<string, unknown>>) {
      return {
        data: handler(name, args) as T,
        error: null,
      };
    },
  };
}

function row(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: DOCUMENT_ID,
    vault_id: VAULT_ID,
    path: 'notes/a.md',
    title: 'A',
    content: 'body',
    metadata: { tag: 'public' },
    version: 3,
    ...overrides,
  };
}

describe('Supabase RPC document adapter', () => {
  it('maps path reads into provider-free snapshots', async () => {
    const client = clientWith((name) => {
      expect(name).toBe('get_document');
      return [row()];
    });

    const store = createSupabaseRpcDocumentStore(client);
    await expect(store.getByPath(VAULT_ID, 'notes/a.md')).resolves.toEqual({
      id: DOCUMENT_ID,
      vaultId: VAULT_ID,
      path: 'notes/a.md',
      title: 'A',
      content: 'body',
      metadata: { tag: 'public' },
      version: 3,
    });
  });

  it('uses identity RPC for same-subject reads', async () => {
    const client = clientWith((name, args) => {
      expect(name).toBe('get_document_by_id');
      expect(args).toEqual({
        p_vault_id: VAULT_ID,
        p_document_id: DOCUMENT_ID,
      });
      return [row()];
    });

    const store = createSupabaseRpcDocumentStore(client);
    await expect(store.getById(VAULT_ID, DOCUMENT_ID)).resolves.toMatchObject({
      id: DOCUMENT_ID,
      vaultId: VAULT_ID,
    });
  });

  it('maps semantic requests to existing RPC parameter names', async () => {
    const client = clientWith((name, args) => {
      expect(name).toBe('put_document');
      expect(args).toMatchObject({
        p_vault_id: VAULT_ID,
        p_document_id: null,
        p_path: 'notes/a.md',
        p_expected_version: null,
      });
      return [row({ title: '', content: '', metadata: {}, version: '1' })];
    });

    const store = createSupabaseRpcDocumentStore(client);
    const result = await store.put({
      vaultId: VAULT_ID,
      documentId: null,
      path: 'notes/a.md',
      title: '',
      content: '',
      metadata: {},
      expectedVersion: null,
    });

    expect(result.version).toBe(1);
  });

  it('normalizes version conflicts without exposing provider messages as the contract', async () => {
    const client: SupabaseRpcClient = {
      async rpc<T>() {
        return {
          data: null as T | null,
          error: { message: 'version_conflict: internal database detail', code: 'P0001' },
        };
      },
    };

    const store = createSupabaseRpcDocumentStore(client);
    const failure = store.getByPath(VAULT_ID, 'notes/a.md');

    await expect(failure).rejects.toMatchObject({
      name: 'DocumentStoreError',
      code: 'version_conflict',
      retryable: false,
      providerCode: 'P0001',
      message: 'document store operation failed: version_conflict',
    });
  });

  it('marks infrastructure availability errors as retryable', async () => {
    const client: SupabaseRpcClient = {
      async rpc<T>() {
        return {
          data: null as T | null,
          error: { message: 'connection failure', code: '08006' },
        };
      },
    };

    const store = createSupabaseRpcDocumentStore(client);
    const failure = store.getById(VAULT_ID, DOCUMENT_ID);

    await expect(failure).rejects.toBeInstanceOf(DocumentStoreError);
    await expect(failure).rejects.toMatchObject({ code: 'unavailable', retryable: true });
  });

  it('fails closed on invalid provider JSON', async () => {
    const client = clientWith(() => [row({ metadata: { invalid: Number.NaN } })]);
    const store = createSupabaseRpcDocumentStore(client);

    await expect(store.getById(VAULT_ID, DOCUMENT_ID)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });
});
