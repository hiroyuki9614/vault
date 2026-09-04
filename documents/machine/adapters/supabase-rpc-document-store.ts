import type {
  DeleteDocumentRequest,
  DocumentSnapshot,
  JsonObject,
  PutDocumentRequest,
} from '../contracts/document.js';
import type { DocumentStore } from '../ports/document-store.js';

interface RpcErrorLike {
  readonly message: string;
  readonly code?: string;
}

interface RpcResult<T> {
  readonly data: T | null;
  readonly error: RpcErrorLike | null;
}

export interface SupabaseRpcClient {
  rpc<T = unknown>(
    functionName: string,
    args: Readonly<Record<string, unknown>>,
  ): PromiseLike<RpcResult<T>>;
}

export class DocumentStoreAdapterError extends Error {
  readonly providerCode?: string;

  constructor(message: string, providerCode?: string) {
    super(message);
    this.name = 'DocumentStoreAdapterError';
    this.providerCode = providerCode;
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DocumentStoreAdapterError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new DocumentStoreAdapterError(`${key} must be a string`);
  }
  return value;
}

function requiredVersion(record: Record<string, unknown>): number {
  const raw = record.version;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new DocumentStoreAdapterError('version must be a positive safe integer');
  }
  return value;
}

function metadataObject(record: Record<string, unknown>): JsonObject {
  const value = record.metadata;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DocumentStoreAdapterError('metadata must be a JSON object');
  }
  return value as JsonObject;
}

function firstRow(value: unknown): unknown | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toSnapshot(value: unknown): DocumentSnapshot {
  const row = assertRecord(value, 'document row');
  return {
    id: requiredString(row, 'id'),
    vaultId: requiredString(row, 'vault_id'),
    path: requiredString(row, 'path'),
    title: requiredString(row, 'title'),
    content: requiredString(row, 'content'),
    metadata: metadataObject(row),
    version: requiredVersion(row),
  };
}

function throwRpcError(error: RpcErrorLike | null): void {
  if (error !== null) {
    throw new DocumentStoreAdapterError(error.message, error.code);
  }
}

export function createSupabaseRpcDocumentStore(client: SupabaseRpcClient): DocumentStore {
  return {
    async getByPath(vaultId, path) {
      const result = await client.rpc<unknown>('get_document', {
        p_vault_id: vaultId,
        p_path: path,
      });
      throwRpcError(result.error);
      const row = firstRow(result.data);
      return row === null ? null : toSnapshot(row);
    },

    async put(request: PutDocumentRequest) {
      const result = await client.rpc<unknown>('put_document', {
        p_vault_id: request.vaultId,
        p_document_id: request.documentId,
        p_path: request.path,
        p_title: request.title,
        p_content: request.content,
        p_metadata: request.metadata,
        p_expected_version: request.expectedVersion,
      });
      throwRpcError(result.error);
      const row = firstRow(result.data);
      if (row === null) {
        throw new DocumentStoreAdapterError('put_document returned no row');
      }
      return toSnapshot(row);
    },

    async delete(request: DeleteDocumentRequest) {
      const result = await client.rpc<unknown>('delete_document', {
        p_vault_id: request.vaultId,
        p_document_id: request.documentId,
        p_expected_version: request.expectedVersion,
      });
      throwRpcError(result.error);
      if (typeof result.data !== 'string') {
        throw new DocumentStoreAdapterError('delete_document returned invalid identity');
      }
      return result.data;
    },
  };
}
