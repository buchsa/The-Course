import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
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

function resolveAppOrigin(req: Request): string {
  const configuredAppUrl = (process.env.APP_URL || '').trim();
  if (configuredAppUrl && configuredAppUrl !== 'MY_APP_URL') {
    try {
      const parsed = new URL(configuredAppUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // Fallback to request headers below
    }
  }

  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const rawProto = forwardedProto || req.protocol || 'http';
  const safeProto = rawProto === 'https' ? 'https' : 'http';
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
  if (host) {
    try {
      return new URL(`${safeProto}://${host}`).origin;
    } catch {
      // Fallback to localhost
    }
  }

  return `http://localhost:${PORT}`;
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
        appOrigin: resolveAppOrigin(req),
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
      ? `?orderId=${encodeURIComponent(rawOrderId)}`
      : '';
    res.redirect(303, `/payment/${outcome}${safeOrderId}`);
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
