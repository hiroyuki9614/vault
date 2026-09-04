export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface DocumentSnapshot {
  readonly id: string;
  readonly vaultId: string;
  readonly path: string;
  readonly title: string;
  readonly content: string;
  readonly metadata: JsonObject;
  readonly version: number;
}

export type DocumentValidationErrorCode =
  | 'invalid_uuid'
  | 'invalid_path'
  | 'invalid_version'
  | 'invalid_metadata';

export class DocumentValidationError extends Error {
  readonly code: DocumentValidationErrorCode;
  readonly field: string;

  constructor(code: DocumentValidationErrorCode, field: string, message: string) {
    super(message);
    this.name = 'DocumentValidationError';
    this.code = code;
    this.field = field;
  }
}

export type PutDocumentCommand =
  | {
      readonly kind: 'create';
      /** Stable caller-generated UUID. Reusing the same id makes create retry-safe. */
      readonly id: string;
      readonly vaultId: string;
      readonly path: string;
      readonly title?: string;
      readonly content?: string;
      readonly metadata?: JsonObject;
    }
  | {
      readonly kind: 'update';
      readonly vaultId: string;
      readonly id: string;
      readonly path: string;
      readonly title?: string;
      readonly content?: string;
      readonly metadata?: JsonObject;
      readonly expectedVersion: number;
    };

export interface DeleteDocumentCommand {
  readonly vaultId: string;
  readonly id: string;
  /** @deprecated deletion verification is identity-based; path is accepted for backward compatibility only. */
  readonly path: string;
  readonly expectedVersion: number;
}

export interface DocumentPathRequest {
  readonly vaultId: string;
  readonly path: string;
}

export interface DocumentIdentityRequest {
  readonly vaultId: string;
  readonly documentId: string;
}

export interface PutDocumentRequest {
  readonly vaultId: string;
  readonly documentId: string;
  readonly path: string;
  readonly title: string;
  readonly content: string;
  readonly metadata: JsonObject;
  /** null means idempotent create; positive integer means optimistic update. */
  readonly expectedVersion: number | null;
}

export interface DeleteDocumentRequest {
  readonly vaultId: string;
  readonly documentId: string;
  readonly expectedVersion: number;
}

export type DocumentWritePlan =
  | {
      readonly kind: 'put';
      readonly request: PutDocumentRequest;
    }
  | {
      readonly kind: 'delete';
      readonly request: DeleteDocumentRequest;
    };
