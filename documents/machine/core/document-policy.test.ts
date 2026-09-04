import { describe, expect, it } from 'vitest';

import type { DocumentSnapshot } from '../contracts/document.js';
import {
  planDeleteDocument,
  planPutDocument,
  verifyDeleteReadBack,
  verifyPutReadBack,
} from './document-policy.js';

const VAULT_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('document policy', () => {
  it('plans create without effectful dependencies', () => {
    const plan = planPutDocument({
      kind: 'create',
      vaultId: VAULT_ID,
      path: 'notes/hello.md',
    });

    expect(plan).toEqual({
      kind: 'put',
      request: {
        vaultId: VAULT_ID,
        documentId: null,
        path: 'notes/hello.md',
        title: '',
        content: '',
        metadata: {},
        expectedVersion: null,
      },
    });
  });

  it('plans update with explicit optimistic version', () => {
    const plan = planPutDocument({
      kind: 'update',
      vaultId: VAULT_ID,
      id: DOCUMENT_ID,
      path: 'notes/renamed.md',
      title: 'Renamed',
      content: 'body',
      metadata: { tags: ['public', 'reference'] },
      expectedVersion: 7,
    });

    expect(plan.kind).toBe('put');
    if (plan.kind !== 'put') throw new Error('unexpected plan');
    expect(plan.request.documentId).toBe(DOCUMENT_ID);
    expect(plan.request.expectedVersion).toBe(7);
  });

  it('rejects invalid domain input before an adapter is involved', () => {
    expect(() =>
      planPutDocument({
        kind: 'create',
        vaultId: VAULT_ID,
        path: '   ',
      }),
    ).toThrow('path must not be blank');

    expect(() =>
      planPutDocument({
        kind: 'update',
        vaultId: VAULT_ID,
        id: DOCUMENT_ID,
        path: 'notes/a.md',
        expectedVersion: 0,
      }),
    ).toThrow('expectedVersion');
  });

  it('verifies update read-back independent of JSON object key order', () => {
    const plan = planPutDocument({
      kind: 'update',
      vaultId: VAULT_ID,
      id: DOCUMENT_ID,
      path: 'notes/a.md',
      title: 'A',
      content: 'body',
      metadata: { a: 1, nested: { x: true, y: null } },
      expectedVersion: 3,
    });
    if (plan.kind !== 'put') throw new Error('unexpected plan');

    const snapshot: DocumentSnapshot = {
      id: DOCUMENT_ID,
      vaultId: VAULT_ID,
      path: 'notes/a.md',
      title: 'A',
      content: 'body',
      metadata: { nested: { y: null, x: true }, a: 1 },
      version: 4,
    };

    expect(verifyPutReadBack(plan, snapshot)).toBe(true);
    expect(verifyPutReadBack(plan, { ...snapshot, version: 5 })).toBe(false);
  });

  it('plans delete and verifies absence on read-back', () => {
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
      readBackPath: 'notes/a.md',
    });
    expect(verifyDeleteReadBack(null)).toBe(true);
  });
});
