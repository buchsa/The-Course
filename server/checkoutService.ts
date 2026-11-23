import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EVENT_INFO, TICKET_TIERS, type TicketTier } from '../src/data/eventData.ts';

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
  hotelVoucherCode: string;
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
  merchantCodeOverride?: string;
}

const REQUEST_TIMEOUT_MS = 20_000;
const SESSION_EXPIRY_BUFFER_MS = 60_000;
const ORDERS_DATA_DIR = path.resolve(process.cwd(), '.data');
const ORDERS_FILE_PATH = path.join(ORDERS_DATA_DIR, 'orders.json');

let cachedAuthSession: AuthSession | null = null;
let inFlightAuthPromise: Promise<AuthSession> | null = null;

const ordersById = new Map<string, OrderRecord>();
const orderIdByCheckoutRef = new Map<string, string>();

function loadPersistedOrders(): void {
  try {
    if (!fs.existsSync(ORDERS_FILE_PATH)) return;
    const raw = fs.readFileSync(ORDERS_FILE_PATH, 'utf8');
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return;

    for (const item of parsed) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as OrderRecord).orderId === 'string' &&
        typeof (item as OrderRecord).checkoutRef === 'string'
      ) {
        const record = item as OrderRecord;
        ordersById.set(record.orderId, record);
        orderIdByCheckoutRef.set(record.checkoutRef, record.orderId);
      }
    }
  } catch (err) {
    console.warn('Unable to load persisted checkout orders:', err instanceof Error ? err.message : err);
  }
}

