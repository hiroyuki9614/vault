import type {
  DeleteDocumentCommand,
  DocumentIdentityRequest,
  DocumentPathRequest,
  DocumentSnapshot,
  DocumentWritePlan,
  JsonObject,
  JsonValue,
  PutDocumentCommand,
} from '../contracts/document.js';
import { DocumentValidationError } from '../contracts/document.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) {
    throw new DocumentValidationError('invalid_uuid', field, `${field} must be a UUID`);
  }
  return value;
}

function assertPath(path: string): string {
  if (path.trim() === '') {
    throw new DocumentValidationError('invalid_path', 'path', 'path must not be blank');
  }
  if (path.includes('\u0000')) {
    throw new DocumentValidationError('invalid_path', 'path', 'path must not contain NUL');
  }
  if (path.length > 512) {
    throw new DocumentValidationError('invalid_path', 'path', 'path must not exceed 512 characters');
  }
  return path;
}

function assertVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new DocumentValidationError(
      'invalid_version',
      'expectedVersion',
      'expectedVersion must be a positive safe integer',
    );
  }
  return version;
}

function assertJsonValue(value: unknown, field: string, seen: WeakSet<object>): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new DocumentValidationError('invalid_metadata', field, `${field} must contain finite JSON numbers`);
    }
    return;
  }

  if (typeof value !== 'object') {
    throw new DocumentValidationError('invalid_metadata', field, `${field} must contain JSON values only`);
  }

  if (seen.has(value)) {
    throw new DocumentValidationError('invalid_metadata', field, `${field} must not contain cycles`);
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${field}[${index}]`, seen));
    seen.delete(value);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new DocumentValidationError('invalid_metadata', field, `${field} must contain plain JSON objects only`);
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    assertJsonValue(item, `${field}.${key}`, seen);
  }
  seen.delete(value);
}

function assertMetadata(metadata: JsonObject | undefined): JsonObject {
  const resolved: JsonObject = metadata ?? {};
  assertJsonValue(resolved, 'metadata', new WeakSet<object>());
  return resolved;
}

function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => jsonEqual(value, right[index] as JsonValue));
  }

  if (
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object'
  ) {
    const leftRecord = left as Readonly<Record<string, JsonValue>>;
    const rightRecord = right as Readonly<Record<string, JsonValue>>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();

    if (
      leftKeys.length !== rightKeys.length ||
      leftKeys.some((key, index) => key !== rightKeys[index])
    ) {
      return false;
    }

    return leftKeys.every((key) =>
      jsonEqual(leftRecord[key] as JsonValue, rightRecord[key] as JsonValue),
    );
  }

  return false;
}

function snapshotContentMatchesRequest(
  request: Extract<DocumentWritePlan, { readonly kind: 'put' }>['request'],
  snapshot: DocumentSnapshot,
): boolean {
  return (
    snapshot.vaultId === request.vaultId &&
    snapshot.path === request.path &&
    snapshot.title === request.title &&
    snapshot.content === request.content &&
    jsonEqual(snapshot.metadata, request.metadata)
  );
}

export function planGetDocumentByPath(vaultId: string, path: string): DocumentPathRequest {
  return {
    vaultId: assertUuid(vaultId, 'vaultId'),
    path: assertPath(path),
  };
}

export function planGetDocumentById(vaultId: string, documentId: string): DocumentIdentityRequest {
  return {
    vaultId: assertUuid(vaultId, 'vaultId'),
    documentId: assertUuid(documentId, 'documentId'),
  };
}

export function planPutDocument(command: PutDocumentCommand): DocumentWritePlan {
  const vaultId = assertUuid(command.vaultId, 'vaultId');
  const path = assertPath(command.path);
  const title = command.title ?? '';
  const content = command.content ?? '';
  const metadata = assertMetadata(command.metadata);

  if (command.kind === 'create') {
    return {
      kind: 'put',
      request: {
        vaultId,
        documentId: null,
        path,
        title,
        content,
        metadata,
        expectedVersion: null,
      },
    };
  }

  return {
    kind: 'put',
    request: {
      vaultId,
      documentId: assertUuid(command.id, 'id'),
      path,
      title,
      content,
      metadata,
      expectedVersion: assertVersion(command.expectedVersion),
    },
  };
}

export function planDeleteDocument(command: DeleteDocumentCommand): DocumentWritePlan {
  assertPath(command.path);
  return {
    kind: 'delete',
    request: {
      vaultId: assertUuid(command.vaultId, 'vaultId'),
      documentId: assertUuid(command.id, 'id'),
      expectedVersion: assertVersion(command.expectedVersion),
    },
  };
}

export function verifyPutMutation(
  plan: Extract<DocumentWritePlan, { readonly kind: 'put' }>,
  mutation: DocumentSnapshot,
): boolean {
  const request = plan.request;
  const identityMatches = request.documentId === null || mutation.id === request.documentId;
  const versionMatches =
    request.expectedVersion === null
      ? mutation.version === 1
      : mutation.version === request.expectedVersion + 1;

  return identityMatches && snapshotContentMatchesRequest(request, mutation) && versionMatches;
}

export function verifyPutReadBack(
  mutation: DocumentSnapshot,
  readBack: DocumentSnapshot | null,
): boolean {
  if (readBack === null) return false;
  return (
    readBack.id === mutation.id &&
    readBack.vaultId === mutation.vaultId &&
    readBack.path === mutation.path &&
    readBack.title === mutation.title &&
    readBack.content === mutation.content &&
    jsonEqual(readBack.metadata, mutation.metadata) &&
    readBack.version === mutation.version
  );
}

export function verifyDeleteReadBack(snapshot: DocumentSnapshot | null): boolean {
  return snapshot === null;
}
