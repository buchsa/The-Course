import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EVENT_INFO, TICKET_TIERS, type TicketTier } from '../src/data/eventData.ts';
import type { StaffRole } from './staffAuth.ts';
import { sendTicketConfirmationEmail } from './ticketEmailService.ts';

export interface RonfordApiEnvelope<T> {
  statusCode?: number;
  resultCode?: string;
  resultDesc?: string;
  message?: string;
  succeeded?: boolean;
  data?: T;
}

export interface MerchantCodeInfo {
  name: string;
  code: string;
}

export interface GatewayPaymentMethod {
  id: number;
  name: string;
}

interface InitDataPayload {
  publicKey: string;
  iv: string;
}

interface AuthSession {
  sessionToken: string;
  sessionExpiryUtc: string;
  publicKey: string;
  merchantName: string;
  merchantCodes: MerchantCodeInfo[];
  paymentMethods: GatewayPaymentMethod[];
}

export interface PaymentCreditDetails {
  bankRef?: string;
  externalRef?: string;
  paymentMethod?: string;
  amount?: number;
  currency?: string;
  account?: string;
  accountCurrency?: string;
  valueDate?: string;
}

export type OrderStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface OrderRecord {
  orderId: string;
  requestId: string;
  checkoutRef: string;
  checkoutUrl: string;
  expiresAtUtc: string;
  passCode?: string;
  hotelVoucherCode?: string;
  fullName: string;
  phone: string;
  phoneDialCode: string;
  phoneNumber: string;
  email: string;
  tier: TicketTier;
  quantity: number;
  totalUgx: number;
  selectedMethodLabel?: string;
  status: OrderStatus;
  statusDescription?: string;
  credit?: PaymentCreditDetails;
  checkedInAt?: number;
  checkedInBy?: StaffRole;
  paidAt?: number;
  emailSentAt?: number;
  emailSentTo?: string;
  emailLastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateCheckoutInput {
  fullName: string;
  phoneDialCode: string;
  phoneLocalDigits: string;
  email?: string;
  tierId: 'solo' | 'duo';
  quantity: number;
  paymentMethodId?: number;
  appOrigin: string;
  backendOrigin?: string;
}

class CheckoutGatewayError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 502, code?: string) {
    super(message);
    this.name = 'CheckoutGatewayError';
    this.status = status;
    this.code = code;
  }
}

export { CheckoutGatewayError };

interface GatewayConfig {
  apiBase: string;
  merchantKey: string;
  secretKey: string;
  subscriptionKey?: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
const SESSION_EXPIRY_BUFFER_MS = 60_000;
const CHECKOUT_SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_DATA_DIR = path.resolve(process.cwd(), '.data');
const CONFIGURED_DATA_DIR = (process.env.DATA_DIR || '').trim();
const ORDERS_DATA_DIR = CONFIGURED_DATA_DIR ? path.resolve(CONFIGURED_DATA_DIR) : DEFAULT_DATA_DIR;
const ORDERS_FILE_PATH = path.join(ORDERS_DATA_DIR, 'orders.json');
const ORDERS_BACKUP_PATH = path.join(ORDERS_DATA_DIR, 'orders.backup.json');

function resolveOrderExpiresAtUtc(createdAt: number, gatewayExpiresAtUtc?: string): string {
  const localExpiryMs = createdAt + CHECKOUT_SESSION_TTL_MS;
  const parsedGatewayMs = gatewayExpiresAtUtc ? Date.parse(gatewayExpiresAtUtc) : Number.NaN;
  const effectiveMs =
    !Number.isNaN(parsedGatewayMs) && parsedGatewayMs > createdAt
      ? Math.min(localExpiryMs, parsedGatewayMs)
      : localExpiryMs;
  return new Date(effectiveMs).toISOString();
}

let cachedAuthSession: AuthSession | null = null;
let inFlightAuthPromise: Promise<AuthSession> | null = null;

const ordersById = new Map<string, OrderRecord>();
const orderIdByCheckoutRef = new Map<string, string>();
const orderIdByPassCode = new Map<string, string>();
const inFlightEmailOrderIds = new Set<string>();

function indexOrderRecord(record: OrderRecord): void {
  ordersById.set(record.orderId, record);
  orderIdByCheckoutRef.set(record.checkoutRef, record.orderId);
  if (record.passCode) {
    orderIdByPassCode.set(record.passCode.toUpperCase(), record.orderId);
  }
}

function readOrderArrayFromFile(filePath: string): OrderRecord[] | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (item): item is OrderRecord =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as OrderRecord).orderId === 'string' &&
        typeof (item as OrderRecord).checkoutRef === 'string'
    );
  } catch {
    return null;
  }
}

function loadPersistedOrders(): void {
  try {
    const legacyPath = path.join(DEFAULT_DATA_DIR, 'orders.json');
    const candidates = [
      ORDERS_FILE_PATH,
      ORDERS_BACKUP_PATH,
      ...(ORDERS_FILE_PATH !== legacyPath ? [legacyPath] : []),
    ];

    for (const candidate of candidates) {
      const records = readOrderArrayFromFile(candidate);
      if (records && records.length > 0) {
        for (const record of records) {
          indexOrderRecord(record);
        }
        if (candidate !== ORDERS_FILE_PATH) {
          savePersistedOrders();
        }
        return;
      }
    }
  } catch (err) {
    console.warn('Unable to load persisted checkout orders:', err instanceof Error ? err.message : err);
  }
}

function savePersistedOrders(): void {
  try {
    fs.mkdirSync(ORDERS_DATA_DIR, { recursive: true });
    const allOrders = Array.from(ordersById.values());
    const serialized = JSON.stringify(allOrders, null, 2);
    if (fs.existsSync(ORDERS_FILE_PATH)) {
      try {
        fs.copyFileSync(ORDERS_FILE_PATH, ORDERS_BACKUP_PATH);
      } catch {
        // Ignore backup copy errors if primary does not exist yet
      }
    }
    const tempFile = `${ORDERS_FILE_PATH}.tmp`;
    fs.writeFileSync(tempFile, serialized, 'utf8');
    fs.renameSync(tempFile, ORDERS_FILE_PATH);
  } catch (err) {
    console.warn('Unable to persist checkout orders:', err instanceof Error ? err.message : err);
  }
}

