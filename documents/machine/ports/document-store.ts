import type {
  DeleteDocumentRequest,
  DocumentSnapshot,
  PutDocumentRequest,
} from '../contracts/document.js';

export type DocumentStoreErrorCode =
  | 'not_found'
  | 'version_conflict'
  | 'permission_denied'
  | 'unauthenticated'
  | 'invalid_request'
  | 'unavailable'
  | 'invalid_response'
  | 'unknown';

export class DocumentStoreError extends Error {
  readonly code: DocumentStoreErrorCode;
  readonly retryable: boolean;
  readonly providerCode: string | undefined;

  constructor(
    code: DocumentStoreErrorCode,
    message: string,
    options: { readonly retryable?: boolean; readonly providerCode?: string } = {},
  ) {
    super(message);
    this.name = 'DocumentStoreError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.providerCode = options.providerCode;
  }
}

export interface DocumentStore {
  getByPath(vaultId: string, path: string): Promise<DocumentSnapshot | null>;
  getById(vaultId: string, documentId: string): Promise<DocumentSnapshot | null>;
  put(request: PutDocumentRequest): Promise<DocumentSnapshot>;
  delete(request: DeleteDocumentRequest): Promise<string>;
}
