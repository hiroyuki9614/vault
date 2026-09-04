import type {
  DeleteDocumentRequest,
  DocumentSnapshot,
  PutDocumentRequest,
} from '../contracts/document.js';

export interface DocumentStore {
  getByPath(vaultId: string, path: string): Promise<DocumentSnapshot | null>;
  put(request: PutDocumentRequest): Promise<DocumentSnapshot>;
  delete(request: DeleteDocumentRequest): Promise<string>;
}
