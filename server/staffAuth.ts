import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request } from 'express';

export type StaffRole = 'admin' | 'accounts';

interface StoredRoleCredential {
  salt: string;
  hash: string;
  claimedAt: number;
}

interface StaffAuthStore {
  admin?: StoredRoleCredential;
  accounts?: StoredRoleCredential;
}

export interface StaffSessionClaims {
  role: StaffRole;
  iat: number;
  exp: number;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 12;

const SESSION_SIGNING_SECRET =
  (process.env.STAFF_SESSION_SECRET || '').trim() || crypto.randomBytes(32).toString('hex');

const loginAttemptsByIp = new Map<string, { count: number; windowStart: number }>();

function resolveDataDir(): string {
  const configured = (process.env.DATA_DIR || '').trim();
  return configured ? path.resolve(configured) : path.resolve(process.cwd(), '.data');
}

function getAuthStorePath(): string {
  return path.join(resolveDataDir(), 'staff-auth.json');
}

function readAuthStore(): StaffAuthStore {
  try {
    const filePath = getAuthStorePath();
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as StaffAuthStore;
  } catch {
    return {};
  }
}

function writeAuthStore(store: StaffAuthStore): void {
  const dir = resolveDataDir();
  const filePath = getAuthStorePath();
  fs.mkdirSync(dir, { recursive: true });
  const tempFile = `${filePath}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempFile, filePath);
}

function getEnvPasswordForRole(role: StaffRole): string {
  if (role === 'admin') {
    return (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSCODE || '').trim();
  }
  return (process.env.ACCOUNTS_PASSWORD || process.env.ACCOUNTS_PASSCODE || '').trim();
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function hashPasswordWithScrypt(password: string, saltHex?: string): { salt: string; hash: string } {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return { salt, hash: derived.toString('hex') };
}

function verifyScryptPassword(password: string, stored: StoredRoleCredential): boolean {
  try {
    const derived = crypto.scryptSync(password, Buffer.from(stored.salt, 'hex'), 64);
    const storedBuf = Buffer.from(stored.hash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export function isValidStaffRole(value: unknown): value is StaffRole {
  return value === 'admin' || value === 'accounts';
}

export function getStaffAuthStatus(): {
  adminConfigured: boolean;
  accountsConfigured: boolean;
} {
  const store = readAuthStore();
  return {
    adminConfigured: Boolean(getEnvPasswordForRole('admin') || store.admin?.hash),
    accountsConfigured: Boolean(getEnvPasswordForRole('accounts') || store.accounts?.hash),
  };
}

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = loginAttemptsByIp.get(key);
  if (!entry || now - entry.windowStart >= LOGIN_WINDOW_MS) {
    loginAttemptsByIp.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfterSeconds = Math.ceil((LOGIN_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }
  entry.count += 1;
  return { allowed: true };
}

export function resetLoginRateLimit(ip: string): void {
  if (ip) loginAttemptsByIp.delete(ip);
}

export function authenticateOrClaimStaffPassword(
  role: StaffRole,
  password: string
): {
  ok: boolean;
  claimed?: boolean;
  error?: string;
  status?: number;
} {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, error: 'Please enter a password.', status: 400 };
  }

  const envPassword = getEnvPasswordForRole(role);
  if (envPassword) {
    if (!timingSafeCompareStrings(trimmed, envPassword)) {
      return { ok: false, error: 'Invalid password.', status: 401 };
    }
    return { ok: true };
  }

  // Fallback for preview environments where env passcodes are not set yet:
  // allow a one-time server-hashed claim per role and lock once claimed.
  const store = readAuthStore();
  const existing = store[role];
  if (existing?.hash) {
    if (!verifyScryptPassword(trimmed, existing)) {
      return { ok: false, error: 'Invalid password.', status: 401 };
    }
    return { ok: true };
  }

  if (trimmed.length < 6) {
    return {
      ok: false,
      error: 'Initial password must be at least 6 characters.',
      status: 400,
    };
  }

  const created = hashPasswordWithScrypt(trimmed);
  store[role] = {
    salt: created.salt,
    hash: created.hash,
    claimedAt: Date.now(),
  };
  writeAuthStore(store);
  return { ok: true, claimed: true };
}

export function issueStaffToken(role: StaffRole): {
  token: string;
  role: StaffRole;
  expiresAt: number;
} {
  const iat = Date.now();
  const exp = iat + SESSION_TTL_MS;
  const payload: StaffSessionClaims = { role, iat, exp };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(encodedPayload, 'utf8')
    .digest('base64url');
  return {
    token: `${encodedPayload}.${signature}`,
    role,
    expiresAt: exp,
  };
}

export function verifyStaffToken(token: string): StaffSessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(encodedPayload, 'utf8')
    .digest('base64url');

  const sigA = Buffer.from(providedSig, 'utf8');
  const sigB = Buffer.from(expectedSig, 'utf8');
  if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<StaffSessionClaims>;
    if (
      !isValidStaffRole(decoded.role) ||
      typeof decoded.exp !== 'number' ||
      typeof decoded.iat !== 'number'
    ) {
      return null;
    }
    if (Date.now() >= decoded.exp) {
      return null;
    }
    return { role: decoded.role, iat: decoded.iat, exp: decoded.exp };
  } catch {
    return null;
  }
}

export function authenticateStaffRequest(req: Request): StaffSessionClaims | null {
  const authHeader = req.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  return verifyStaffToken(token);
}
