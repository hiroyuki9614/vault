import type {
  DeleteDocumentCommand,
  DocumentSnapshot,
  PutDocumentCommand,
} from '../contracts/document.js';
import {
  planDeleteDocument,
  planPutDocument,
  verifyDeleteReadBack,
  verifyPutReadBack,
} from '../core/document-policy.js';
import type { DocumentStore } from '../ports/document-store.js';

export class DocumentReadBackMismatchError extends Error {
  constructor(operation: 'put' | 'delete') {
    super(`${operation} read-back did not match the planned state`);
    this.name = 'DocumentReadBackMismatchError';
  }
}

export interface DocumentService {
  get(vaultId: string, path: string): Promise<DocumentSnapshot | null>;
  put(command: PutDocumentCommand): Promise<DocumentSnapshot>;
  delete(command: DeleteDocumentCommand): Promise<void>;
}

export function createDocumentService(store: DocumentStore): DocumentService {
  return {
    get(vaultId, path) {
      return store.getByPath(vaultId, path);
    },

    async put(command) {
      const plan = planPutDocument(command);
      if (plan.kind !== 'put') {
        throw new TypeError('put command produced an invalid plan');
      }

      await store.put(plan.request);
      const readBack = await store.getByPath(plan.request.vaultId, plan.request.path);
      if (!verifyPutReadBack(plan, readBack)) {
        throw new DocumentReadBackMismatchError('put');
      }
      return readBack as DocumentSnapshot;
    },

    async delete(command) {
      const plan = planDeleteDocument(command);
      if (plan.kind !== 'delete') {
        throw new TypeError('delete command produced an invalid plan');
      }

      const deletedId = await store.delete(plan.request);
      if (deletedId !== plan.request.documentId) {
        throw new DocumentReadBackMismatchError('delete');
      }

      const readBack = await store.getByPath(plan.request.vaultId, plan.readBackPath);
      if (!verifyDeleteReadBack(readBack)) {
        throw new DocumentReadBackMismatchError('delete');
      }
    },
  };
}
