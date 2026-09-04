import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import type { DeleteDocumentCommand, JsonObject, PutDocumentCommand } from '../documents/machine/contracts/document.js';
import { DocumentValidationError } from '../documents/machine/contracts/document.js';
import { createSupabaseRpcDocumentStore } from '../documents/machine/adapters/supabase-rpc-document-store.js';
import { DocumentStoreError } from '../documents/machine/ports/document-store.js';
import {
  createDocumentService,
  DocumentReadBackMismatchError,
} from '../documents/machine/runtime/document-service.js';
import type { VaultServerConfig } from './config.js';
import { createSupabaseHttpRpcClient } from './supabase-http-rpc-client.js';

interface HttpDependencies {
  readonly fetchFn?: typeof fetch;
  readonly log?: (record: Readonly<Record<string, unknown>>) => void;
}

class HttpInputError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = 'HttpInputError';
    this.status = status;
    this.code = code;
  }
}

function requestIdFrom(request: IncomingMessage): string {
  const candidate = request.headers['x-request-id'];
  if (typeof candidate === 'string' && candidate.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

function sendJson(response: ServerResponse, status: number, requestId: string, body: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-request-id', requestId);
  response.end(JSON.stringify(body));
}

function sendEmpty(response: ServerResponse, status: number, requestId: string): void {
  response.statusCode = status;
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-request-id', requestId);
  response.end();
}

function requireBearer(request: IncomingMessage): string {
  const header = request.headers.authorization;
  if (typeof header !== 'string') throw new HttpInputError(401, 'unauthenticated');
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 8192) throw new HttpInputError(401, 'unauthenticated');
  return match[1];
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > maxBytes) throw new HttpInputError(413, 'payload_too_large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new HttpInputError(400, 'invalid_json');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpInputError(400, 'invalid_json');
  }
}

function objectBody(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpInputError(400, 'invalid_request');
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new HttpInputError(400, 'invalid_request');
  return value;
}

function optionalString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpInputError(400, 'invalid_request');
  return value;
}

function optionalMetadata(record: Readonly<Record<string, unknown>>): JsonObject | undefined {
  const value = record.metadata;
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpInputError(400, 'invalid_request');
  }
  return value as JsonObject;
}

function requiredVersion(record: Readonly<Record<string, unknown>>): number {
  const value = record.expectedVersion;
  if (typeof value !== 'number') throw new HttpInputError(400, 'invalid_request');
  return value;
}

function putCommand(record: Readonly<Record<string, unknown>>): PutDocumentCommand {
  const kind = record.kind;
  if (kind !== 'create' && kind !== 'update') throw new HttpInputError(400, 'invalid_request');
  const base = {
    kind,
    id: requiredString(record, 'id'),
    vaultId: requiredString(record, 'vaultId'),
    path: requiredString(record, 'path'),
    ...(optionalString(record, 'title') === undefined ? {} : { title: optionalString(record, 'title') }),
    ...(optionalString(record, 'content') === undefined ? {} : { content: optionalString(record, 'content') }),
    ...(optionalMetadata(record) === undefined ? {} : { metadata: optionalMetadata(record) }),
  };
  if (kind === 'create') return base as PutDocumentCommand;
  return { ...base, expectedVersion: requiredVersion(record) } as PutDocumentCommand;
}

function deleteCommand(record: Readonly<Record<string, unknown>>): DeleteDocumentCommand {
  return {
    vaultId: requiredString(record, 'vaultId'),
    id: requiredString(record, 'id'),
    path: requiredString(record, 'path'),
    expectedVersion: requiredVersion(record),
  };
}

function statusForStoreError(error: DocumentStoreError): number {
  switch (error.code) {
    case 'not_found': return 404;
    case 'version_conflict':
    case 'idempotency_conflict':
    case 'path_conflict': return 409;
    case 'permission_denied': return 403;
    case 'unauthenticated': return 401;
    case 'invalid_request': return 400;
    case 'unavailable': return 503;
    case 'invalid_response':
    case 'unknown': return 502;
  }
}

function errorResponse(error: unknown): { readonly status: number; readonly code: string; readonly retryable?: boolean } {
  if (error instanceof HttpInputError) return { status: error.status, code: error.code };
  if (error instanceof DocumentValidationError) return { status: 400, code: error.code };
  if (error instanceof DocumentStoreError) {
    return { status: statusForStoreError(error), code: error.code, retryable: error.retryable };
  }
  if (error instanceof DocumentReadBackMismatchError) return { status: 502, code: 'read_back_mismatch' };
  return { status: 500, code: 'internal_error' };
}

function routeNotFound(response: ServerResponse, requestId: string): void {
  sendJson(response, 404, requestId, { error: 'not_found', requestId });
}

export function createVaultHttpServer(config: VaultServerConfig, dependencies: HttpDependencies = {}): Server {
  const server = createServer(async (request, response) => {
    const startedAt = performance.now();
    const requestId = requestIdFrom(request);
    const method = request.method ?? 'UNKNOWN';
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;

    try {
      if (method === 'GET' && path === '/health/live') {
        sendJson(response, 200, requestId, { status: 'ok', requestId });
        return;
      }
      if (method === 'GET' && path === '/health/ready') {
        sendJson(response, 200, requestId, { status: 'ready', requestId });
        return;
      }
      if (method !== 'POST') {
        routeNotFound(response, requestId);
        return;
      }

      const accessToken = requireBearer(request);
      const body = objectBody(await readJson(request, config.maxBodyBytes));
      const rpcClient = createSupabaseHttpRpcClient({
        supabaseUrl: config.supabaseUrl,
        anonKey: config.supabaseAnonKey,
        accessToken,
        timeoutMs: config.upstreamTimeoutMs,
        ...(dependencies.fetchFn === undefined ? {} : { fetchFn: dependencies.fetchFn }),
      });
      const service = createDocumentService(createSupabaseRpcDocumentStore(rpcClient));

      if (path === '/v1/documents/get-by-path') {
        const document = await service.get(requiredString(body, 'vaultId'), requiredString(body, 'path'));
        if (document === null) throw new HttpInputError(404, 'not_found');
        sendJson(response, 200, requestId, { document, requestId });
        return;
      }
      if (path === '/v1/documents/get-by-id') {
        const document = await service.getById(requiredString(body, 'vaultId'), requiredString(body, 'documentId'));
        if (document === null) throw new HttpInputError(404, 'not_found');
        sendJson(response, 200, requestId, { document, requestId });
        return;
      }
      if (path === '/v1/documents/put') {
        const document = await service.put(putCommand(body));
        sendJson(response, 200, requestId, { document, requestId });
        return;
      }
      if (path === '/v1/documents/delete') {
        await service.delete(deleteCommand(body));
        sendEmpty(response, 204, requestId);
        return;
      }
      routeNotFound(response, requestId);
    } catch (error) {
      const mapped = errorResponse(error);
      sendJson(response, mapped.status, requestId, {
        error: mapped.code,
        ...(mapped.retryable === undefined ? {} : { retryable: mapped.retryable }),
        requestId,
      });
    } finally {
      dependencies.log?.({
        event: 'http_request',
        requestId,
        method,
        path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    }
  });

  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.maxRequestsPerSocket = 1000;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });
  return server;
}
