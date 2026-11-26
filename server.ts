import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CheckoutGatewayError,
  checkInOrderForStaff,
  getPublicCheckoutConfig,
  handleGatewayCallback,
  initializeTicketCheckout,
  listOrdersForStaff,
  queryAndSyncOrderStatus,
  resendTicketEmailForStaff,
  reverifyOrderForStaff,
  serializeOrderForClient,
  verifyTicketForStaff,
} from './server/checkoutService.ts';
import {
  authenticateOrClaimStaffPassword,
  authenticateStaffRequest,
  checkLoginRateLimit,
  getStaffAuthStatus,
  issueStaffToken,
  normalizeStaffRole,
  resetLoginRateLimit,
} from './server/staffAuth.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>([
    'https://thecourse.autoshowkampala.com',
    'https://www.thecourse.autoshowkampala.com',
  ]);

  const candidates = [process.env.APP_URL || ''];

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

function sendErrorResponse(
  res: Response,
  error: unknown,
  fallbackMessage: string,
  context?: string
) {
  const prefix = context ? `[checkout] ${context} failed` : '[checkout] API error';
  if (error instanceof CheckoutGatewayError) {
    console.error(
      `${prefix}: HTTP ${error.status}${error.code ? ` (${error.code})` : ''} - ${error.message}`
    );
    res.status(error.status).json({
      error: error.message,
      code: error.code,
    });
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  console.error(`${prefix}: HTTP 500 - ${message || fallbackMessage}`);
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
      sendErrorResponse(res, error, 'Failed to read checkout configuration.', 'GET /api/checkout/config');
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
      sendErrorResponse(res, error, 'Unable to initialize payment checkout.', 'POST /api/checkout/init');
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
      sendErrorResponse(res, error, 'Unable to verify payment status.', 'GET /api/checkout/status');
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

  app.get('/api/staff/config', (_req, res) => {
    res.json(getStaffAuthStatus());
  });

  app.post('/api/staff/login', (req, res) => {
    const clientIp = req.ip || 'unknown';
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `Too many login attempts. Try again in ${rateCheck.retryAfterSeconds ?? 60} seconds.`,
      });
      return;
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid login payload.' });
      return;
    }

    const role = normalizeStaffRole(body.role);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!role) {
      res.status(400).json({ error: 'Please choose either Admin or Desk.' });
      return;
    }

    const authResult = authenticateOrClaimStaffPassword(role, password);
    if (!authResult.ok) {
      res.status(authResult.status || 401).json({ error: authResult.error || 'Authentication failed.' });
      return;
    }

    resetLoginRateLimit(clientIp);
    const session = issueStaffToken(role);
    res.json({
      ...session,
      claimed: Boolean(authResult.claimed),
    });
  });

  app.get('/api/staff/orders', (req, res) => {
    const claims = authenticateStaffRequest(req);
    if (!claims) {
      res.status(401).json({ error: 'Staff sign-in required.' });
      return;
    }

    const readQueryStr = (value: unknown, maxLen = 120): string =>
      typeof value === 'string' ? value.trim().slice(0, maxLen) : '';

    const status = readQueryStr(req.query.status, 24) || 'ALL';
    const search = readQueryStr(req.query.search, 120);
    const tierId = readQueryStr(req.query.tierId, 24) || 'ALL';
    const checkIn = readQueryStr(req.query.checkIn, 24) || 'ALL';
    const paymentMethod = readQueryStr(req.query.paymentMethod, 32) || 'ALL';
    const dateFrom = readQueryStr(req.query.dateFrom, 16);
    const dateTo = readQueryStr(req.query.dateTo, 16);

    res.json({
      role: claims.role,
      ...listOrdersForStaff(claims.role, {
        status,
        search,
        tierId,
        checkIn,
        paymentMethod,
        dateFrom,
        dateTo,
      }),
    });
  });

  app.post('/api/staff/orders/:orderId/reverify', async (req, res) => {
    const claims = authenticateStaffRequest(req);
    if (!claims) {
      res.status(401).json({ error: 'Staff sign-in required.' });
      return;
    }

    try {
      const rawOrderId = (req.params.orderId || '').trim().toUpperCase();
      if (!/^TC-2026-[A-Z0-9]{4,12}$/.test(rawOrderId)) {
        res.status(400).json({ error: 'Invalid order reference format.' });
        return;
      }
      const order = await reverifyOrderForStaff(rawOrderId, claims.role);
      res.json({ order });
    } catch (error) {
      sendErrorResponse(
        res,
        error,
        'Unable to re-verify payment status.',
        'POST /api/staff/orders/:orderId/reverify'
      );
    }
  });

  app.post('/api/staff/verify-ticket', async (req, res) => {
    const claims = authenticateStaffRequest(req);
    if (!claims) {
      res.status(401).json({ error: 'Staff sign-in required.' });
      return;
    }

    try {
      const body = req.body as Record<string, unknown> | null;
      const code = typeof body?.code === 'string' ? body.code.trim() : '';
      if (!code || code.length > 1000) {
        res.status(400).json({ error: 'Enter or scan a valid pass code or order reference.' });
        return;
      }
      const result = await verifyTicketForStaff(code, claims.role);
      res.json(result);
    } catch (error) {
      sendErrorResponse(res, error, 'Unable to verify ticket.', 'POST /api/staff/verify-ticket');
    }
  });

  app.post('/api/staff/orders/:orderId/check-in', (req, res) => {
    const claims = authenticateStaffRequest(req);
    if (!claims) {
      res.status(401).json({ error: 'Staff sign-in required.' });
      return;
    }

    try {
      const rawOrderId = (req.params.orderId || '').trim().toUpperCase();
      if (!/^TC-2026-[A-Z0-9]{4,12}$/.test(rawOrderId)) {
        res.status(400).json({ error: 'Invalid order reference format.' });
        return;
      }
      const order = checkInOrderForStaff(rawOrderId, claims.role);
      res.json({ order });
    } catch (error) {
      sendErrorResponse(res, error, 'Unable to check in pass.', 'POST /api/staff/orders/:orderId/check-in');
    }
  });

  app.post('/api/staff/orders/:orderId/resend-email', async (req, res) => {
    const claims = authenticateStaffRequest(req);
    if (!claims) {
      res.status(401).json({ error: 'Staff sign-in required.' });
      return;
    }

    try {
      const rawOrderId = (req.params.orderId || '').trim().toUpperCase();
      if (!/^TC-2026-[A-Z0-9]{4,12}$/.test(rawOrderId)) {
        res.status(400).json({ error: 'Invalid order reference format.' });
        return;
      }
      const body = req.body as Record<string, unknown> | null;
      const overrideEmail = typeof body?.email === 'string' ? body.email : undefined;
      const result = await resendTicketEmailForStaff(rawOrderId, claims.role, overrideEmail);
      res.json(result);
    } catch (error) {
      sendErrorResponse(
        res,
        error,
        'Unable to send e-ticket email.',
        'POST /api/staff/orders/:orderId/resend-email'
      );
    }
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
