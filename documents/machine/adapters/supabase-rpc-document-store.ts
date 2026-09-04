import type {
  DeleteDocumentRequest,
  DocumentSnapshot,
  JsonObject,
  JsonValue,
  PutDocumentRequest,
} from '../contracts/document.js';
import {
  DocumentStoreError,
  type DocumentStore,
  type DocumentStoreErrorCode,
} from '../ports/document-store.js';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETRYABLE_PROVIDER_CODES = new Set(['08000', '08003', '08006', '53300', '57014', '57P01', 'PGRST003']);

function failInvalidResponse(message: string): never {
  throw new DocumentStoreError('invalid_response', message);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return failInvalidResponse(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    return failInvalidResponse(`${key} must be a string`);
  }
  return value;
}

function requiredUuid(record: Record<string, unknown>, key: string): string {
  const value = requiredString(record, key);
  if (!UUID_RE.test(value)) {
    return failInvalidResponse(`${key} must be a UUID`);
  }
  return value;
}

function requiredVersion(record: Record<string, unknown>): number {
  const raw = record.version;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    return failInvalidResponse('version must be a positive safe integer');
  }
  return value;
}

function parseJsonValue(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return failInvalidResponse(`${label} contains a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => parseJsonValue(item, `${label}[${index}]`));
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return failInvalidResponse(`${label} must contain plain JSON objects only`);
    }
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = parseJsonValue(item, `${label}.${key}`);
    }
    return result;
  }
  return failInvalidResponse(`${label} must contain JSON values only`);
}

function metadataObject(record: Record<string, unknown>): JsonObject {
  const value = parseJsonValue(record.metadata, 'metadata');
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return failInvalidResponse('metadata must be a JSON object');
  }
  return value;
}

function firstRow(value: unknown): unknown | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function toSnapshot(value: unknown): DocumentSnapshot {
  const row = assertRecord(value, 'document row');
  return {
    id: requiredUuid(row, 'id'),
    vaultId: requiredUuid(row, 'vault_id'),
    path: requiredString(row, 'path'),
    title: requiredString(row, 'title'),
    content: requiredString(row, 'content'),
    metadata: metadataObject(row),
    version: requiredVersion(row),
  };
}

function semanticRpcError(error: RpcErrorLike): DocumentStoreError {
  const message = error.message.toLowerCase();
  const providerCode = error.code;
  let code: DocumentStoreErrorCode = 'unknown';
  let retryable = false;

  if (message.includes('version_conflict')) {
    code = 'version_conflict';
  } else if (message.includes('document_not_found')) {
    code = 'not_found';
  } else if (
    message.includes('invalid_path') ||
    message.includes('expected_version_required') ||
    message.includes('expected_version_must_be_null_on_create')
  ) {
    code = 'invalid_request';
  } else if (providerCode === '42501' || message.includes('permission denied')) {
    code = 'permission_denied';
  } else if (
    providerCode === 'PGRST301' ||
    message.includes('jwt') ||
    message.includes('not authenticated')
  ) {
    code = 'unauthenticated';
  } else if (providerCode !== undefined && RETRYABLE_PROVIDER_CODES.has(providerCode)) {
    code = 'unavailable';
    retryable = true;
  }

  return new DocumentStoreError(code, `document store operation failed: ${code}`, {
    retryable,
    ...(providerCode === undefined ? {} : { providerCode }),
  });
}

function throwRpcError(error: RpcErrorLike | null): void {
  if (error !== null) throw semanticRpcError(error);
}

async function readSnapshot(
  client: SupabaseRpcClient,
  functionName: 'get_document' | 'get_document_by_id',
  args: Readonly<Record<string, unknown>>,
): Promise<DocumentSnapshot | null> {
  const result = await client.rpc<unknown>(functionName, args);
  throwRpcError(result.error);
  const row = firstRow(result.data);
  return row === null ? null : toSnapshot(row);
}

export function createSupabaseRpcDocumentStore(client: SupabaseRpcClient): DocumentStore {
  return {
    getByPath(vaultId, path) {
      return readSnapshot(client, 'get_document', {
        p_vault_id: vaultId,
        p_path: path,
      });
    },

    getById(vaultId, documentId) {
      return readSnapshot(client, 'get_document_by_id', {
        p_vault_id: vaultId,
        p_document_id: documentId,
      });
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
      if (row === null) return failInvalidResponse('put_document returned no row');
      return toSnapshot(row);
    },

    async delete(request: DeleteDocumentRequest) {
      const result = await client.rpc<unknown>('delete_document', {
        p_vault_id: request.vaultId,
        p_document_id: request.documentId,
        p_expected_version: request.expectedVersion,
      });
      throwRpcError(result.error);
      if (typeof result.data !== 'string' || !UUID_RE.test(result.data)) {
        return failInvalidResponse('delete_document returned invalid identity');
      }
      return result.data;
    },
  };
}
