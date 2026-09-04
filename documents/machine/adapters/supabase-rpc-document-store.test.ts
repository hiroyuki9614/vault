import { describe, expect, it } from 'vitest';

import {
  createSupabaseRpcDocumentStore,
  DocumentStoreAdapterError,
  type SupabaseRpcClient,
} from './supabase-rpc-document-store.js';

const VAULT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

function clientWith(handler: (name: string, args: Readonly<Record<string, unknown>>) => unknown): SupabaseRpcClient {
  return {
    async rpc<T>(
      name: string,
      args: Readonly<Record<string, unknown>>,
    ) {
      return {
        data: handler(name, args) as T,
        error: null,
      };
    },
  };
}

describe('Supabase RPC document adapter', () => {
  it('maps get_document rows into provider-free snapshots', async () => {
    const client = clientWith((name) => {
      expect(name).toBe('get_document');
      return [
        {
          id: DOCUMENT_ID,
          vault_id: VAULT_ID,
          path: 'notes/a.md',
          title: 'A',
          content: 'body',
          metadata: { tag: 'public' },
          version: 3,
        },
      ];
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

  it('maps semantic requests to existing RPC parameter names', async () => {
    const client = clientWith((name, args) => {
      expect(name).toBe('put_document');
      expect(args).toMatchObject({
        p_vault_id: VAULT_ID,
        p_document_id: null,
        p_path: 'notes/a.md',
        p_expected_version: null,
      });
      return [
        {
          id: DOCUMENT_ID,
          vault_id: VAULT_ID,
          path: 'notes/a.md',
          title: '',
          content: '',
          metadata: {},
          version: '1',
        },
      ];
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

  it('keeps provider errors outside the core contract', async () => {
    const client: SupabaseRpcClient = {
      async rpc<T>() {
        return {
          data: null as T | null,
          error: { message: 'version_conflict', code: 'P0001' },
        };
      },
    };

    const store = createSupabaseRpcDocumentStore(client);
    await expect(
      store.getByPath(VAULT_ID, 'notes/a.md'),
    ).rejects.toBeInstanceOf(DocumentStoreAdapterError);
  });
});
