import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  ScanLine,
  Search,
  ShieldCheck,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { formatUgx } from '../data/eventData';

const apiUrl = (path: string) => path;

type StaffRole = 'admin' | 'accounts';
type OrderStatusFilter = 'ALL' | 'SUCCESS' | 'PENDING' | 'FAILED';
type TicketTypeFilter = 'ALL' | 'solo' | 'duo';
type CheckInFilter = 'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN';
type PaymentMethodFilter = 'ALL' | 'MTN' | 'AIRTEL';

interface OrdersFilterParams {
  status: OrderStatusFilter;
  search: string;
  tierId: TicketTypeFilter;
  checkIn: CheckInFilter;
  paymentMethod: PaymentMethodFilter;
  dateFrom: string;
  dateTo: string;
}

interface StaffOrderView {
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
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
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

interface StaffOrdersSummary {
  totalOrders: number;
  successOrders: number;
  pendingOrders: number;
  failedOrders: number;
  checkedInOrders: number;
  verifiedPasses: number;
  verifiedPatrons: number;
  totalCollectedUgx?: number;
}

interface TicketVerificationResult {
  found: boolean;
  verificationState: 'VALID' | 'ALREADY_CHECKED_IN' | 'PENDING' | 'FAILED' | 'NOT_FOUND';
  message: string;
  order?: StaffOrderView;
}

interface HostPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function escapeCsvCell(value: string | number | undefined | null): string {
  const raw = value === undefined || value === null ? '' : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatDateTime(ms?: number | string): string {
  if (!ms) return '—';
  const parsed = typeof ms === 'number' ? new Date(ms) : new Date(ms);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDateOfPayment(order: StaffOrderView): string {
  if (order.status !== 'SUCCESS') return 'Unpaid';
  const value = order.dateOfPayment ?? order.paidAt ?? order.valueDate;
  if (!value) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const parsed = new Date(`${value.trim()}T00:00:00+03:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-UG', { dateStyle: 'medium' });
    }
  }
  return formatDateTime(value);
}

export function HostPortalModal({ isOpen, onClose }: HostPortalModalProps) {
  const [selectedRole, setSelectedRole] = useState<StaffRole | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authConfig, setAuthConfig] = useState<{
    adminConfigured: boolean;
    accountsConfigured: boolean;
  } | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Kept strictly in React memory (never localStorage/sessionStorage)
  const [session, setSession] = useState<{
    token: string;
    role: StaffRole;
    expiresAt: number;
  } | null>(null);

  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('ALL');
  const [tierFilter, setTierFilter] = useState<TicketTypeFilter>('ALL');
  const [checkInFilter, setCheckInFilter] = useState<CheckInFilter>('ALL');
  const [methodFilter, setMethodFilter] = useState<PaymentMethodFilter>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [summary, setSummary] = useState<StaffOrdersSummary | null>(null);
  const [orders, setOrders] = useState<StaffOrderView[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  // Ticket verification state
  const [verifyCode, setVerifyCode] = useState('');
  const [isVerifyingTicket, setIsVerifyingTicket] = useState(false);
  const [verificationResult, setVerificationResult] = useState<TicketVerificationResult | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isScanningQr, setIsScanningQr] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const stopQrScanner = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setIsScanningQr(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopQrScanner();
      return;
    }
    fetch(apiUrl('/api/staff/config'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.adminConfigured === 'boolean') {
          setAuthConfig(data);
        }
      })
      .catch(() => {
        // Non-blocking
      });
  }, [isOpen, stopQrScanner]);

  useEffect(() => {
    return () => {
      stopQrScanner();
    };
  }, [stopQrScanner]);

  const fetchOrders = useCallback(async (activeToken: string, filters: OrdersFilterParams) => {
    setIsLoadingOrders(true);
    setPortalError(null);
    try {
      const params = new URLSearchParams({
        status: filters.status,
        search: filters.search,
        tierId: filters.tierId,
        checkIn: filters.checkIn,
        paymentMethod: filters.paymentMethod,
      });
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.set('dateTo', filters.dateTo);

      const response = await fetch(apiUrl(`/api/staff/orders?${params.toString()}`), {
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
      });
      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

      if (response.status === 401) {
        setSession(null);
        setLoginError('Session expired. Please sign in again.');
        return;
      }
      if (!response.ok) {
        setPortalError(
          typeof data.error === 'string' ? data.error : 'Unable to load ticket orders.'
        );
        return;
      }

      setSummary((data.summary as StaffOrdersSummary) || null);
      setOrders(Array.isArray(data.orders) ? (data.orders as StaffOrderView[]) : []);
    } catch {
      setPortalError('Network error while loading orders.');
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && session) {
      void fetchOrders(session.token, {
        status: statusFilter,
        search: searchQuery,
        tierId: tierFilter,
        checkIn: checkInFilter,
        paymentMethod: methodFilter,
        dateFrom,
        dateTo,
      });
    }
  }, [
    isOpen,
    session,
    statusFilter,
    tierFilter,
    checkInFilter,
    methodFilter,
    dateFrom,
    dateTo,
    searchQuery,
    fetchOrders,
  ]);

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRole || isLoggingIn) return;
    setLoginError(null);
    setIsLoggingIn(true);

    try {
      const response = await fetch(apiUrl('/api/staff/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: selectedRole, password }),
      });
      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

      if (!response.ok || typeof data.token !== 'string') {
        setLoginError(typeof data.error === 'string' ? data.error : 'Invalid login credentials.');
        return;
      }

      setSession({
        token: data.token,
        role: (data.role as StaffRole) || selectedRole,
        expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : Date.now() + 8 * 3600 * 1000,
      });
      setPassword('');
      setLoginError(null);
      setVerificationResult(null);
      setVerifyCode('');
      if (data.claimed) {
        setAuthConfig((prev) => ({
          adminConfigured: selectedRole === 'admin' ? true : prev?.adminConfigured ?? false,
          accountsConfigured: selectedRole === 'accounts' ? true : prev?.accountsConfigured ?? false,
        }));
      }
    } catch {
      setLoginError('Network error while signing in.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const refreshActiveOrders = useCallback(
    (activeToken: string) => {
      void fetchOrders(activeToken, {
        status: statusFilter,
        search: searchQuery,
        tierId: tierFilter,
        checkIn: checkInFilter,
        paymentMethod: methodFilter,
        dateFrom,
        dateTo,
      });
    },
    [statusFilter, searchQuery, tierFilter, checkInFilter, methodFilter, dateFrom, dateTo, fetchOrders]
  );

  const handleClearFilters = () => {
    setStatusFilter('ALL');
    setTierFilter('ALL');
    setCheckInFilter('ALL');
    setMethodFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
  };

  const handleSignOut = () => {
    stopQrScanner();
    setSession(null);
    setSelectedRole(null);
    setPassword('');
    setOrders([]);
    setSummary(null);
    setVerificationResult(null);
    setVerifyCode('');
    setPortalError(null);
    handleClearFilters();
  };

  const handleVerifyTicket = async (codeOverride?: string) => {
    if (!session) return;
    const codeToCheck = (codeOverride ?? verifyCode).trim();
    if (!codeToCheck) {
      setVerifyError('Enter or scan a Gate Pass QR, pass code, or order ID.');
      return;
    }

    setVerifyError(null);
    setIsVerifyingTicket(true);
    try {
      const response = await fetch(apiUrl('/api/staff/verify-ticket'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ code: codeToCheck }),
      });
      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

      if (response.status === 401) {
        setSession(null);
        setLoginError('Session expired. Please sign in again.');
        return;
      }
      if (!response.ok) {
        setVerifyError(typeof data.error === 'string' ? data.error : 'Verification failed.');
        return;
      }

      const result = data as unknown as TicketVerificationResult;
      setVerificationResult(result);
      if (result.order) {
        refreshActiveOrders(session.token);
      }
    } catch {
      setVerifyError('Network error while verifying ticket.');
    } finally {
      setIsVerifyingTicket(false);
    }
  };

  const handleReverifyOrder = async (orderId: string) => {
    if (!session) return;
    setBusyOrderId(orderId);
    setPortalError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/staff/orders/${encodeURIComponent(orderId)}/reverify`),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        }
      );
      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

