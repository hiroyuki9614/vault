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

export type PutDocumentCommand =
  | {
      readonly kind: 'create';
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
  readonly path: string;
  readonly expectedVersion: number;
}

export interface PutDocumentRequest {
  readonly vaultId: string;
  readonly documentId: string | null;
  readonly path: string;
  readonly title: string;
  readonly content: string;
  readonly metadata: JsonObject;
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
      readonly readBackPath: string;
    };
