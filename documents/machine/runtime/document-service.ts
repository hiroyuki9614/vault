import type {
  DeleteDocumentCommand,
  DocumentSnapshot,
  PutDocumentCommand,
} from '../contracts/document.js';
import {
  planDeleteDocument,
  planGetDocumentById,
  planGetDocumentByPath,
  planPutDocument,
  verifyDeleteReadBack,
  verifyPutMutation,
  verifyPutReadBack,
} from '../core/document-policy.js';
import type { DocumentStore } from '../ports/document-store.js';

export type DocumentReadBackMismatchStage =
  | 'put_mutation'
  | 'put_read_back'
  | 'delete_mutation'
  | 'delete_read_back';

export class DocumentReadBackMismatchError extends Error {
  readonly stage: DocumentReadBackMismatchStage;

  constructor(stage: DocumentReadBackMismatchStage) {
    super(`${stage} did not match the planned document state`);
    this.name = 'DocumentReadBackMismatchError';
    this.stage = stage;
  }
}

export interface DocumentService {
  get(vaultId: string, path: string): Promise<DocumentSnapshot | null>;
  getById(vaultId: string, documentId: string): Promise<DocumentSnapshot | null>;
  put(command: PutDocumentCommand): Promise<DocumentSnapshot>;
  delete(command: DeleteDocumentCommand): Promise<void>;
}

export function createDocumentService(store: DocumentStore): DocumentService {
  return {
    get(vaultId, path) {
      const request = planGetDocumentByPath(vaultId, path);
      return store.getByPath(request.vaultId, request.path);
    },

    getById(vaultId, documentId) {
      const request = planGetDocumentById(vaultId, documentId);
      return store.getById(request.vaultId, request.documentId);
    },

    async put(command) {
      const plan = planPutDocument(command);
      if (plan.kind !== 'put') {
        throw new TypeError('put command produced an invalid plan');
      }

      const mutation = await store.put(plan.request);
      if (!verifyPutMutation(plan, mutation)) {
        throw new DocumentReadBackMismatchError('put_mutation');
      }

      const readBack = await store.getById(mutation.vaultId, mutation.id);
      if (!verifyPutReadBack(mutation, readBack)) {
        throw new DocumentReadBackMismatchError('put_read_back');
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
        throw new DocumentReadBackMismatchError('delete_mutation');
      }

      const readBack = await store.getById(plan.request.vaultId, plan.request.documentId);
      if (!verifyDeleteReadBack(readBack)) {
        throw new DocumentReadBackMismatchError('delete_read_back');
      }
    },
  };
}