loadPersistedOrders();

function normalizePemPublicKey(rawKey: string): string {
  const unescaped = rawKey.replace(/\\n/g, '\n').trim();
  if (unescaped.includes('-----BEGIN')) {
    return unescaped;
  }
  const cleanBase64 = unescaped.replace(/\s+/g, '');
  const lines = cleanBase64.match(/.{1,64}/g) ?? [cleanBase64];
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----`;
}

function normalizeApiBase(rawUrl: string): string {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new CheckoutGatewayError('Checkout base URL must use HTTP or HTTPS.', 500, 'INVALID_BASE_URL');
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  const basePath = cleanPath.endsWith('/api/v1') ? cleanPath : `${cleanPath}/api/v1`;
  return `${parsed.origin}${basePath}`;
}

export function isCheckoutConfigured(): boolean {
  const rawUrl = (process.env.RONFORD_BASE_URL || process.env.CHECKOUT_BASE_URL || '').trim();
  const merchantKey = (
    process.env.RONFORD_MERCHANT_KEY ||
    process.env.CHECKOUT_MERCHANT_KEY ||
    process.env.MERCHANT_KEY ||
    ''
  ).trim();
  const secretKey = (
    process.env.RONFORD_SECRET_KEY ||
    process.env.CHECKOUT_SECRET_KEY ||
    process.env.SECRET_KEY ||
    ''
  ).trim();
  return Boolean(rawUrl && merchantKey && secretKey);
}

function getGatewayConfig(): GatewayConfig {
  const rawUrl = (process.env.RONFORD_BASE_URL || process.env.CHECKOUT_BASE_URL || '').trim();
  const merchantKey = (
    process.env.RONFORD_MERCHANT_KEY ||
    process.env.CHECKOUT_MERCHANT_KEY ||
    process.env.MERCHANT_KEY ||
    ''
  ).trim();
  const secretKey = (
    process.env.RONFORD_SECRET_KEY ||
    process.env.CHECKOUT_SECRET_KEY ||
    process.env.SECRET_KEY ||
    ''
  ).trim();
  const subscriptionKey = (
    process.env.RONFORD_SUBSCRIPTION_KEY ||
    process.env.CHECKOUT_SUBSCRIPTION_KEY ||
    process.env.OCP_APIM_SUBSCRIPTION_KEY ||
    ''
  ).trim();

  if (!rawUrl || !merchantKey || !secretKey) {
    throw new CheckoutGatewayError(
      'Payment gateway credentials are not configured on the server yet.',
      503,
      'CREDENTIALS_NOT_CONFIGURED'
    );
  }

  return {
    apiBase: normalizeApiBase(rawUrl),
    merchantKey,
    secretKey,
    subscriptionKey: subscriptionKey || undefined,
  };
}

function extractApiError(payload: RonfordApiEnvelope<unknown> | null, fallbackMessage: string): string {
  if (!payload) return fallbackMessage;
  const parts: string[] = [];
  if (typeof payload.message === 'string' && payload.message.trim()) {
    parts.push(payload.message.trim());
  }
  if (
    typeof payload.resultDesc === 'string' &&
    payload.resultDesc.trim() &&
    payload.resultDesc.trim().toLowerCase() !== payload.message?.trim().toLowerCase()
  ) {
    parts.push(payload.resultDesc.trim());
  }
  if (Array.isArray(payload.data) && payload.data.length > 0) {
    const details = payload.data
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join('; ');
    if (details) parts.push(details);
  }
  return parts.length > 0 ? parts.join(' — ') : fallbackMessage;
}

async function callGatewayJson<T>(
  apiBase: string,
  endpointPath: string,
  options: {
    method: 'GET' | 'POST';
    body?: unknown;
    bearerToken?: string;
    subscriptionKey?: string;
    suppressWafLog?: boolean;
  }
): Promise<{
  httpStatus: number;
  isJson: boolean;
  payload: RonfordApiEnvelope<T>;
  serverHeader?: string;
  contentType?: string;
  rawSnippet?: string;
}> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };
  if (options.subscriptionKey) {
    headers['Ocp-Apim-Subscription-Key'] = options.subscriptionKey;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.bearerToken) {
    headers.Authorization = `Bearer ${options.bearerToken}`;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}${endpointPath}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Network error';
    throw new CheckoutGatewayError(`Unable to reach payment gateway: ${detail}`, 502, 'GATEWAY_UNREACHABLE');
  }

  const rawText = await response.text();
  let parsed: RonfordApiEnvelope<T> = {};
  let isJson = false;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText) as RonfordApiEnvelope<T>;
      isJson = true;
    } catch {
      isJson = false;
    }
  } else {
    isJson = response.ok;
  }

  const serverHeader = response.headers.get('server') || undefined;
  const contentType = response.headers.get('content-type') || undefined;
  const rawSnippet =
    !isJson && rawText
      ? rawText
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180)
      : undefined;
  const isFrontDoorBlock =
    !isJson &&
    response.status === 403 &&
    Boolean(rawSnippet?.toLowerCase().includes('the request is blocked'));

  if (!isJson) {
    if (!(options.suppressWafLog && isFrontDoorBlock)) {
      console.error(
        `[checkout] Non-JSON response from ${endpointPath}: HTTP ${response.status} (ct=${contentType || 'unknown'}, server=${serverHeader || 'unknown'})`
      );
    }
  } else if (response.status >= 400 || parsed.succeeded === false) {
    console.error(
      `[checkout] Gateway error from ${endpointPath}: HTTP ${response.status} - ${extractApiError(parsed, 'Gateway returned an error')}`
    );
  }

  return { httpStatus: response.status, isJson, payload: parsed, serverHeader, contentType, rawSnippet };
}

async function retrieveInitData(
  apiBase: string,
  subscriptionKey?: string,
  suppressWafLog = false
): Promise<InitDataPayload> {
  const { httpStatus, isJson, payload, rawSnippet } = await callGatewayJson<InitDataPayload>(
    apiBase,
    '/test/retrieve-init-data',
    { method: 'GET', subscriptionKey, suppressWafLog }
  );

  if (!isJson || httpStatus >= 400 || !payload.succeeded || !payload.data?.publicKey || !payload.data?.iv) {
    const isFrontDoorBlock =
      !isJson &&
      httpStatus === 403 &&
      Boolean(rawSnippet?.toLowerCase().includes('the request is blocked'));

    if (isFrontDoorBlock) {
      if (!suppressWafLog) {
        console.error(
          `[checkout] Azure Front Door WAF blocked gateway request (${rawSnippet}). Ensure the hosting region/IP is allowed by the payment gateway.`
        );
      }
      throw new CheckoutGatewayError(
        'The payment gateway firewall blocked the server connection (HTTP 403). Please confirm the Ronford API base URL and ensure your hosting server IP/region is allowlisted with Ronford Digital.',
        502,
        'GATEWAY_WAF_BLOCKED'
      );
    }

    const extra = !isJson ? ` (HTTP ${httpStatus})` : ` (HTTP ${httpStatus})`;
    throw new CheckoutGatewayError(
      extractApiError(
        isJson ? payload : null,
        `Failed to retrieve payment security initialization data${extra}.`
      ),
      httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
    );
  }

  return payload.data;
}

async function generateChallenge(
  config: GatewayConfig,
  initData: InitDataPayload
): Promise<string> {
  const plaintext = `${config.secretKey}:${initData.iv}`;
  const { httpStatus, isJson, payload } = await callGatewayJson<string>(
    config.apiBase,
    '/test/asymmetric-encrypt',
    {
      method: 'POST',
      body: plaintext,
      subscriptionKey: config.subscriptionKey,
    }
  );

  if (isJson && httpStatus < 400 && payload.succeeded && typeof payload.data === 'string' && payload.data) {
    return payload.data;
  }

  // Fallback to local RSA encryption if the helper endpoint is disabled on live environment
  if (httpStatus === 404 || httpStatus === 405 || httpStatus === 403 || !isJson) {
    return crypto
      .publicEncrypt(
        {
          key: normalizePemPublicKey(initData.publicKey),
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        Buffer.from(plaintext, 'utf8')
      )
      .toString('base64');
  }

  throw new CheckoutGatewayError(
    extractApiError(payload, `Failed to generate security challenge (HTTP ${httpStatus}).`),
    httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
  );
}

async function generateHash(
  config: GatewayConfig,
  requestData: Record<string, unknown>
): Promise<string> {
  const { httpStatus, isJson, payload } = await callGatewayJson<string>(config.apiBase, '/test/hash', {
    method: 'POST',
    body: {
      key: config.secretKey,
      data: requestData,
    },
    subscriptionKey: config.subscriptionKey,
  });

  if (isJson && httpStatus < 400 && payload.succeeded && typeof payload.data === 'string' && payload.data) {
    return payload.data;
  }

  // Fallback per section 4.1: "{jsonString}{secretKey}" SHA-256
  if (httpStatus === 404 || httpStatus === 405 || httpStatus === 403 || !isJson) {
    return crypto
      .createHash('sha256')
      .update(`${JSON.stringify(requestData)}${config.secretKey}`, 'utf8')
      .digest('hex');
  }

  throw new CheckoutGatewayError(
    extractApiError(payload, `Failed to generate request signature hash (HTTP ${httpStatus}).`),
    httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
  );
}

function isSessionFresh(session: AuthSession | null): session is AuthSession {
  if (!session?.sessionToken) return false;
  const expiryMs = Date.parse(session.sessionExpiryUtc);
  if (Number.isNaN(expiryMs)) return false;
  return expiryMs - Date.now() > SESSION_EXPIRY_BUFFER_MS;
}

async function authenticateMerchant(
  config: GatewayConfig,
  forceRefresh = false,
  suppressWafLog = false
): Promise<AuthSession> {
  if (!forceRefresh && isSessionFresh(cachedAuthSession)) {
    return cachedAuthSession;
  }

  if (!forceRefresh && inFlightAuthPromise) {
    return inFlightAuthPromise;
  }

  inFlightAuthPromise = (async () => {
    const initData = await retrieveInitData(config.apiBase, config.subscriptionKey, suppressWafLog);
    const authData = {
      merchantKey: config.merchantKey,
      timestamp: new Date().toISOString(),
    };

    const [challenge, hash] = await Promise.all([
      generateChallenge(config, initData),
      generateHash(config, authData),
    ]);

    const { httpStatus, payload } = await callGatewayJson<AuthSession>(
      config.apiBase,
      '/checkout-merchant/auth',
      {
        method: 'POST',
        body: {
          data: authData,
          hash,
          challenge,
        },
        subscriptionKey: config.subscriptionKey,
      }
    );

    if (httpStatus >= 400 || !payload.succeeded || !payload.data?.sessionToken) {
      cachedAuthSession = null;
      throw new CheckoutGatewayError(
        extractApiError(payload, 'Merchant authentication failed.'),
        httpStatus === 401 || httpStatus === 403 ? 502 : httpStatus >= 400 ? httpStatus : 502
      );
    }

    cachedAuthSession = payload.data;
    return cachedAuthSession;
  })();

  try {
    return await inFlightAuthPromise;
  } finally {
    inFlightAuthPromise = null;
  }
}

async function buildSignedSecurityFields(
  config: GatewayConfig,
  requestData: Record<string, unknown>
): Promise<{ hash: string; challenge: string }> {
  const initData = await retrieveInitData(config.apiBase, config.subscriptionKey);
  const [challenge, hash] = await Promise.all([
    generateChallenge(config, initData),
    generateHash(config, requestData),
  ]);
  return { hash, challenge };
}

export async function getPublicCheckoutConfig(): Promise<{
  configured: boolean;
  merchantName?: string;
  paymentMethods: GatewayPaymentMethod[];
}> {
  if (!isCheckoutConfigured()) {
    return {
      configured: false,
      paymentMethods: [],
    };
  }

  try {
    const config = getGatewayConfig();
    const session = await authenticateMerchant(config, false, true);
    return {
      configured: true,
      merchantName: session.merchantName,
      paymentMethods: Array.isArray(session.paymentMethods) ? session.paymentMethods : [],
    };
  } catch (err) {
    if (!(err instanceof CheckoutGatewayError && err.code === 'GATEWAY_WAF_BLOCKED')) {
      console.warn(
        '[checkout] Failed to refresh public checkout config:',
        err instanceof Error ? err.message : err
      );
    }
    return {
      configured: true,
      paymentMethods: [],
    };
  }
}

export async function initializeTicketCheckout(input: CreateCheckoutInput): Promise<{
  orderId: string;
  checkoutUrl: string;
  checkoutRef: string;
  expiresAtUtc: string;
  amountUgx: number;
  paymentMethods: GatewayPaymentMethod[];
}> {
  const config = getGatewayConfig();

  const tier = TICKET_TIERS.find((item) => item.id === input.tierId);
  if (!tier) {
    throw new CheckoutGatewayError('Invalid ticket tier selected.', 400, 'INVALID_TIER');
  }

  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 10) {
    throw new CheckoutGatewayError('Quantity must be between 1 and 10 tickets.', 400, 'INVALID_QUANTITY');
  }

  const trimmedName = input.fullName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 120) {
    throw new CheckoutGatewayError('Please provide a valid full name.', 400, 'INVALID_NAME');
  }

  const dialCode = input.phoneDialCode.trim();
  if (!/^\+\d{1,4}$/.test(dialCode)) {
    throw new CheckoutGatewayError('Please select a valid country dial code.', 400, 'INVALID_DIAL_CODE');
  }

  const cleanedDigits = input.phoneLocalDigits.replace(/[\s\-()]/g, '').replace(/^0+/, '');
  if (!/^\d{7,12}$/.test(cleanedDigits)) {
    throw new CheckoutGatewayError('Please enter a valid phone number.', 400, 'INVALID_PHONE');
  }

  const trimmedEmail = (input.email ?? '').trim();
  if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    throw new CheckoutGatewayError('Please enter a valid email address.', 400, 'INVALID_EMAIL');
  }

  const gatewayEmail = trimmedEmail || EVENT_INFO.email;
  const fullPhoneNumber = `${dialCode.replace('+', '')}${cleanedDigits}`;
  const formattedDisplayPhone = `${dialCode} ${cleanedDigits}`;
  const totalUgx = tier.priceUgx * input.quantity;
  const shortHex = crypto.randomBytes(3).toString('hex').toUpperCase();
  const orderId = `TC-2026-${shortHex}`;
  const requestId = crypto.randomUUID();

  let session = await authenticateMerchant(config);

  const merchantCode = session.merchantCodes?.[0]?.code || '000001';

  const supportedMethods = Array.isArray(session.paymentMethods) ? session.paymentMethods : [];
  let paymentMethodIds: number[];
  let selectedMethodLabel: string | undefined;

  if (typeof input.paymentMethodId === 'number') {
    const matched = supportedMethods.find((m) => m.id === input.paymentMethodId);
    if (matched) {
      paymentMethodIds = [matched.id];
      selectedMethodLabel = matched.name;
    } else {
      paymentMethodIds = supportedMethods.map((m) => m.id);
    }
  } else {
    paymentMethodIds = supportedMethods.map((m) => m.id);
  }

  if (paymentMethodIds.length === 0) {
    paymentMethodIds = [1, 2];
  }

  const origin = input.appOrigin.replace(/\/+$/, '');
  const callbackOrigin = (input.backendOrigin || input.appOrigin).replace(/\/+$/, '');
  const encodedOrderId = encodeURIComponent(orderId);

  const paymentData: Record<string, unknown> = {
    requestId,
    merchantCode,
    amount: String(totalUgx),
    currency: 'UGX',
    successRedirectUrl: `${origin}/?checkout=success&orderId=${encodedOrderId}#tickets`,
    failedRedirectUrl: `${origin}/?checkout=failed&orderId=${encodedOrderId}#tickets`,
    errorRedirectUrl: `${origin}/?checkout=error&orderId=${encodedOrderId}#tickets`,
    callbackUrl: `${callbackOrigin}/api/checkout/callback`,
    paymentMethods: paymentMethodIds,
    customer: {
      email: gatewayEmail,
      name: trimmedName,
      phoneNumber: fullPhoneNumber,
      phoneDialCode: dialCode,
    },
    meta: {
      orderId,
      tierId: tier.id,
      tierName: tier.name,
      quantity: String(input.quantity),
    },
  };

  interface PaymentInitResponseData {
    checkoutUrl?: string;
    checkoutRef?: string;
    expiresAtUtc?: string;
  }

  const executePaymentInit = async (token: string) => {
    const security = await buildSignedSecurityFields(config, paymentData);
    return callGatewayJson<PaymentInitResponseData>(
      config.apiBase,
      '/checkout-merchant/payment-init',
      {
        method: 'POST',
        bearerToken: token,
        subscriptionKey: config.subscriptionKey,
        body: {
          data: paymentData,
          hash: security.hash,
          challenge: security.challenge,
        },
      }
    );
  };

  let initCall = await executePaymentInit(session.sessionToken);
  if (initCall.httpStatus === 401) {
    session = await authenticateMerchant(config, true);
    initCall = await executePaymentInit(session.sessionToken);
  }

  const { httpStatus, payload } = initCall;
  if (
    httpStatus >= 400 ||
    !payload.succeeded ||
    !payload.data?.checkoutUrl ||
    !payload.data?.checkoutRef
  ) {
    throw new CheckoutGatewayError(
      extractApiError(payload, 'Unable to initialize payment checkout session.'),
      httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
    );
  }

  let validatedCheckoutUrl: string;
  try {
    const parsedCheckoutUrl = new URL(payload.data.checkoutUrl);
    if (parsedCheckoutUrl.protocol !== 'https:' && parsedCheckoutUrl.protocol !== 'http:') {
      throw new Error('Invalid scheme');
    }
    validatedCheckoutUrl = parsedCheckoutUrl.toString();
  } catch {
    throw new CheckoutGatewayError('Payment gateway returned an invalid checkout URL.', 502);
  }

  const createdAt = Date.now();
  const order: OrderRecord = {
    orderId,
    requestId,
    checkoutRef: payload.data.checkoutRef,
    checkoutUrl: validatedCheckoutUrl,
    expiresAtUtc: resolveOrderExpiresAtUtc(createdAt, payload.data.expiresAtUtc),
    fullName: trimmedName,
    phone: formattedDisplayPhone,
    phoneDialCode: dialCode,
    phoneNumber: fullPhoneNumber,
    email: trimmedEmail,
    tier,
    quantity: input.quantity,
    totalUgx,
    selectedMethodLabel,
    status: 'PENDING',
    createdAt,
    updatedAt: createdAt,
  };

  indexOrderRecord(order);
  savePersistedOrders();

  return {
    orderId: order.orderId,
    checkoutUrl: order.checkoutUrl,
    checkoutRef: order.checkoutRef,
    expiresAtUtc: order.expiresAtUtc,
    amountUgx: order.totalUgx,
    paymentMethods: supportedMethods,
  };
}

