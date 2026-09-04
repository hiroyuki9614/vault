import { describe, expect, it } from 'vitest';

import type { DocumentSnapshot } from '../contracts/document.js';
import { DocumentValidationError } from '../contracts/document.js';
import {
  planDeleteDocument,
  planGetDocumentById,
  planGetDocumentByPath,
  planPutDocument,
  verifyDeleteReadBack,
  verifyPutMutation,
  verifyPutReadBack,
} from './document-policy.js';

const VAULT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    id: DOCUMENT_ID,
    vaultId: VAULT_ID,
    path: 'notes/a.md',
    title: 'A',
    content: 'body',
    metadata: { a: 1, nested: { x: true, y: null } },
    version: 4,
    ...overrides,
  };
}

describe('document policy', () => {
  it('plans validated path and identity reads', () => {
    expect(planGetDocumentByPath(VAULT_ID, 'notes/a.md')).toEqual({
      vaultId: VAULT_ID,
      path: 'notes/a.md',
    });
    expect(planGetDocumentById(VAULT_ID, DOCUMENT_ID)).toEqual({
      vaultId: VAULT_ID,
      documentId: DOCUMENT_ID,
    });
  });

  it('plans create with caller-supplied stable identity', () => {
    const plan = planPutDocument({
      kind: 'create',
      id: DOCUMENT_ID,
      vaultId: VAULT_ID,
      path: 'notes/hello.md',
    });

    expect(plan).toEqual({
      kind: 'put',
      request: {
        vaultId: VAULT_ID,
        documentId: DOCUMENT_ID,
        path: 'notes/hello.md',
        title: '',
        content: '',
        metadata: {},
        expectedVersion: null,
      },
    });
  });

  it('uses stable validation errors before an adapter is involved', () => {
    const failure = () =>
      planPutDocument({
        kind: 'create',
        id: DOCUMENT_ID,
        vaultId: VAULT_ID,
        path: '   ',
      });

    expect(failure).toThrow(DocumentValidationError);
    try {
      failure();
    } catch (error) {
      expect(error).toMatchObject({ code: 'invalid_path', field: 'path' });
    }
  });

  it('rejects invalid create identity before an adapter is involved', () => {
    expect(() =>
      planPutDocument({
        kind: 'create',
        id: 'not-a-uuid',
        vaultId: VAULT_ID,
        path: 'notes/a.md',
      }),
    ).toThrowError(/id must be a UUID/);
  });

  it('rejects non-JSON metadata at runtime', () => {
    const invalid = { value: Number.NaN } as unknown as Record<string, never>;
    expect(() =>
      planPutDocument({
        kind: 'create',
        id: DOCUMENT_ID,
        vaultId: VAULT_ID,
        path: 'notes/a.md',
        metadata: invalid,
      }),
    ).toThrowError(/finite JSON numbers/);
  });

  it('requires exact create identity/version and update version +1', () => {
    const createPlan = planPutDocument({
      kind: 'create',
      id: DOCUMENT_ID,
      vaultId: VAULT_ID,
      path: 'notes/a.md',
      title: 'A',
      content: 'body',
      metadata: { a: 1, nested: { y: null, x: true } },
    });
    if (createPlan.kind !== 'put') throw new Error('unexpected plan');

    const created = snapshot({ version: 1 });
    expect(verifyPutMutation(createPlan, created)).toBe(true);
    expect(verifyPutMutation(createPlan, { ...created, version: 2 })).toBe(false);
    expect(
      verifyPutMutation(createPlan, {
        ...created,
        id: '33333333-3333-4333-8333-333333333333',
      }),
    ).toBe(false);

    const updatePlan = planPutDocument({
      kind: 'update',
      vaultId: VAULT_ID,
      id: DOCUMENT_ID,
      path: 'notes/a.md',
      title: 'A',
      content: 'body',
      metadata: { a: 1, nested: { y: null, x: true } },
      expectedVersion: 3,
    });
    if (updatePlan.kind !== 'put') throw new Error('unexpected plan');
    expect(verifyPutMutation(updatePlan, snapshot())).toBe(true);
    expect(
      verifyPutMutation(updatePlan, snapshot({ id: '33333333-3333-4333-8333-333333333333' })),
    ).toBe(false);
  });

  it('requires same identity and state on read-back', () => {
    const mutation = snapshot();
    expect(
      verifyPutReadBack(mutation, snapshot({ metadata: { nested: { y: null, x: true }, a: 1 } })),
    ).toBe(true);
    expect(
      verifyPutReadBack(mutation, snapshot({ id: '33333333-3333-4333-8333-333333333333' })),
    ).toBe(false);
    expect(verifyPutReadBack(mutation, null)).toBe(false);
  });

  it('plans delete and verifies identity absence', () => {
    const plan = planDeleteDocument({
      vaultId: VAULT_ID,
      id: DOCUMENT_ID,
      path: 'notes/a.md',
      expectedVersion: 4,
    });

    expect(plan).toEqual({
      kind: 'delete',
      request: {
        vaultId: VAULT_ID,
        documentId: DOCUMENT_ID,
        expectedVersion: 4,
      },
    });
    expect(verifyDeleteReadBack(null)).toBe(true);
    expect(verifyDeleteReadBack(snapshot())).toBe(false);
  });
});