      if (response.status === 401) {
        setSession(null);
        setLoginError('Session expired. Please sign in again.');
        return;
      }
      if (!response.ok) {
        setPortalError(
          typeof data.error === 'string' ? data.error : 'Unable to re-verify order with NCBA.'
        );
        return;
      }

      const updated = data.order as StaffOrderView | undefined;
      if (updated) {
        if (verificationResult?.order?.orderId === updated.orderId) {
          void handleVerifyTicket(updated.orderId);
        }
        refreshActiveOrders(session.token);
      }
    } catch {
      setPortalError('Network error while re-verifying order.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCheckInOrder = async (orderId: string) => {
    if (!session) return;
    setBusyOrderId(orderId);
    setPortalError(null);
    setVerifyError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/staff/orders/${encodeURIComponent(orderId)}/check-in`),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
        }
      );
      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

      if (response.status === 401) {
        setSession(null);
        setLoginError('Session expired. Please sign in again.');
        return;
      }
      if (!response.ok) {
        setPortalError(typeof data.error === 'string' ? data.error : 'Unable to admit pass.');
        return;
      }

      const updated = data.order as StaffOrderView | undefined;
      if (updated && verificationResult?.order?.orderId === updated.orderId) {
        setVerificationResult({
          found: true,
          verificationState: 'ALREADY_CHECKED_IN',
          message: 'Checked in and admitted at the gate.',
          order: updated,
        });
      }
      refreshActiveOrders(session.token);
    } catch {
      setPortalError('Network error while checking in pass.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleResendEmail = async (orderId: string) => {
    if (!session) return;
    setBusyOrderId(orderId);
    setPortalError(null);
    try {
      const response = await fetch(
        apiUrl(`/api/staff/orders/${encodeURIComponent(orderId)}/resend-email`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({}),
        }
      );
      const rawText = await response.text();
      const data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};

      if (response.status === 401) {
        setSession(null);
        setLoginError('Session expired. Please sign in again.');
        return;
      }
      if (!response.ok) {
        setPortalError(
          typeof data.error === 'string' ? data.error : 'Unable to send e-ticket email.'
        );
        return;
      }
      if (data.sent === false && typeof data.error === 'string') {
        setPortalError(data.error);
      }
      refreshActiveOrders(session.token);
    } catch {
      setPortalError('Network error while sending e-ticket email.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleStartQrScan = async () => {
    setVerifyError(null);
    if (isScanningQr) {
      stopQrScanner();
      return;
    }

    const DetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts?: { formats: string[] }) => {
          detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
        };
      }
    ).BarcodeDetector;

    if (!DetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setVerifyError(
        'Camera QR scanning is not supported on this browser. Paste the QR text or type the Pass Code / Order ID instead.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setIsScanningQr(true);
      const detector = new DetectorCtor({ formats: ['qr_code'] });

      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 50);

      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes.find((c) => typeof c.rawValue === 'string' && c.rawValue.trim())?.rawValue;
          if (raw) {
            stopQrScanner();
            setVerifyCode(raw);
            void handleVerifyTicket(raw);
          }
        } catch {
          // Ignore single frame detection error
        }
      }, 350);
    } catch {
      stopQrScanner();
      setVerifyError('Unable to access camera. Allow camera permission or type the Pass Code manually.');
    }
  };

  const handleExportCsv = () => {
    if (!session || orders.length === 0) return;
    const isAdmin = session.role === 'admin';
    const headers = isAdmin
      ? [
          'Order ID',
          'Pass Code',
          'Hotel Voucher',
          'Status',
          'Patron Name',
          'Phone Number',
          'Email',
          'Ticket Type',
          'Quantity',
          'Patrons Admitted',
          'Total UGX',
          'Payment Method',
          'Bank Ref',
          'Checkout Ref',
          'D.o.P (Date of Payment)',
          'Checked In At',
          'Checked In By',
          'Created At',
          'Status Note',
        ]
      : [
          'Order ID',
          'Pass Code',
          'Hotel Voucher',
          'Status',
          'Patron Name',
          'Email',
          'Ticket Type',
          'Quantity',
          'Patrons Admitted',
          'Payment Method',
          'Bank Ref',
          'Checkout Ref',
          'D.o.P (Date of Payment)',
          'Checked In At',
          'Checked In By',
          'Created At',
          'Status Note',
        ];

    const rows = orders.map((order) => {
      const dopCell =
        order.status === 'SUCCESS' ? formatDateOfPayment(order) : 'Unpaid';
      const base = isAdmin
        ? [
            order.orderId,
            order.passCode || '',
            order.hotelVoucherCode || '',
            order.status,
            order.fullName,
            order.phone || '',
            order.email || '',
            order.tier.name,
            order.quantity,
            order.patronsAdmitted,
            order.totalUgx ?? '',
            order.paymentMethod || '',
            order.bankRef || '',
            order.checkoutRef,
            dopCell,
            order.checkedInAt ? new Date(order.checkedInAt).toISOString() : '',
            order.checkedInBy || '',
            new Date(order.createdAt).toISOString(),
            order.statusDescription || '',
          ]
        : [
            order.orderId,
            order.passCode || '',
            order.hotelVoucherCode || '',
            order.status,
            order.fullName,
            order.email || '',
            order.tier.name,
            order.quantity,
            order.patronsAdmitted,
            order.paymentMethod || '',
            order.bankRef || '',
            order.checkoutRef,
            dopCell,
            order.checkedInAt ? new Date(order.checkedInAt).toISOString() : '',
            order.checkedInBy || '',
            new Date(order.createdAt).toISOString(),
            order.statusDescription || '',
          ];
      return base.map(escapeCsvCell).join(',');
    });

    const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `the-course-${session.role}-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    tierFilter !== 'ALL' ||
    checkInFilter !== 'ALL' ||
    methodFilter !== 'ALL' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(searchQuery.trim());

  const selectedRoleNeedsClaim =
    selectedRole === 'admin'
      ? authConfig?.adminConfigured === false
      : selectedRole === 'accounts'
        ? authConfig?.accountsConfigured === false
        : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Host Login and Verification Portal"
      className="fixed inset-0 z-50 bg-[#0E3B24]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:hidden"
    >
      <div
        className={`w-full bg-[#FAF8F3] rounded-2xl border border-[#0E3B24]/20 shadow-2xl overflow-hidden ${
          session ? 'max-w-6xl max-h-[92vh] flex flex-col' : 'max-w-md'
        }`}
      >
        {/* Top Modal Bar */}
        <div className="px-5 py-4 bg-[#0E3B24] text-[#FAF8F3] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#E2CB7A]" aria-hidden="true" />
            <div>
              <h2 className="font-serif text-lg font-semibold text-white leading-tight">
                {session
                  ? session.role === 'admin'
                    ? 'Host Portal · Admin'
                    : 'Host Portal · Accounts & Ticket Verification'
                  : 'Host Login'}
              </h2>
              <p className="text-[11px] text-[#E2CB7A]/90">
                {session
                  ? session.role === 'admin'
                    ? 'Full payments ledger, phone numbers, cash totals & gate verification'
                    : 'Ticket verification, gate check-in & payment status (phone & cash totals hidden)'
                  : 'Select your staff role to continue'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {session && (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Host Login"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Unauthenticated: 2 Button Role Selector + Password Form */}
        {!session && (
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#0E3B24]/75">
                Choose Role
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole('admin');
                    setPassword('');
                    setLoginError(null);
                  }}
                  aria-pressed={selectedRole === 'admin'}
                  className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-xl border text-center transition-colors cursor-pointer ${
                    selectedRole === 'admin'
                      ? 'border-[#0E3B24] bg-[#0E3B24] text-[#FAF8F3]'
                      : 'border-[#0E3B24]/20 bg-white text-[#0E3B24] hover:border-[#0E3B24]/50'
                  }`}
                >
                  <ShieldCheck className="w-5 h-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedRole('accounts');
                    setPassword('');
                    setLoginError(null);
                  }}
                  aria-pressed={selectedRole === 'accounts'}
                  className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-xl border text-center transition-colors cursor-pointer ${
                    selectedRole === 'accounts'
                      ? 'border-[#0E3B24] bg-[#0E3B24] text-[#FAF8F3]'
                      : 'border-[#0E3B24]/20 bg-white text-[#0E3B24] hover:border-[#0E3B24]/50'
                  }`}
                >
                  <UserCheck className="w-5 h-5" aria-hidden="true" />
                  <span className="text-sm font-semibold">Accounts</span>
                </button>
              </div>
            </div>

            {selectedRole && (
              <form onSubmit={handleLoginSubmit} className="space-y-4 pt-2 border-t border-[#0E3B24]/10">
                <div>
                  <label
                    htmlFor="host-login-password"
                    className="block text-sm font-medium text-[#111D15] mb-1.5"
                  >
                    {selectedRole === 'admin' ? 'Admin Password' : 'Accounts Password'}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="w-4 h-4 text-[#0E3B24]/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="host-login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoFocus
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (loginError) setLoginError(null);
                      }}
                      placeholder={`Enter ${selectedRole} password`}
                      className="w-full h-11 pl-10 pr-10 rounded-lg border border-[#0E3B24]/25 bg-white text-sm text-[#111D15] placeholder:text-[#111D15]/40 focus:outline-none focus:border-[#0E3B24] focus:ring-2 focus:ring-[#0E3B24]/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#0E3B24]/60 hover:text-[#0E3B24] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {selectedRoleNeedsClaim && (
                    <p className="mt-1.5 text-xs text-[#0E3B24]/75">
                      No environment passcode detected yet. Enter a password (6+ characters) to set
                      the initial {selectedRole} passcode, or set{' '}
                      <span className="font-mono">
                        {selectedRole === 'admin' ? 'ADMIN_PASSWORD' : 'ACCOUNTS_PASSWORD'}
                      </span>{' '}
                      in Hostinger environment variables.
                    </p>
                  )}
                </div>

                {loginError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900"
                  >
                    <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <p>{loginError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full h-11 rounded-xl bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-sm font-semibold transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isLoggingIn
                    ? 'Verifying...'
                    : `Sign In as ${selectedRole === 'admin' ? 'Admin' : 'Accounts'}`}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Authenticated Admin / Accounts Portal */}
        {session && (
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {/* Summary Strip */}
            {summary && (
              <div
                className={`grid grid-cols-2 sm:grid-cols-3 ${
                  session.role === 'admin' ? 'lg:grid-cols-6' : 'lg:grid-cols-5'
                } gap-3`}
              >
                <div className="bg-white rounded-xl border border-[#0E3B24]/15 p-3">
                  <p className="text-[11px] font-medium text-[#111D15]/60">Total Orders</p>
                  <p className="font-mono tabular-nums text-xl font-bold text-[#0E3B24] mt-0.5">
                    {summary.totalOrders}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-emerald-700/20 p-3">
                  <p className="text-[11px] font-medium text-emerald-800">Settled Passes</p>
                  <p className="font-mono tabular-nums text-xl font-bold text-emerald-700 mt-0.5">
                    {summary.successOrders}
                  </p>
                  <p className="text-[11px] text-[#111D15]/60 font-mono tabular-nums">
                    {summary.verifiedPatrons} patrons
                  </p>
                </div>
                {session.role === 'admin' && (
                  <div className="bg-[#0E3B24] text-white rounded-xl border border-[#C5A246]/40 p-3">
                    <p className="text-[11px] font-medium text-[#E2CB7A]">Settled Cash</p>
                    <p className="font-mono tabular-nums text-base sm:text-lg font-bold text-white mt-0.5">
                      {formatUgx(summary.totalCollectedUgx ?? 0)}
                    </p>
                  </div>
                )}
                <div className="bg-white rounded-xl border border-amber-700/20 p-3">
                  <p className="text-[11px] font-medium text-amber-800">Pending</p>
                  <p className="font-mono tabular-nums text-xl font-bold text-amber-700 mt-0.5">
                    {summary.pendingOrders}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-red-700/20 p-3">
                  <p className="text-[11px] font-medium text-red-800">Failed / Expired</p>
                  <p className="font-mono tabular-nums text-xl font-bold text-red-700 mt-0.5">
                    {summary.failedOrders}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-[#0E3B24]/15 p-3">
                  <p className="text-[11px] font-medium text-[#111D15]/60">Checked In</p>
                  <p className="font-mono tabular-nums text-xl font-bold text-[#0E3B24] mt-0.5">
                    {summary.checkedInOrders}
                  </p>
                </div>
              </div>
            )}

            {/* Ticket Verification Panel (Primary workflow for Accounts, also available to Admin) */}
            <div className="bg-white rounded-2xl border border-[#0E3B24]/15 p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#0E3B24] flex items-center gap-2">
                    <ScanLine className="w-4 h-4" aria-hidden="true" />
                    <span>Ticket Verification & Gate Check-In</span>
                  </h3>
                  <p className="text-xs text-[#111D15]/65">
                    Scan Gate Pass QR or enter Pass Code (TC26-PASS-...), Order ID (TC-2026-...), or Bank Ref.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStartQrScan}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#0E3B24]/25 bg-[#FAF8F3] hover:bg-[#0E3B24]/5 text-xs font-medium text-[#0E3B24] cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isScanningQr ? 'Stop Camera' : 'Scan QR'}</span>
                </button>
              </div>

              {isScanningQr && (
                <div className="rounded-xl overflow-hidden border border-[#0E3B24]/20 bg-black max-w-sm">
                  <video ref={videoRef} playsInline muted className="w-full h-48 object-cover" />
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleVerifyTicket();
                }}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <input
                  type="text"
                  value={verifyCode}
                  onChange={(e) => {
                    setVerifyCode(e.target.value);
                    if (verifyError) setVerifyError(null);
                  }}
                  placeholder="Paste QR payload or type TC26-PASS-..., TC-2026-..., or Bank Ref"
                  className="flex-1 h-10 px-3.5 rounded-lg border border-[#0E3B24]/25 bg-[#FAF8F3]/50 font-mono text-xs sm:text-sm text-[#111D15] focus:outline-none focus:border-[#0E3B24]"
                />
                <button
                  type="submit"
                  disabled={isVerifyingTicket}
                  className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-[#0E3B24] hover:bg-[#134d30] text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                  <span>{isVerifyingTicket ? 'Verifying...' : 'Verify Ticket'}</span>
                </button>
              </form>

              {verifyError && (
                <p className="text-xs font-medium text-red-700" role="alert">
                  {verifyError}
                </p>
              )}

              {verificationResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    verificationResult.verificationState === 'VALID'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : verificationResult.verificationState === 'ALREADY_CHECKED_IN' ||
                          verificationResult.verificationState === 'PENDING'
                        ? 'bg-amber-50 border-amber-300 text-amber-950'
                        : 'bg-red-50 border-red-300 text-red-950'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold text-sm">
                        {verificationResult.verificationState === 'VALID' && (
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                        )}
                        {(verificationResult.verificationState === 'ALREADY_CHECKED_IN' ||
                          verificationResult.verificationState === 'PENDING') && (
                          <Clock className="w-4 h-4 text-amber-700" aria-hidden="true" />
                        )}
                        {(verificationResult.verificationState === 'FAILED' ||
                          verificationResult.verificationState === 'NOT_FOUND') && (
                          <XCircle className="w-4 h-4 text-red-700" aria-hidden="true" />
                        )}
                        <span>{verificationResult.message}</span>
                      </div>

                      {verificationResult.order && (
                        <div className="text-xs space-y-0.5 opacity-90">
                          <p>
                            <span className="font-semibold">{verificationResult.order.fullName}</span>
                            {session.role === 'admin' && verificationResult.order.phone
                              ? ` · ${verificationResult.order.phone}`
                              : ''}
                            {verificationResult.order.email ? ` · ${verificationResult.order.email}` : ''}
                          </p>
                          <p className="font-mono">
                            Order: {verificationResult.order.orderId}
                            {verificationResult.order.passCode
                              ? ` · Pass: ${verificationResult.order.passCode}`
                              : ''}
                            {verificationResult.order.bankRef
                              ? ` · Bank Ref: ${verificationResult.order.bankRef}`
                              : ''}
                          </p>
                          <p>
                            {verificationResult.order.quantity} × {verificationResult.order.tier.name} (
                            {verificationResult.order.patronsAdmitted} patrons)
                            {session.role === 'admin' &&
                            typeof verificationResult.order.totalUgx === 'number'
                              ? ` · ${formatUgx(verificationResult.order.totalUgx)}`
                              : ''}
                          </p>
                          {verificationResult.order.checkedInAt && (
                            <p className="font-medium">
                              Checked in: {formatDateTime(verificationResult.order.checkedInAt)} (by{' '}
                              {verificationResult.order.checkedInBy})
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {verificationResult.verificationState === 'VALID' && verificationResult.order && (
                      <button
                        type="button"
                        disabled={busyOrderId === verificationResult.order.orderId}
                        onClick={() => void handleCheckInOrder(verificationResult.order!.orderId)}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Admit & Check In</span>
                      </button>
                    )}

                    {verificationResult.verificationState === 'PENDING' && verificationResult.order && (
                      <button
                        type="button"
                        disabled={busyOrderId === verificationResult.order.orderId}
                        onClick={() => void handleReverifyOrder(verificationResult.order!.orderId)}
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Re-verify with NCBA</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Filter & Search Bar */}
            <div className="space-y-2.5 bg-white rounded-2xl border border-[#0E3B24]/15 p-3.5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: 'All' },
                      { id: 'SUCCESS', label: 'Settled' },
                      { id: 'PENDING', label: 'Pending' },
                      { id: 'FAILED', label: 'Failed / Expired' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setStatusFilter(tab.id)}
                      className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                        statusFilter === tab.id
                          ? 'bg-[#0E3B24] border-[#0E3B24] text-white'
                          : 'bg-[#FAF8F3] border-[#0E3B24]/20 text-[#0E3B24] hover:border-[#0E3B24]/45'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search
                      className="w-3.5 h-3.5 text-[#0E3B24]/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={
                        session.role === 'admin'
                          ? 'Search name, phone, ref, pass...'
                          : 'Search name, order ID, pass, ref...'
                      }
                      className="w-full h-9 pl-8 pr-3 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3]/60 text-xs text-[#111D15] focus:outline-none focus:border-[#0E3B24]"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={!session || isLoadingOrders}
                    onClick={() => session && refreshActiveOrders(session.token)}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] hover:bg-[#0E3B24]/5 text-xs font-medium text-[#0E3B24] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>

                  <button
                    type="button"
                    disabled={orders.length === 0}
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#0E3B24] hover:bg-[#134d30] text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Basic Attribute & Date Filters */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#0E3B24]/10">
                <select
                  aria-label="Filter by ticket type"
                  value={tierFilter}
                  onChange={(e) => setTierFilter(e.target.value as TicketTypeFilter)}
                  className="h-8 px-2.5 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] text-xs text-[#111D15] focus:outline-none focus:border-[#0E3B24]"
                >
                  <option value="ALL">All Ticket Types</option>
                  <option value="solo">Solo Drive-in Pass</option>
                  <option value="duo">Drive-in Duo Pass</option>
                </select>

                <select
                  aria-label="Filter by gate check-in"
                  value={checkInFilter}
                  onChange={(e) => setCheckInFilter(e.target.value as CheckInFilter)}
                  className="h-8 px-2.5 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] text-xs text-[#111D15] focus:outline-none focus:border-[#0E3B24]"
                >
                  <option value="ALL">All Check-In Status</option>
                  <option value="CHECKED_IN">Checked In</option>
                  <option value="NOT_CHECKED_IN">Not Checked In</option>
                </select>

                <select
                  aria-label="Filter by payment method"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value as PaymentMethodFilter)}
                  className="h-8 px-2.5 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] text-xs text-[#111D15] focus:outline-none focus:border-[#0E3B24]"
                >
                  <option value="ALL">All Payment Methods</option>
                  <option value="MTN">MTN MoMo</option>
                  <option value="AIRTEL">Airtel Money</option>
                </select>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="host-filter-date-from" className="text-[11px] font-medium text-[#111D15]/65">
                    D.o.P From
                  </label>
                  <input
                    id="host-filter-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] text-xs text-[#111D15] focus:outline-none focus:border-[#0E3B24]"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="host-filter-date-to" className="text-[11px] font-medium text-[#111D15]/65">
                    To
                  </label>
                  <input
                    id="host-filter-date-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 px-2 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] text-xs text-[#111D15] focus:outline-none focus:border-[#0E3B24]"
                  />
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="h-8 px-2.5 rounded-lg border border-[#0E3B24]/20 bg-white hover:bg-[#0E3B24]/5 text-[11px] font-semibold text-[#0E3B24] cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}

                <span className="ml-auto text-[11px] font-mono tabular-nums text-[#111D15]/60">
                  {orders.length} {orders.length === 1 ? 'order' : 'orders'}
                </span>
              </div>
            </div>

            {portalError && (
              <div
                role="alert"
                className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900"
              >
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                <p>{portalError}</p>
              </div>
            )}

            {/* Orders & Payments Table */}
            <div className="bg-white rounded-2xl border border-[#0E3B24]/15 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAF8F3] border-b border-[#0E3B24]/12 text-[#0E3B24]/80 font-semibold">
                      <th className="py-3 px-3.5">Order / Pass</th>
                      <th className="py-3 px-3.5">Patron</th>
                      <th className="py-3 px-3.5">Ticket Type</th>
                      {session.role === 'admin' && <th className="py-3 px-3.5">Amount</th>}
                      <th className="py-3 px-3.5">Payment Ref</th>
                      <th className="py-3 px-3.5">D.o.P</th>
                      <th className="py-3 px-3.5">Status</th>
                      <th className="py-3 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#0E3B24]/10">
                    {orders.length === 0 ? (
                      <tr>
                        <td
                          colSpan={session.role === 'admin' ? 8 : 7}
                          className="py-8 px-4 text-center text-[#111D15]/60"
                        >
                          {isLoadingOrders ? 'Loading orders...' : 'No orders match the current filter.'}
                        </td>
                      </tr>
                    ) : (
                      orders.map((order) => (
                        <tr key={order.orderId} className="hover:bg-[#FAF8F3]/60 align-top">
                          <td className="py-3 px-3.5 font-mono whitespace-nowrap">
                            <p className="font-semibold text-[#0E3B24]">{order.orderId}</p>
                            {order.passCode && (
                              <p className="text-[11px] text-emerald-800">{order.passCode}</p>
                            )}
                            {order.hotelVoucherCode && (
                              <p className="text-[11px] text-[#111D15]/60">{order.hotelVoucherCode}</p>
                            )}
                            <p className="text-[10px] text-[#111D15]/50 mt-0.5">
                              {formatDateTime(order.createdAt)}
                            </p>
                          </td>

                          <td className="py-3 px-3.5">
                            <p className="font-semibold text-[#111D15]">{order.fullName}</p>
                            {session.role === 'admin' && order.phone && (
                              <p className="font-mono text-[11px] text-[#111D15]/80">{order.phone}</p>
                            )}
                            {order.email && (
                              <p className="text-[11px] text-[#111D15]/60">{order.email}</p>
                            )}
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <span
                              className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded border ${
                                order.tier.id === 'duo'
                                  ? 'bg-[#C5A246]/12 text-[#0E3B24] border-[#C5A246]/35'
                                  : 'bg-[#FAF8F3] text-[#0E3B24] border-[#0E3B24]/20'
                              }`}
                            >
                              {order.tier.name}
                            </span>
                            <p className="text-[11px] text-[#111D15]/70 mt-1">
                              {order.quantity} {order.quantity === 1 ? 'ticket' : 'tickets'} ·{' '}
                              {order.patronsAdmitted}{' '}
                              {order.patronsAdmitted === 1 ? 'patron' : 'patrons'}
                            </p>
                          </td>

                          {session.role === 'admin' && (
                            <td className="py-3 px-3.5 whitespace-nowrap font-mono font-semibold text-[#0E3B24]">
                              {typeof order.totalUgx === 'number' ? formatUgx(order.totalUgx) : '—'}
                            </td>
                          )}

                          <td className="py-3 px-3.5 font-mono text-[11px]">
                            <p className="text-[#111D15]">{order.paymentMethod || '—'}</p>
                            {order.bankRef && (
                              <p className="text-emerald-800 font-semibold">Bank: {order.bankRef}</p>
                            )}
                            <p className="text-[#111D15]/55">Sess: {order.checkoutRef}</p>
                          </td>

                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {order.status === 'SUCCESS' ? (
                              <span className="font-medium text-[#111D15]">
                                {formatDateOfPayment(order)}
                              </span>
                            ) : (
                              <span className="text-[#111D15]/45 italic">Unpaid</span>
                            )}
                          </td>

                          <td className="py-3 px-3.5">
                            <span
                              className={`inline-block font-mono text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                order.status === 'SUCCESS'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : order.status === 'FAILED'
                                    ? 'bg-red-50 text-red-800 border-red-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {order.status}
                            </span>
                            {order.checkedInAt && (
                              <p className="text-[11px] font-medium text-emerald-800 mt-1">
                                Admitted ({formatDateTime(order.checkedInAt)})
                              </p>
                            )}
                            {order.emailSentAt && (
                              <p className="text-[11px] text-[#0E3B24]/75 mt-0.5">
                                E-ticket sent ({formatDateTime(order.emailSentAt)})
                              </p>
                            )}
                            {!order.emailSentAt && order.emailLastError && (
                              <p className="text-[11px] text-amber-800 mt-0.5 max-w-[200px]">
                                Email: {order.emailLastError}
                              </p>
                            )}
                            {order.statusDescription && (
                              <p className="text-[11px] text-[#111D15]/60 mt-1 max-w-[200px]">
                                {order.statusDescription}
                              </p>
                            )}
                          </td>

                          <td className="py-3 px-3.5 text-right whitespace-nowrap space-y-1.5">
                            {order.status === 'SUCCESS' && !order.checkedInAt && (
                              <button
                                type="button"
                                disabled={busyOrderId === order.orderId}
                                onClick={() => void handleCheckInOrder(order.orderId)}
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                              >
                                <UserCheck className="w-3 h-3" aria-hidden="true" />
                                <span>Admit</span>
                              </button>
                            )}
                            {order.status === 'SUCCESS' && order.email && (
                              <button
                                type="button"
                                disabled={busyOrderId === order.orderId}
                                onClick={() => void handleResendEmail(order.orderId)}
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[#0E3B24]/25 bg-white hover:bg-[#FAF8F3] text-[#0E3B24] text-[11px] font-medium cursor-pointer disabled:opacity-50 ml-1"
                              >
                                <Mail className="w-3 h-3" aria-hidden="true" />
                                <span>{order.emailSentAt ? 'Resend PDF' : 'Send PDF'}</span>
                              </button>
                            )}
                            {order.status !== 'SUCCESS' && (
                              <button
                                type="button"
                                disabled={busyOrderId === order.orderId}
                                onClick={() => void handleReverifyOrder(order.orderId)}
                                className="inline-flex items-center gap-1 h-7 px-2.5 rounded border border-[#0E3B24]/25 bg-white hover:bg-[#FAF8F3] text-[#0E3B24] text-[11px] font-medium cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${busyOrderId === order.orderId ? 'animate-spin' : ''}`}
                                  aria-hidden="true"
                                />
                                <span>Re-verify</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