function savePersistedOrders(): void {
  try {
    fs.mkdirSync(ORDERS_DATA_DIR, { recursive: true });
    const allOrders = Array.from(ordersById.values()).slice(-500);
    const tempFile = `${ORDERS_FILE_PATH}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(allOrders, null, 2), 'utf8');
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
  const merchantCodeOverride = (
    process.env.RONFORD_MERCHANT_CODE ||
    process.env.CHECKOUT_MERCHANT_CODE ||
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
    merchantCodeOverride: merchantCodeOverride || undefined,
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
  }
): Promise<{ httpStatus: number; payload: RonfordApiEnvelope<T> }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
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
  let parsed: RonfordApiEnvelope<T>;
  try {
    parsed = rawText ? (JSON.parse(rawText) as RonfordApiEnvelope<T>) : {};
  } catch {
    throw new CheckoutGatewayError(
      `Payment gateway returned an unexpected response (HTTP ${response.status}).`,
      502,
      'INVALID_GATEWAY_RESPONSE'
    );
  }

  return { httpStatus: response.status, payload: parsed };
}

async function retrieveInitData(apiBase: string): Promise<InitDataPayload> {
  const { httpStatus, payload } = await callGatewayJson<InitDataPayload>(
    apiBase,
    '/test/retrieve-init-data',
    { method: 'GET' }
  );

  if (httpStatus >= 400 || !payload.succeeded || !payload.data?.publicKey || !payload.data?.iv) {
    throw new CheckoutGatewayError(
      extractApiError(payload, 'Failed to retrieve payment security initialization data.'),
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
  const { httpStatus, payload } = await callGatewayJson<string>(
    config.apiBase,
    '/test/asymmetric-encrypt',
    {
      method: 'POST',
      body: plaintext,
    }
  );

  if (httpStatus < 400 && payload.succeeded && typeof payload.data === 'string' && payload.data) {
    return payload.data;
  }

  // Fallback to local RSA encryption if the helper endpoint is disabled on live environment
  if (httpStatus === 404 || httpStatus === 405 || httpStatus === 403) {
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
    extractApiError(payload, 'Failed to generate security challenge.'),
    httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
  );
}

async function generateHash(
  config: GatewayConfig,
  requestData: Record<string, unknown>
): Promise<string> {
  const { httpStatus, payload } = await callGatewayJson<string>(config.apiBase, '/test/hash', {
    method: 'POST',
    body: {
      key: config.secretKey,
      data: requestData,
    },
  });

  if (httpStatus < 400 && payload.succeeded && typeof payload.data === 'string' && payload.data) {
    return payload.data;
  }

  // Fallback per section 4.1: "{jsonString}{secretKey}" SHA-256
  if (httpStatus === 404 || httpStatus === 405 || httpStatus === 403) {
    return crypto
      .createHash('sha256')
      .update(`${JSON.stringify(requestData)}${config.secretKey}`, 'utf8')
      .digest('hex');
  }

  throw new CheckoutGatewayError(
    extractApiError(payload, 'Failed to generate request signature hash.'),
    httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
  );
}

function isSessionFresh(session: AuthSession | null): session is AuthSession {
  if (!session?.sessionToken) return false;
  const expiryMs = Date.parse(session.sessionExpiryUtc);
  if (Number.isNaN(expiryMs)) return false;
  return expiryMs - Date.now() > SESSION_EXPIRY_BUFFER_MS;
}

async function authenticateMerchant(config: GatewayConfig, forceRefresh = false): Promise<AuthSession> {
  if (!forceRefresh && isSessionFresh(cachedAuthSession)) {
    return cachedAuthSession;
  }

  if (!forceRefresh && inFlightAuthPromise) {
    return inFlightAuthPromise;
  }

  inFlightAuthPromise = (async () => {
    const initData = await retrieveInitData(config.apiBase);
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
  const initData = await retrieveInitData(config.apiBase);
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
    const session = await authenticateMerchant(config);
    return {
      configured: true,
      merchantName: session.merchantName,
      paymentMethods: Array.isArray(session.paymentMethods) ? session.paymentMethods : [],
    };
  } catch {
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
  const hotelVoucherCode = `PROTEA50-${shortHex}`;
  const requestId = crypto.randomUUID();

  let session = await authenticateMerchant(config);

  const merchantCode =
    config.merchantCodeOverride ||
    session.merchantCodes?.[0]?.code ||
    '000001';

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
  const encodedOrderId = encodeURIComponent(orderId);

  const paymentData: Record<string, unknown> = {
    requestId,
    merchantCode,
    amount: String(totalUgx),
    currency: 'UGX',
    successRedirectUrl: `${origin}/payment/success?orderId=${encodedOrderId}`,
    failedRedirectUrl: `${origin}/payment/failed?orderId=${encodedOrderId}`,
    errorRedirectUrl: `${origin}/payment/error?orderId=${encodedOrderId}`,
    callbackUrl: `${origin}/api/checkout/callback`,
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

  const order: OrderRecord = {
    orderId,
    requestId,
    checkoutRef: payload.data.checkoutRef,
    checkoutUrl: validatedCheckoutUrl,
    expiresAtUtc: payload.data.expiresAtUtc || '',
    hotelVoucherCode,
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
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  ordersById.set(order.orderId, order);
  orderIdByCheckoutRef.set(order.checkoutRef, order.orderId);
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

export async function queryAndSyncOrderStatus(orderId: string): Promise<OrderRecord> {
  const order = ordersById.get(orderId);
  if (!order) {
    throw new CheckoutGatewayError('Order reference was not found or has expired.', 404, 'ORDER_NOT_FOUND');
  }

  if (order.status === 'SUCCESS') {
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

  const { httpStatus, payload } = queryCall;
  if (httpStatus >= 400) {
    throw new CheckoutGatewayError(
      extractApiError(payload, 'Unable to verify payment status with gateway.'),
      httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502
    );
  }

  const finalStatus = payload.data?.status?.finalStatus?.toUpperCase();
  const statusDesc =
    payload.data?.status?.finalStatusDesc || payload.message || payload.resultDesc || undefined;

  if (finalStatus === 'SUCCESS') {
    const creditAmount = payload.data?.credit?.amount;
    if (typeof creditAmount === 'number' && creditAmount < order.totalUgx) {
      order.status = 'FAILED';
      order.statusDescription = 'Paid amount does not match required pass total.';
    } else {
      order.status = 'SUCCESS';
      order.statusDescription = statusDesc || 'Payment completed successfully';
      order.credit = payload.data?.credit;
    }
  } else if (finalStatus === 'FAILED' || finalStatus === 'CANCELLED' || finalStatus === 'EXPIRED') {
    order.status = 'FAILED';
    order.statusDescription = statusDesc || 'Payment failed';
  } else {
    order.status = 'PENDING';
    order.statusDescription = statusDesc || 'Awaiting payment confirmation';
  }

  order.updatedAt = Date.now();
  savePersistedOrders();
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
  return {
    orderId: order.orderId,
    status: order.status,
    statusDescription: order.statusDescription,
    checkoutUrl: order.status === 'PENDING' ? order.checkoutUrl : undefined,
    expiresAtUtc: order.expiresAtUtc,
    receipt:
      order.status === 'SUCCESS'
        ? {
            reference: order.orderId,
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
