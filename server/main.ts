import { createVaultHttpServer } from './http-app.js';
import { parseRuntimeConfig, RuntimeConfigError } from './config.js';

function log(record: Readonly<Record<string, unknown>>): void {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function logError(record: Readonly<Record<string, unknown>>): void {
  process.stderr.write(`${JSON.stringify(record)}\n`);
}

async function main(): Promise<void> {
  let config;
  try {
    config = parseRuntimeConfig(process.env);
  } catch (error) {
    if (error instanceof RuntimeConfigError) {
      logError({ event: 'startup_failed', code: 'invalid_configuration', field: error.field });
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const server = createVaultHttpServer(config, { log });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  log({ event: 'server_started', host: config.host, port: config.port });

  let shuttingDown = false;
  const shutdown = (signal: 'SIGINT' | 'SIGTERM') => {
    if (shuttingDown) return;
    shuttingDown = true;
    log({ event: 'shutdown_started', signal });

    const forceTimer = setTimeout(() => {
      logError({ event: 'shutdown_forced' });
      server.closeAllConnections();
      process.exitCode = 1;
    }, config.shutdownTimeoutMs);
    forceTimer.unref();

    server.close((error) => {
      clearTimeout(forceTimer);
      if (error) {
        logError({ event: 'shutdown_failed', code: 'server_close_failed' });
        process.exitCode = 1;
      } else {
        log({ event: 'shutdown_complete' });
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(() => {
  logError({ event: 'fatal_error', code: 'startup_exception' });
  process.exitCode = 1;
});
