import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CheckoutGatewayError,
  getPublicCheckoutConfig,
  handleGatewayCallback,
  initializeTicketCheckout,
  queryAndSyncOrderStatus,
  serializeOrderForClient,
} from './server/checkoutService.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    'https://thecourse.autoshowkampala.com',
    'https://www.thecourse.autoshowkampala.com',
  ]);

  const candidates = [
    process.env.APP_URL || '',
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ];

  for (const raw of candidates) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        origins.add(parsed.origin);
      }
    } catch {
      // Ignore malformed origin entries
    }
  }

  return origins;
}

function resolveServerOrigin(req: Request): string {
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const rawProto = forwardedProto || req.protocol || 'http';
  const safeProto = rawProto === 'https' ? 'https' : 'http';
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');

  const configuredAppUrl = (process.env.APP_URL || '').trim();
  if (configuredAppUrl) {
    try {
      const parsedAppUrl = new URL(configuredAppUrl);
      if (
        (parsedAppUrl.protocol === 'https:' || parsedAppUrl.protocol === 'http:') &&
        (!host || parsedAppUrl.host.toLowerCase() === host.toLowerCase())
      ) {
        return parsedAppUrl.origin;
      }
    } catch {
      // Ignore malformed APP_URL
    }
  }

  if (host) {
    try {
      return new URL(`${safeProto}://${host}`).origin;
    } catch {
      // Fallback to localhost
    }
  }

  return `http://localhost:${PORT}`;
}

