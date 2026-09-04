import type {
  DeleteDocumentCommand,
  DocumentSnapshot,
  DocumentWritePlan,
  JsonValue,
  PutDocumentCommand,
} from '../contracts/document.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) {
    throw new RangeError(`${field} must be a UUID`);
  }
  return value;
}

function assertPath(path: string): string {
  if (path.trim() === '') {
    throw new RangeError('path must not be blank');
  }
  if (path.includes('\u0000')) {
    throw new RangeError('path must not contain NUL');
  }
  return path;
}

function assertVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RangeError('expectedVersion must be a positive safe integer');
  }
  return version;
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

    return leftKeys.every((key) => jsonEqual(leftRecord[key] as JsonValue, rightRecord[key] as JsonValue));
  }

  return false;
}

export function planPutDocument(command: PutDocumentCommand): DocumentWritePlan {
  const vaultId = assertUuid(command.vaultId, 'vaultId');
  const path = assertPath(command.path);
  const title = command.title ?? '';
  const content = command.content ?? '';
  const metadata = command.metadata ?? {};

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
  return {
    kind: 'delete',
    request: {
      vaultId: assertUuid(command.vaultId, 'vaultId'),
      documentId: assertUuid(command.id, 'id'),
      expectedVersion: assertVersion(command.expectedVersion),
    },
    readBackPath: assertPath(command.path),
  };
}

export function verifyPutReadBack(
  plan: Extract<DocumentWritePlan, { readonly kind: 'put' }>,
  snapshot: DocumentSnapshot | null,
): boolean {
  if (snapshot === null) return false;

  const expected = plan.request;
  const identityMatches =
    expected.documentId === null || snapshot.id === expected.documentId;
  const versionMatches =
    expected.expectedVersion === null
      ? snapshot.version >= 1
      : snapshot.version === expected.expectedVersion + 1;

  return (
    identityMatches &&
    snapshot.vaultId === expected.vaultId &&
    snapshot.path === expected.path &&
    snapshot.title === expected.title &&
    snapshot.content === expected.content &&
    jsonEqual(snapshot.metadata, expected.metadata) &&
    versionMatches
  );
}

export function verifyDeleteReadBack(snapshot: DocumentSnapshot | null): boolean {
  return snapshot === null;
}