interface QueryStatusResponseData {
  checkoutRef?: string;
  status?: {
    finalStatus?: string;
    finalStatusDesc?: string;
  };
  credit?: PaymentCreditDetails;
}

function isValidBankRef(bankRef: string | undefined, checkoutRef: string): boolean {
  if (typeof bankRef !== 'string') return false;
  const trimmed = bankRef.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toUpperCase();
  if (normalized === checkoutRef.trim().toUpperCase()) return false;
  if (
    normalized === 'N/A' ||
    normalized === 'NA' ||
    normalized === 'NONE' ||
    normalized === 'NULL' ||
    normalized === '-' ||
    normalized === '0'
  ) {
    return false;
  }
  return true;
}

function dispatchTicketEmailIfNeeded(order: OrderRecord): void {
  const recipient = (order.email || '').trim();
  if (!recipient || order.emailSentAt || inFlightEmailOrderIds.has(order.orderId)) {
    return;
  }
  if (getEffectiveOrderStatus(order) !== 'SUCCESS') {
    return;
  }

  inFlightEmailOrderIds.add(order.orderId);
  void sendTicketConfirmationEmail(order)
    .then((result) => {
      if (result.sent) {
        order.emailSentAt = Date.now();
        order.emailSentTo = result.recipient || recipient;
        order.emailLastError = undefined;
        order.updatedAt = Date.now();
        indexOrderRecord(order);
        savePersistedOrders();
        console.info(`[checkout] Sent PDF e-ticket for ${order.orderId} to ${order.emailSentTo}`);
      } else if (result.error) {
        order.emailLastError = result.error;
        savePersistedOrders();
      }
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[checkout] Failed sending PDF e-ticket for ${order.orderId}:`, message);
      order.emailLastError = message;
      savePersistedOrders();
    })
    .finally(() => {
      inFlightEmailOrderIds.delete(order.orderId);
    });
}

export async function queryAndSyncOrderStatus(orderId: string): Promise<OrderRecord> {
  const order = ordersById.get(orderId);
  if (!order) {
    throw new CheckoutGatewayError('Order reference was not found or has expired.', 404, 'ORDER_NOT_FOUND');
  }

  if (
    order.status === 'SUCCESS' &&
    order.passCode &&
    order.hotelVoucherCode &&
    order.credit &&
    isValidBankRef(order.credit.bankRef, order.checkoutRef)
  ) {
    dispatchTicketEmailIfNeeded(order);
    return order;
  }

  const config = getGatewayConfig();
  let session = await authenticateMerchant(config);

  const queryData = {
    checkoutRef: order.checkoutRef,
  };

  const executeQuery = async (token: string) => {
    const security = await buildSignedSecurityFields(config, queryData);
    return callGatewayJson<QueryStatusResponseData>(
      config.apiBase,
      '/checkout-merchant/query-status',
      {
        method: 'POST',
        bearerToken: token,
        subscriptionKey: config.subscriptionKey,
        body: {
          data: queryData,
          hash: security.hash,
          challenge: security.challenge,
        },
      }
    );
  };

  let queryCall = await executeQuery(session.sessionToken);
  if (queryCall.httpStatus === 401) {
    session = await authenticateMerchant(config, true);
    queryCall = await executeQuery(session.sessionToken);
  }

  const { httpStatus, isJson, payload } = queryCall;
  if (!isJson || httpStatus >= 400 || payload.succeeded === false) {
    throw new CheckoutGatewayError(
      extractApiError(isJson ? payload : null, 'Unable to verify payment status with gateway.'),
      httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
    );
  }

  const finalStatus = payload.data?.status?.finalStatus?.trim().toUpperCase();
  const statusDesc =
    payload.data?.status?.finalStatusDesc || payload.message || payload.resultDesc || undefined;
  const credit = payload.data?.credit;
  const rawCreditAmount = credit?.amount as unknown;
  const creditAmount =
    typeof rawCreditAmount === 'number'
      ? rawCreditAmount
      : typeof rawCreditAmount === 'string' && rawCreditAmount.trim() !== ''
        ? Number(rawCreditAmount)
        : Number.NaN;
  const creditCurrency =
    typeof credit?.currency === 'string' ? credit.currency.trim().toUpperCase() : '';
  const bankRef = typeof credit?.bankRef === 'string' ? credit.bankRef.trim() : '';
  const externalRef = typeof credit?.externalRef === 'string' ? credit.externalRef.trim() : '';
  const hasValidBankRef = isValidBankRef(bankRef, order.checkoutRef);

  console.info(
    `[checkout] query-status ${orderId}: ${JSON.stringify({
      checkoutRef: order.checkoutRef,
      succeeded: payload.succeeded ?? null,
      resultCode: payload.resultCode ?? null,
      finalStatus: finalStatus || null,
      finalStatusDesc: statusDesc || null,
      credit: credit
        ? {
            bankRef: bankRef || null,
            externalRef: externalRef || null,
            paymentMethod: credit.paymentMethod || null,
            amount: Number.isFinite(creditAmount) ? creditAmount : null,
            currency: creditCurrency || null,
            accountCurrency: credit.accountCurrency || null,
            valueDate: credit.valueDate || null,
          }
        : null,
      extraKeys: payload.data ? Object.keys(payload.data) : [],
    })}`
  );

  if (finalStatus === 'SUCCESS') {
    if (!credit || !Number.isFinite(creditAmount) || creditAmount <= 0 || !hasValidBankRef) {
      console.warn(
        `[checkout] Order ${orderId} returned finalStatus=SUCCESS without verified bankRef settlement proof (checkoutRef=${order.checkoutRef}, bankRef=${bankRef || 'none'}, externalRef=${externalRef || 'none'}); keeping PENDING.`
      );
      order.status = 'PENDING';
      order.statusDescription =
        'Payment confirmation is still processing. Complete Mobile Money approval and verify again.';
    } else if (creditCurrency && creditCurrency !== 'UGX') {
      order.status = 'FAILED';
      order.statusDescription = 'Paid currency does not match UGX.';
    } else if (creditAmount < order.totalUgx) {
      order.status = 'FAILED';
      order.statusDescription = 'Paid amount does not match required pass total.';
    } else {
      const issuedHex = crypto.randomBytes(4).toString('hex').toUpperCase();
      if (!order.hotelVoucherCode) {
        order.hotelVoucherCode = `PROTEA50-${issuedHex}`;
      }
      if (!order.passCode) {
        order.passCode = `TC26-PASS-${issuedHex}`;
      }
      order.status = 'SUCCESS';
      order.statusDescription = statusDesc || 'Payment completed successfully';
      order.paidAt = order.paidAt || Date.now();
      order.credit = {
        ...credit,
        amount: creditAmount,
        bankRef,
        externalRef: externalRef || undefined,
      };
    }
  } else if (finalStatus === 'FAILED' || finalStatus === 'CANCELLED' || finalStatus === 'EXPIRED') {
    order.status = 'FAILED';
    order.statusDescription = statusDesc || 'Payment failed';
  } else {
    order.status = 'PENDING';
    order.statusDescription = statusDesc || 'Awaiting payment confirmation';
  }

  const parsedExpiryMs = order.expiresAtUtc ? Date.parse(order.expiresAtUtc) : Number.NaN;
  const ttlExpiryMs = order.createdAt + CHECKOUT_SESSION_TTL_MS;
  const effectiveExpiryMs = Number.isNaN(parsedExpiryMs)
    ? ttlExpiryMs
    : Math.min(parsedExpiryMs, ttlExpiryMs);

  if (order.status === 'PENDING' && Date.now() >= effectiveExpiryMs) {
    order.status = 'FAILED';
    order.statusDescription = 'Checkout session expired after 5 minutes without completed payment.';
  }

  order.updatedAt = Date.now();
  indexOrderRecord(order);
  savePersistedOrders();
  if (getEffectiveOrderStatus(order) === 'SUCCESS') {
    dispatchTicketEmailIfNeeded(order);
  }
  return order;
}

export async function handleGatewayCallback(body: unknown): Promise<void> {
  if (!body || typeof body !== 'object') return;
  const record = body as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : null;

  const checkoutRef =
    (typeof nestedData?.checkoutRef === 'string' && nestedData.checkoutRef) ||
    (typeof record.checkoutRef === 'string' && record.checkoutRef) ||
    '';

  if (!checkoutRef) return;
  const orderId = orderIdByCheckoutRef.get(checkoutRef);
  if (!orderId) return;

  // Always verify authoritatively with query-status before transitioning order state
  await queryAndSyncOrderStatus(orderId);
}

export function serializeOrderForClient(order: OrderRecord) {
  const isVerifiedPaid =
    order.status === 'SUCCESS' &&
    Boolean(order.passCode) &&
    Boolean(order.hotelVoucherCode) &&
    isValidBankRef(order.credit?.bankRef, order.checkoutRef);

  return {
    orderId: order.orderId,
    status: isVerifiedPaid ? 'SUCCESS' : order.status === 'FAILED' ? 'FAILED' : 'PENDING',
    statusDescription: order.statusDescription,
    checkoutUrl: order.status === 'PENDING' ? order.checkoutUrl : undefined,
    expiresAtUtc: order.expiresAtUtc,
    receipt: isVerifiedPaid
      ? {
          reference: order.orderId,
          passCode: order.passCode,
          hotelVoucherCode: order.hotelVoucherCode,
          fullName: order.fullName,
          phone: order.phone,
          email: order.email,
          tier: order.tier,
          quantity: order.quantity,
          totalUgx: order.totalUgx,
          paymentMethod: order.credit?.paymentMethod || order.selectedMethodLabel || 'Verified Checkout',
          bankRef: order.credit?.bankRef,
          externalRef: order.credit?.externalRef,
          valueDate: order.credit?.valueDate,
        }
      : undefined,
  };
}

export interface StaffOrderView {
  orderId: string;
  checkoutRef: string;
  passCode?: string;
  hotelVoucherCode?: string;
  fullName: string;
  phone?: string;
  email: string;
  tier: {
    id: string;
    name: string;
    guestsIncluded: number;
    priceUgx?: number;
  };
  quantity: number;
  patronsAdmitted: number;
  totalUgx?: number;
  status: OrderStatus;
  statusDescription?: string;
  paymentMethod?: string;
  bankRef?: string;
  externalRef?: string;
  creditAmount?: number;
  valueDate?: string;
  paidAt?: number;
  dateOfPayment?: string | number;
  checkedInAt?: number;
  checkedInBy?: StaffRole;
  emailSentAt?: number;
  emailSentTo?: string;
  emailLastError?: string;
  createdAt: number;
  updatedAt: number;
  expiresAtUtc: string;
}

export interface StaffOrdersSummary {
  totalOrders: number;
  successOrders: number;
  pendingOrders: number;
  failedOrders: number;
  checkedInOrders: number;
  verifiedPasses: number;
  verifiedPatrons: number;
  totalCollectedUgx?: number;
}

export interface StaffOrdersFilterOptions {
  status?: string;
  search?: string;
  tierId?: string;
  checkIn?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
}

function getEffectiveOrderStatus(order: OrderRecord): OrderStatus {
  const isVerifiedPaid =
    order.status === 'SUCCESS' &&
    Boolean(order.passCode) &&
    Boolean(order.hotelVoucherCode) &&
    isValidBankRef(order.credit?.bankRef, order.checkoutRef);

  if (isVerifiedPaid) return 'SUCCESS';
  if (order.status === 'FAILED') return 'FAILED';
  return 'PENDING';
}

function resolveDateOfPayment(order: OrderRecord, effectiveStatus: OrderStatus): string | number | undefined {
  if (effectiveStatus !== 'SUCCESS') return undefined;
  const rawValueDate = order.credit?.valueDate?.trim();
  if (rawValueDate) {
    // Prefer full timestamp when available, or fall back to paidAt if valueDate is date-only and paidAt exists
    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValueDate) && order.paidAt) {
      return order.paidAt;
    }
    return rawValueDate;
  }
  return order.paidAt ?? order.updatedAt;
}

function getKampalaDateKey(value: string | number): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) return null;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date(parsed));
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date(value));
  }
  return null;
}

export function serializeOrderForStaff(order: OrderRecord, role: StaffRole): StaffOrderView {
  const status = getEffectiveOrderStatus(order);
  const patronsAdmitted = order.tier.guestsIncluded * order.quantity;
  const paymentMethod = order.credit?.paymentMethod || order.selectedMethodLabel;
  const resolvedPaidAt = status === 'SUCCESS' ? (order.paidAt ?? order.updatedAt) : undefined;
  const dateOfPayment = resolveDateOfPayment(order, status);

  const base: StaffOrderView = {
    orderId: order.orderId,
    checkoutRef: order.checkoutRef,
    passCode: status === 'SUCCESS' ? order.passCode : undefined,
    hotelVoucherCode: status === 'SUCCESS' ? order.hotelVoucherCode : undefined,
    fullName: order.fullName,
    email: order.email,
    tier: {
      id: order.tier.id,
      name: order.tier.name,
      guestsIncluded: order.tier.guestsIncluded,
    },
    quantity: order.quantity,
    patronsAdmitted,
    status,
    statusDescription: order.statusDescription,
    paymentMethod,
    bankRef: order.credit?.bankRef,
    externalRef: order.credit?.externalRef,
    valueDate: order.credit?.valueDate,
    paidAt: resolvedPaidAt,
    dateOfPayment,
    checkedInAt: order.checkedInAt,
    checkedInBy: order.checkedInBy,
    emailSentAt: order.emailSentAt,
    emailSentTo: order.emailSentTo,
    emailLastError: order.emailLastError,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    expiresAtUtc: order.expiresAtUtc,
  };

  if (role === 'admin') {
    base.phone = order.phone;
    base.totalUgx = order.totalUgx;
    base.tier.priceUgx = order.tier.priceUgx;
    base.creditAmount = order.credit?.amount;
  }

  return base;
}

export function listOrdersForStaff(
  role: StaffRole,
  options?: StaffOrdersFilterOptions
): {
  summary: StaffOrdersSummary;
  orders: StaffOrderView[];
} {
  const all = Array.from(ordersById.values()).sort((a, b) => b.createdAt - a.createdAt);

  let successOrders = 0;
  let pendingOrders = 0;
  let failedOrders = 0;
  let checkedInOrders = 0;
  let verifiedPasses = 0;
  let verifiedPatrons = 0;
  let totalCollectedUgx = 0;

  for (const order of all) {
    const status = getEffectiveOrderStatus(order);
    if (status === 'SUCCESS') {
      successOrders += 1;
      verifiedPasses += order.quantity;
      verifiedPatrons += order.tier.guestsIncluded * order.quantity;
      totalCollectedUgx += order.totalUgx;
      if (order.checkedInAt) {
        checkedInOrders += 1;
      }
    } else if (status === 'FAILED') {
      failedOrders += 1;
    } else {
      pendingOrders += 1;
    }
  }

  const statusFilter = (options?.status || 'ALL').trim().toUpperCase();
  const tierFilter = (options?.tierId || 'ALL').trim().toLowerCase();
  const checkInFilter = (options?.checkIn || 'ALL').trim().toUpperCase();
  const methodFilter = (options?.paymentMethod || 'ALL').trim().toUpperCase();
  const rawDateFrom = (options?.dateFrom || '').trim();
  const rawDateTo = (options?.dateTo || '').trim();
  const dateFrom = /^\d{4}-\d{2}-\d{2}$/.test(rawDateFrom) ? rawDateFrom : '';
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(rawDateTo) ? rawDateTo : '';
  const query = (options?.search || '').trim().toLowerCase();

  const filtered = all.filter((order) => {
    const effectiveStatus = getEffectiveOrderStatus(order);
    if (statusFilter !== 'ALL' && effectiveStatus !== statusFilter) {
      return false;
    }

    if (tierFilter !== 'all' && order.tier.id.toLowerCase() !== tierFilter) {
      return false;
    }

    if (checkInFilter === 'CHECKED_IN' && !order.checkedInAt) {
      return false;
    }
    if (checkInFilter === 'NOT_CHECKED_IN' && Boolean(order.checkedInAt)) {
      return false;
    }

    if (methodFilter !== 'ALL') {
      const methodLabel = (order.credit?.paymentMethod || order.selectedMethodLabel || '').toUpperCase();
      if (methodFilter === 'MTN') {
        if (!methodLabel.includes('MTN')) return false;
      } else if (methodFilter === 'AIRTEL') {
        if (!methodLabel.includes('AIRTEL')) return false;
      } else if (!methodLabel.includes(methodFilter)) {
        return false;
      }
    }

    if (dateFrom || dateTo) {
      const dop = resolveDateOfPayment(order, effectiveStatus);
      const targetDate = dop ?? order.createdAt;
      const dayKey = getKampalaDateKey(targetDate);
      if (!dayKey) return false;
      if (dateFrom && dayKey < dateFrom) return false;
      if (dateTo && dayKey > dateTo) return false;
    }

    if (!query) return true;

    const searchableFields = [
      order.orderId,
      order.passCode || '',
      order.hotelVoucherCode || '',
      order.checkoutRef,
      order.fullName,
      order.email,
      order.tier.name,
      order.credit?.bankRef || '',
      order.credit?.externalRef || '',
      ...(role === 'admin' ? [order.phone, order.phoneNumber] : []),
    ];

    return searchableFields.some((value) => value.toLowerCase().includes(query));
  });

  const summary: StaffOrdersSummary = {
    totalOrders: all.length,
    successOrders,
    pendingOrders,
    failedOrders,
    checkedInOrders,
    verifiedPasses,
    verifiedPatrons,
  };

  if (role === 'admin') {
    summary.totalCollectedUgx = totalCollectedUgx;
  }

  return {
    summary,
    orders: filtered.map((order) => serializeOrderForStaff(order, role)),
  };
}

function findOrderByLookupToken(rawInput: string): OrderRecord | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const candidates = new Set<string>();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const key of ['passCode', 'ref', 'orderId', 'bankRef', 'checkoutRef']) {
        const val = parsed[key];
        if (typeof val === 'string' && val.trim()) {
          candidates.add(val.trim());
        }
      }
    } catch {
      // Treat as plain text token if invalid JSON
    }
  }
  candidates.add(trimmed);

  for (const candidate of candidates) {
    const upper = candidate.toUpperCase();
    const byId = ordersById.get(upper);
    if (byId) return byId;

    const idFromPass = orderIdByPassCode.get(upper);
    if (idFromPass) {
      const found = ordersById.get(idFromPass);
      if (found) return found;
    }

    const idFromCheckout = orderIdByCheckoutRef.get(candidate) || orderIdByCheckoutRef.get(upper);
    if (idFromCheckout) {
      const found = ordersById.get(idFromCheckout);
      if (found) return found;
    }

    for (const order of ordersById.values()) {
      if (
        order.credit?.bankRef?.trim().toUpperCase() === upper ||
        order.hotelVoucherCode?.trim().toUpperCase() === upper
      ) {
        return order;
      }
    }
  }

  return null;
}

export async function reverifyOrderForStaff(
  orderId: string,
  role: StaffRole
): Promise<StaffOrderView> {
  const normalized = orderId.trim().toUpperCase();
  const synced = await queryAndSyncOrderStatus(normalized);
  return serializeOrderForStaff(synced, role);
}

export async function verifyTicketForStaff(
  rawInput: string,
  role: StaffRole
): Promise<{
  found: boolean;
  verificationState: 'VALID' | 'ALREADY_CHECKED_IN' | 'PENDING' | 'FAILED' | 'NOT_FOUND';
  message: string;
  order?: StaffOrderView;
}> {
  let order = findOrderByLookupToken(rawInput);
  if (!order) {
    return {
      found: false,
      verificationState: 'NOT_FOUND',
      message: 'No ticket or checkout session matched that code.',
    };
  }

  if (getEffectiveOrderStatus(order) === 'PENDING') {
    try {
      order = await queryAndSyncOrderStatus(order.orderId);
    } catch {
      // Keep local state if gateway cannot be reached from current environment
    }
  }

  const effectiveStatus = getEffectiveOrderStatus(order);
  const view = serializeOrderForStaff(order, role);

  if (effectiveStatus === 'SUCCESS') {
    if (order.checkedInAt) {
      return {
        found: true,
        verificationState: 'ALREADY_CHECKED_IN',
        message: 'This pass is settled and has already been checked in at the gate.',
        order: view,
      };
    }
    return {
      found: true,
      verificationState: 'VALID',
      message: 'Payment settled and pass is valid for admission.',
      order: view,
    };
  }

  if (effectiveStatus === 'FAILED') {
    return {
      found: true,
      verificationState: 'FAILED',
      message: order.statusDescription || 'Payment failed or expired; pass is not valid for admission.',
      order: view,
    };
  }

  return {
    found: true,
    verificationState: 'PENDING',
    message: order.statusDescription || 'Payment has not settled yet; do not admit.',
    order: view,
  };
}

export function checkInOrderForStaff(orderId: string, role: StaffRole): StaffOrderView {
  const normalized = orderId.trim().toUpperCase();
  const order = ordersById.get(normalized);
  if (!order) {
    throw new CheckoutGatewayError('Ticket reference was not found.', 404, 'ORDER_NOT_FOUND');
  }

  const effectiveStatus = getEffectiveOrderStatus(order);
  if (effectiveStatus !== 'SUCCESS') {
    throw new CheckoutGatewayError(
      'Only settled (SUCCESS) passes can be checked in for admission.',
      400,
      'TICKET_NOT_SETTLED'
    );
  }

  if (order.checkedInAt) {
    throw new CheckoutGatewayError(
      'This pass has already been checked in.',
      409,
      'ALREADY_CHECKED_IN'
    );
  }

  order.checkedInAt = Date.now();
  order.checkedInBy = role;
  order.updatedAt = Date.now();
  indexOrderRecord(order);
  savePersistedOrders();
  return serializeOrderForStaff(order, role);
}

export async function resendTicketEmailForStaff(
  orderId: string,
  role: StaffRole,
  overrideEmail?: string
): Promise<{
  sent: boolean;
  recipient?: string;
  error?: string;
  order: StaffOrderView;
}> {
  const normalized = orderId.trim().toUpperCase();
  const order = ordersById.get(normalized);
  if (!order) {
    throw new CheckoutGatewayError('Order reference was not found.', 404, 'ORDER_NOT_FOUND');
  }

  if (getEffectiveOrderStatus(order) !== 'SUCCESS') {
    throw new CheckoutGatewayError(
      'E-tickets can only be emailed for settled (SUCCESS) passes.',
      400,
      'TICKET_NOT_SETTLED'
    );
  }

  if (typeof overrideEmail === 'string' && overrideEmail.trim()) {
    const cleaned = overrideEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) || /[\r\n]/.test(cleaned)) {
      throw new CheckoutGatewayError('Please provide a valid email address.', 400, 'INVALID_EMAIL');
    }
    order.email = cleaned;
  }

  const result = await sendTicketConfirmationEmail(order);
  if (result.sent) {
    order.emailSentAt = Date.now();
    order.emailSentTo = result.recipient;
    order.emailLastError = undefined;
  } else if (result.error) {
    order.emailLastError = result.error;
  }
  order.updatedAt = Date.now();
  indexOrderRecord(order);
  savePersistedOrders();

  return {
    ...result,
    order: serializeOrderForStaff(order, role),
  };
}