function resolveFrontendOrigin(req: Request): string {
  const requestOrigin = req.get('origin')?.trim();
  if (requestOrigin && getAllowedOrigins().has(requestOrigin)) {
    return requestOrigin;
  }

  const configuredAppUrl = (process.env.APP_URL || '').trim();
  if (configuredAppUrl) {
    try {
      const parsed = new URL(configuredAppUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // Fallback below
    }
  }

  return resolveServerOrigin(req);
}

function sendErrorResponse(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof CheckoutGatewayError) {
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  res.status(500).json({ error: message || fallbackMessage });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.use('/api', (req, res, next) => {
    const requestOrigin = req.get('origin')?.trim();
    if (requestOrigin && getAllowedOrigins().has(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/checkout/config', async (_req, res) => {
    try {
      const config = await getPublicCheckoutConfig();
      res.json(config);
    } catch (error) {
      sendErrorResponse(res, error, 'Failed to read checkout configuration.');
    }
  });

  app.post('/api/checkout/init', async (req, res) => {
    try {
      const body = req.body as Record<string, unknown> | null;
      if (!body || typeof body !== 'object') {
        res.status(400).json({ error: 'Invalid request body.' });
        return;
      }

      const fullName = typeof body.fullName === 'string' ? body.fullName : '';
      const phoneDialCode = typeof body.phoneDialCode === 'string' ? body.phoneDialCode : '+256';
      const phoneLocalDigits = typeof body.phoneLocalDigits === 'string' ? body.phoneLocalDigits : '';
      const email = typeof body.email === 'string' ? body.email : undefined;
      const tierId = body.tierId === 'duo' ? 'duo' : body.tierId === 'solo' ? 'solo' : null;
      const quantity = typeof body.quantity === 'number' ? body.quantity : Number(body.quantity);
      const paymentMethodId =
        typeof body.paymentMethodId === 'number' && Number.isInteger(body.paymentMethodId)
          ? body.paymentMethodId
          : undefined;

      if (!tierId) {
        res.status(400).json({ error: 'Please select a valid ticket tier.' });
        return;
      }

      const result = await initializeTicketCheckout({
        fullName,
        phoneDialCode,
        phoneLocalDigits,
        email,
        tierId,
        quantity,
        paymentMethodId,
        appOrigin: resolveFrontendOrigin(req),
        backendOrigin: resolveServerOrigin(req),
      });

      res.json(result);
    } catch (error) {
      sendErrorResponse(res, error, 'Unable to initialize payment checkout.');
    }
  });

  app.get('/api/checkout/status', async (req, res) => {
    try {
      const rawOrderId = typeof req.query.orderId === 'string' ? req.query.orderId.trim().toUpperCase() : '';
      if (!/^TC-2026-[A-Z0-9]{4,12}$/.test(rawOrderId)) {
        res.status(400).json({ error: 'Invalid order reference format.' });
        return;
      }

      const order = await queryAndSyncOrderStatus(rawOrderId);
      res.json(serializeOrderForClient(order));
    } catch (error) {
      sendErrorResponse(res, error, 'Unable to verify payment status.');
    }
  });

  app.post('/api/checkout/callback', async (req, res) => {
    try {
      await handleGatewayCallback(req.body);
    } catch (err) {
      console.error('Checkout callback verification error:', err instanceof Error ? err.message : err);
    }
    res.status(200).json({ received: true });
  });

  app.post('/payment/:outcome', (req, res) => {
    const rawOutcome = req.params.outcome;
    const outcome =
      rawOutcome === 'success' || rawOutcome === 'failed' || rawOutcome === 'error'
        ? rawOutcome
        : 'error';
    const rawOrderId =
      typeof req.query.orderId === 'string'
        ? req.query.orderId.trim().toUpperCase()
        : typeof req.body?.orderId === 'string'
          ? req.body.orderId.trim().toUpperCase()
          : '';
    const safeOrderId = /^TC-2026-[A-Z0-9]{4,12}$/.test(rawOrderId)
      ? `&orderId=${encodeURIComponent(rawOrderId)}`
      : '';
    res.redirect(303, `/?checkout=${outcome}${safeOrderId}#tickets`);
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const currentEntryFile = path.basename(fileURLToPath(import.meta.url));
  const projectRoot = fs.existsSync(path.join(process.cwd(), 'index.html'))
    ? process.cwd()
    : moduleDir;
  const cwdDistDir = path.resolve(process.cwd(), 'dist');
  const moduleDistDir = path.resolve(moduleDir, 'dist');
  const projectDistDir = path.resolve(projectRoot, 'dist');
  const tmpDistDir = path.join(os.tmpdir(), 'the-course-dist');

  const findExistingDistDir = (): string | null => {
    for (const candidate of [cwdDistDir, moduleDistDir, projectDistDir, tmpDistDir]) {
      if (fs.existsSync(path.join(candidate, 'index.html'))) {
        return candidate;
      }
    }
    return null;
  };

  let distDir = findExistingDistDir() || projectDistDir;
  let distIndex = path.join(distDir, 'index.html');

  const serveStaticDist = async () => {
    if (!fs.existsSync(distIndex)) {
      const candidateTargets = [projectDistDir, tmpDistDir];
      for (const targetOutDir of candidateTargets) {
        try {
          console.log(`Frontend dist/ not found; building frontend bundle into ${targetOutDir}...`);
          const { build } = await import('vite');
          await build({
            root: projectRoot,
            build: { outDir: targetOutDir },
          });
          if (fs.existsSync(path.join(targetOutDir, 'index.html'))) {
            distDir = targetOutDir;
            distIndex = path.join(targetOutDir, 'index.html');
            break;
          }
        } catch (buildError) {
          console.error(`Automatic Vite build into ${targetOutDir} failed:`, buildError);
        }
      }
    }

    if (!fs.existsSync(distIndex)) {
      app.get('*', (_req, res) => {
        res
          .status(503)
          .send('Frontend build not found. Run "npm run build" before starting the server.');
      });
      return;
    }

    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  };

  const preferBuiltDist =
    IS_PROD ||
    currentEntryFile === 'server.js' ||
    (process.env.npm_lifecycle_event === 'start' && fs.existsSync(distIndex));

  if (preferBuiltDist) {
    await serveStaticDist();
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          ws: { server: httpServer },
        },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (error) {
      if (fs.existsSync(distIndex)) {
        await serveStaticDist();
      } else {
        throw error;
      }
    }
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
