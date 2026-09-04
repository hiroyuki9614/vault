import { describe, expect, it } from 'vitest';

import type {
  DeleteDocumentRequest,
  DocumentSnapshot,
  PutDocumentRequest,
} from '../contracts/document.js';
import type { DocumentStore } from '../ports/document-store.js';
import {
  createDocumentService,
  DocumentReadBackMismatchError,
} from './document-service.js';

const VAULT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

function createMemoryStore(): DocumentStore {
  let current: DocumentSnapshot | null = null;

  return {
    async getByPath(vaultId, path) {
      if (current?.vaultId === vaultId && current.path === path) return current;
      return null;
    },

    async getById(vaultId, documentId) {
      if (current?.vaultId === vaultId && current.id === documentId) return current;
      return null;
    },

    async put(request: PutDocumentRequest) {
      current = {
        id: request.documentId ?? DOCUMENT_ID,
        vaultId: request.vaultId,
        path: request.path,
        title: request.title,
        content: request.content,
        metadata: request.metadata,
        version: request.expectedVersion === null ? 1 : request.expectedVersion + 1,
      };
      return current;
    },

    async delete(request: DeleteDocumentRequest) {
      current = null;
      return request.documentId;
    },
  };
}

describe('document service', () => {
  it('returns canonical same-id read-back after put', async () => {
    const service = createDocumentService(createMemoryStore());

    const result = await service.put({
      kind: 'create',
      vaultId: VAULT_ID,
      path: 'notes/a.md',
      title: 'A',
      content: 'body',
    });

    expect(result.id).toBe(DOCUMENT_ID);
    expect(result.version).toBe(1);
    await expect(service.getById(VAULT_ID, DOCUMENT_ID)).resolves.toEqual(result);
  });

  it('requires identity absence after delete', async () => {
    const service = createDocumentService(createMemoryStore());
    await service.put({
      kind: 'create',
      vaultId: VAULT_ID,
      path: 'notes/a.md',
    });

    await expect(
      service.delete({
        vaultId: VAULT_ID,
        id: DOCUMENT_ID,
        path: 'notes/a.md',
        expectedVersion: 1,
      }),
    ).resolves.toBeUndefined();
    await expect(service.getById(VAULT_ID, DOCUMENT_ID)).resolves.toBeNull();
  });

  it('fails closed when mutation result differs from the plan', async () => {
    const base = createMemoryStore();
    const badStore: DocumentStore = {
      ...base,
      async put(request) {
        const snapshot = await base.put(request);
        return { ...snapshot, version: snapshot.version + 1 };
      },
    };

    const service = createDocumentService(badStore);
    const failure = service.put({
      kind: 'create',
      vaultId: VAULT_ID,
      path: 'notes/a.md',
    });

    await expect(failure).rejects.toBeInstanceOf(DocumentReadBackMismatchError);
    await expect(failure).rejects.toMatchObject({ stage: 'put_mutation' });
  });

  it('fails closed when same-id read-back diverges', async () => {
    const base = createMemoryStore();
    const badStore: DocumentStore = {
      ...base,
      async getById() {
        return null;
      },
    };

    const service = createDocumentService(badStore);
    const failure = service.put({
      kind: 'create',
      vaultId: VAULT_ID,
      path: 'notes/a.md',
    });

    await expect(failure).rejects.toMatchObject({ stage: 'put_read_back' });
  });
});
