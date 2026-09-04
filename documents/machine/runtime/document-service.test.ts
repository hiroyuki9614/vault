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
  it('returns the canonical read-back after put', async () => {
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
  });

  it('requires absence after delete', async () => {
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
  });

  it('fails closed when adapter result and read-back diverge', async () => {
    const badStore: DocumentStore = {
      async getByPath() {
        return null;
      },
      async put(request) {
        return {
          id: DOCUMENT_ID,
          vaultId: request.vaultId,
          path: request.path,
          title: request.title,
          content: request.content,
          metadata: request.metadata,
          version: 1,
        };
      },
      async delete(request) {
        return request.documentId;
      },
    };

    const service = createDocumentService(badStore);
    await expect(
      service.put({
        kind: 'create',
        vaultId: VAULT_ID,
        path: 'notes/a.md',
      }),
    ).rejects.toBeInstanceOf(DocumentReadBackMismatchError);
  });
});
