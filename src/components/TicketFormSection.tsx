import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Minus,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { EVENT_INFO, PROTEA_HOTEL_OFFER, TICKET_TIERS, formatUgx, type TicketTier } from '../data/eventData';
import { useEventCountdown } from './EventCountdown';
import { PartnersCarousel } from './PartnersCarousel';

type CheckoutStep = 'form' | 'awaiting_payment' | 'verifying' | 'failed' | 'confirmed';

interface GatewayPaymentMethod {
  id: number;
  name: string;
}

interface PendingCheckoutSession {
  orderId: string;
  checkoutUrl: string;
  expiresAtUtc?: string;
  amountUgx: number;
  fullName: string;
  phone: string;
  tierName: string;
  quantity: number;
}

interface BookingReceipt {
  reference: string;
  hotelVoucherCode: string;
  fullName: string;
  phone: string;
  email: string;
  tier: TicketTier;
  quantity: number;
  totalUgx: number;
  paymentMethod: string;
  bankRef?: string;
  externalRef?: string;
  valueDate?: string;
}

interface CountryOption {
  iso: string;
  name: string;
  dialCode: string;
  emoji: string;
}

const COUNTRY_OPTIONS: CountryOption[] = [
  { iso: 'UG', name: 'Uganda', dialCode: '+256', emoji: '🇺🇬' },
  { iso: 'KE', name: 'Kenya', dialCode: '+254', emoji: '🇰🇪' },
  { iso: 'TZ', name: 'Tanzania', dialCode: '+255', emoji: '🇹🇿' },
  { iso: 'RW', name: 'Rwanda', dialCode: '+250', emoji: '🇷🇼' },
  { iso: 'BI', name: 'Burundi', dialCode: '+257', emoji: '🇧🇮' },
  { iso: 'SS', name: 'South Sudan', dialCode: '+211', emoji: '🇸🇸' },
  { iso: 'CD', name: 'DR Congo', dialCode: '+243', emoji: '🇨🇩' },
  { iso: 'ZA', name: 'South Africa', dialCode: '+27', emoji: '🇿🇦' },
  { iso: 'GB', name: 'United Kingdom', dialCode: '+44', emoji: '🇬🇧' },
  { iso: 'US', name: 'United States', dialCode: '+1', emoji: '🇺🇸' },
  { iso: 'AE', name: 'UAE', dialCode: '+971', emoji: '🇦🇪' },
];

function CountryFlag({ iso, emoji }: { iso: string; emoji: string }) {
  if (iso === 'UG') {
    return (
      <svg
        viewBox="0 0 24 16"
        className="w-[18px] h-[12px] rounded-[2px] shrink-0 border border-black/10"
        aria-hidden="true"
      >
        <rect width="24" height="2.67" y="0" fill="#111111" />
        <rect width="24" height="2.67" y="2.67" fill="#FCDC04" />
        <rect width="24" height="2.67" y="5.33" fill="#D90000" />
        <rect width="24" height="2.67" y="8" fill="#111111" />
        <rect width="24" height="2.67" y="10.67" fill="#FCDC04" />
        <rect width="24" height="2.67" y="13.33" fill="#D90000" />
        <circle cx="12" cy="8" r="2.6" fill="#FFFFFF" />
        <circle cx="12" cy="8" r="1.2" fill="#9CA3AF" />
      </svg>
    );
  }
  return (
    <span className="text-sm leading-none shrink-0" aria-hidden="true">
      {emoji}
    </span>
  );
}

export function TicketFormSection() {
  const [fullName, setFullName] = useState('');
  const [countryIso, setCountryIso] = useState('UG');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedTierId, setSelectedTierId] = useState<'solo' | 'duo'>('solo');
  const [quantity, setQuantity] = useState(1);

  const [step, setStep] = useState<CheckoutStep>('form');
  const [gatewayMethods, setGatewayMethods] = useState<GatewayPaymentMethod[]>([]);
  const [selectedMethodId, setSelectedMethodId] = useState<number | 'all'>('all');
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string; email?: string }>({});
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckoutSession | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);

  const [formQrDataUrl, setFormQrDataUrl] = useState<string>('');
  const [passQrDataUrl, setPassQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [showOrderLookup, setShowOrderLookup] = useState(false);
  const [lookupOrderId, setLookupOrderId] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const eventPhase = useEventCountdown();
  const isEventEnded = eventPhase.status === 'after';

  const selectedTier = useMemo(
    () => TICKET_TIERS.find((tier) => tier.id === selectedTierId) ?? TICKET_TIERS[0],
    [selectedTierId]
  );

  const totalUgx = selectedTier.priceUgx * quantity;
  const totalPatrons = selectedTier.guestsIncluded * quantity;

  const ticketFormUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://thecourse.ug/#tickets';
    const base = window.location.origin;
    return `${base}/#tickets`;
  }, []);

  // Fetch supported payment methods from backend auth config
  useEffect(() => {
    let active = true;
    fetch('/api/checkout/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { configured?: boolean; paymentMethods?: GatewayPaymentMethod[] } | null) => {
        if (!active || !data) return;
        if (Array.isArray(data.paymentMethods) && data.paymentMethods.length > 0) {
          setGatewayMethods(data.paymentMethods);
        }
      })
      .catch(() => {
        // Non-blocking; payment-init still resolves methods on server
      });
    return () => {
      active = false;
    };
  }, []);

  const verifyOrderStatus = useCallback(async (orderId: string, silent = false) => {
    if (!silent) setIsCheckingStatus(true);
    try {
      const response = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(orderId)}`);
      const rawText = await response.text();
      let payload: {
        status?: 'PENDING' | 'SUCCESS' | 'FAILED';
        statusDescription?: string;
        checkoutUrl?: string;
        expiresAtUtc?: string;
        receipt?: BookingReceipt;
        error?: string;
      } = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText) as typeof payload;
        } catch {
          // Non-JSON proxy/server error
        }
      }

      if (!response.ok) {
        if (!silent) {
          setCheckoutError(payload.error || `Unable to verify payment status (HTTP ${response.status}).`);
        }
        return null;
      }

      if (payload.status === 'SUCCESS' && payload.receipt) {
        setReceipt(payload.receipt);
        setPendingCheckout(null);
        setActiveOrderId(null);
        setStatusMessage(null);
        setCheckoutError(null);
        setStep('confirmed');
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/payment/')) {
          window.history.replaceState({}, '', '/#tickets');
        }
        return 'SUCCESS';
      }

      if (payload.status === 'FAILED') {
        setStatusMessage(payload.statusDescription || 'Payment was not completed.');
        setStep('failed');
        if (typeof window !== 'undefined' && window.location.pathname.startsWith('/payment/')) {
          window.history.replaceState({}, '', '/#tickets');
        }
        return 'FAILED';
      }

      setStatusMessage(payload.statusDescription || 'Awaiting payment completion on checkout page.');
      if (payload.checkoutUrl) {
        setPendingCheckout((prev) =>
          prev
            ? { ...prev, checkoutUrl: payload.checkoutUrl ?? prev.checkoutUrl }
            : {
                orderId,
                checkoutUrl: payload.checkoutUrl ?? '',
                expiresAtUtc: payload.expiresAtUtc,
                amountUgx: 0,
                fullName: '',
                phone: '',
                tierName: 'Patron Pass',
                quantity: 1,
              }
        );
      }
      return 'PENDING';
    } catch {
      if (!silent) {
        setCheckoutError('Network error while checking payment status. Please try again.');
      }
      return null;
    } finally {
      if (!silent) setIsCheckingStatus(false);
    }
  }, []);

  // Handle redirect return from Ronford Checkout Page (/payment/success|failed|error?orderId=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, search } = window.location;
    if (!pathname.startsWith('/payment/')) return;

    const params = new URLSearchParams(search);
    const returnedOrderId = params.get('orderId')?.trim() || '';
    const ticketsEl = document.getElementById('tickets');
    if (ticketsEl) {
      ticketsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (!/^TC-2026-[A-Z0-9]{4,12}$/.test(returnedOrderId)) {
      setCheckoutError('Payment callback returned without a valid order reference.');
      setStep('failed');
      return;
    }

    setActiveOrderId(returnedOrderId);
    setStep('verifying');
    void verifyOrderStatus(returnedOrderId).then((result) => {
      if (result === 'PENDING') {
        if (pathname.includes('/failed') || pathname.includes('/error')) {
          setStatusMessage('Payment was cancelled or could not be confirmed yet.');
          setStep('failed');
        } else {
          setStep('awaiting_payment');
        }
      } else if (result === null) {
        setStep('failed');
      }
    });
  }, [verifyOrderStatus]);

  // Poll status while waiting for customer to complete payment in external tab/page
  useEffect(() => {
    if (step !== 'awaiting_payment' || !activeOrderId) return;
    const intervalId = window.setInterval(() => {
      void verifyOrderStatus(activeOrderId, true);
    }, 4500);
    return () => window.clearInterval(intervalId);
  }, [step, activeOrderId, verifyOrderStatus]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(ticketFormUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0E3B24',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setFormQrDataUrl(url);
      })
      .catch(() => {
        // Fallback handled gracefully by icon state
      });
    return () => {
      active = false;
    };
  }, [ticketFormUrl]);

  useEffect(() => {
    if (!receipt) {
      setPassQrDataUrl('');
      return;
    }
    let active = true;
    const payload = JSON.stringify({
      ref: receipt.reference,
      protea50: receipt.hotelVoucherCode,
      bankRef: receipt.bankRef,
      event: 'The Course 2026',
      name: receipt.fullName,
      phone: receipt.phone,
      pass: receipt.tier.name,
      qty: receipt.quantity,
      total: receipt.totalUgx,
    });
    QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: {
        dark: '#0E3B24',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (active) setPassQrDataUrl(url);
      })
      .catch(() => {
        // Ignore
      });
    return () => {
      active = false;
    };
  }, [receipt]);

  const selectedCountry = useMemo(
    () => COUNTRY_OPTIONS.find((c) => c.iso === countryIso) ?? COUNTRY_OPTIONS[0],
    [countryIso]
  );

  const formattedFullPhone = useMemo(() => {
    const trimmed = phone.trim().replace(/^0+/, '');
    return trimmed ? `${selectedCountry.dialCode} ${trimmed}` : '';
  }, [phone, selectedCountry.dialCode]);

  const validateForm = (): boolean => {
    const nextErrors: { fullName?: string; phone?: string; email?: string } = {};
    const trimmedName = fullName.trim();
    const cleanedDigits = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      nextErrors.fullName = 'Please enter your full name.';
    }

    if (!/^\d{7,12}$/.test(cleanedDigits)) {
      nextErrors.phone = 'Enter a valid phone number (e.g. 777 075 940).';
    }

    if (trimmedEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address or leave blank.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleProceed = async (e: FormEvent) => {
    e.preventDefault();
    if (isEventEnded || isInitializing) return;
    setCheckoutError(null);

    if (!validateForm()) return;

    const cleanedDigits = phone.replace(/[\s\-()]/g, '').replace(/^0+/, '');
    setIsInitializing(true);

    try {
      const response = await fetch('/api/checkout/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phoneDialCode: selectedCountry.dialCode,
          phoneLocalDigits: cleanedDigits,
          email: email.trim() || undefined,
          tierId: selectedTierId,
          quantity,
          paymentMethodId: selectedMethodId === 'all' ? undefined : selectedMethodId,
        }),
      });

      const rawText = await response.text();
      let payload: {
        orderId?: string;
        checkoutUrl?: string;
        expiresAtUtc?: string;
        amountUgx?: number;
        error?: string;
      } = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText) as typeof payload;
        } catch {
          // Non-JSON proxy/server response
        }
      }

      if (!response.ok || !payload.checkoutUrl || !payload.orderId) {
        setCheckoutError(
          payload.error ||
            (!response.ok
              ? `Checkout service returned HTTP ${response.status}. Please try again.`
              : 'Unable to start checkout session. Please try again.')
        );
        return;
      }

      const session: PendingCheckoutSession = {
        orderId: payload.orderId,
        checkoutUrl: payload.checkoutUrl,
        expiresAtUtc: payload.expiresAtUtc,
        amountUgx: payload.amountUgx ?? totalUgx,
        fullName: fullName.trim(),
        phone: formattedFullPhone || phone.trim(),
        tierName: selectedTier.name,
        quantity,
      };

      setPendingCheckout(session);
      setActiveOrderId(payload.orderId);
      setStatusMessage(null);

      // In standard top-level browsing, redirect directly to checkoutUrl as specified in Step 3.
      // When embedded in an iframe preview, show the direct launch panel + live status verification.
      const isEmbedded = typeof window !== 'undefined' && window.self !== window.top;
      setStep('awaiting_payment');
      if (!isEmbedded && typeof window !== 'undefined') {
        window.location.assign(payload.checkoutUrl);
      }
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      setCheckoutError(
        `Unable to reach the checkout service${detail}. Please refresh the page and try again.`
      );
    } finally {
      setIsInitializing(false);
    }
  };

  const handleReset = () => {
    setStep('form');
    setReceipt(null);
    setPendingCheckout(null);
    setActiveOrderId(null);
    setCheckoutError(null);
    setStatusMessage(null);
    setQuantity(1);
    setErrors({});
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/payment/')) {
      window.history.replaceState({}, '', '/#tickets');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(ticketFormUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Clipboard blocked in restricted frame
    }
  };

  const handleDownloadFormQr = () => {
    if (!formQrDataUrl) return;
    const link = document.createElement('a');
    link.href = formQrDataUrl;
    link.download = 'the-course-tickets-qr.png';
    link.click();
  };

  const handleDownloadPassQr = () => {
    if (!passQrDataUrl || !receipt) return;
    const link = document.createElement('a');
    link.href = passQrDataUrl;
    link.download = `the-course-pass-${receipt.reference}.png`;
    link.click();
  };

  const handleLookupOrder = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = lookupOrderId.trim().toUpperCase();
    if (!/^TC-2026-[A-Z0-9]{4,12}$/.test(normalized)) {
      setLookupError('Enter a valid order reference (e.g. TC-2026-A1B2C3).');
      return;
    }

    setLookupError(null);
    setIsLookingUp(true);
    try {
      const response = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(normalized)}`);
      const rawText = await response.text();
      let payload: {
        status?: 'PENDING' | 'SUCCESS' | 'FAILED';
        statusDescription?: string;
        checkoutUrl?: string;
        expiresAtUtc?: string;
        receipt?: BookingReceipt;
        error?: string;
      } = {};
      if (rawText) {
        try {
          payload = JSON.parse(rawText) as typeof payload;
        } catch {
          // Non-JSON response
        }
      }

      if (!response.ok) {
        setLookupError(payload.error || `Order reference was not found (HTTP ${response.status}).`);
        return;
      }

      setActiveOrderId(normalized);
      if (payload.status === 'SUCCESS' && payload.receipt) {
        setReceipt(payload.receipt);
        setShowOrderLookup(false);
        setStep('confirmed');
      } else if (payload.status === 'FAILED') {
        setStatusMessage(payload.statusDescription || 'Payment was not completed.');
        setShowOrderLookup(false);
        setStep('failed');
      } else {
        setPendingCheckout({
          orderId: normalized,
          checkoutUrl: payload.checkoutUrl || '',
          expiresAtUtc: payload.expiresAtUtc,
          amountUgx: 0,
          fullName: '',
          phone: '',
          tierName: 'Patron Pass',
          quantity: 1,
        });
        setStatusMessage(payload.statusDescription || 'Awaiting payment completion.');
        setShowOrderLookup(false);
        setStep('awaiting_payment');
      }
    } catch {
      setLookupError('Network error while retrieving order.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const formatUtcTime = (iso?: string): string | null => {
    if (!iso) return null;
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString('en-UG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <section id="tickets" className="py-12 sm:py-14 border-t border-[#0E3B24]/10 bg-[#F3F0E7] print:bg-white print:border-0 print:py-4">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 print:hidden">
          <div className="max-w-xl">
            <p className="text-xs font-medium tracking-wide text-[#0E3B24]/70 mb-1">
              Tickets · {EVENT_INFO.shortDate}
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#0E3B24]">
              Buy Your Drive-in Pass.
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowOrderLookup((prev) => !prev);
              setLookupError(null);
            }}
            className="text-xs sm:text-sm font-medium text-[#0E3B24] underline underline-offset-4 hover:text-[#134d30] self-start sm:self-auto cursor-pointer"
          >
            {showOrderLookup ? 'Hide Order Lookup' : 'Already Paid? Retrieve Pass'}
          </button>
        </div>

        {showOrderLookup && (
          <form
            onSubmit={handleLookupOrder}
            className="mb-7 bg-white rounded-2xl border border-[#0E3B24]/15 p-4 sm:p-5 shadow-sm print:hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label htmlFor="lookup-order-id" className="block text-xs font-medium text-[#111D15] mb-1">
                  Order Reference
                </label>
                <input
                  id="lookup-order-id"
                  type="text"
                  value={lookupOrderId}
                  onChange={(e) => {
                    setLookupOrderId(e.target.value);
                    if (lookupError) setLookupError(null);
                  }}
                  placeholder="e.g. TC-2026-A1B2C3"
                  className="w-full h-10 px-3.5 rounded-lg border border-[#0E3B24]/25 bg-[#FAF8F3]/50 font-mono text-sm text-[#111D15] placeholder:text-[#111D15]/40 focus:outline-none focus:border-[#0E3B24] focus:ring-2 focus:ring-[#0E3B24]/15"
                />
              </div>

              <button
                type="submit"
                disabled={isLookingUp}
                className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-lg bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
              >
                {isLookingUp ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <span>Check Order Status</span>
                )}
              </button>
            </div>
            {lookupError && (
              <p className="mt-2 text-xs font-medium text-red-700" role="alert">
                {lookupError}
              </p>
            )}
          </form>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          {/* Left 7 Columns: Concise Ticket Purchasing Form */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#0E3B24]/15 p-5 sm:p-7 shadow-sm">
            {step === 'form' && (
              <form onSubmit={handleProceed} noValidate className="space-y-5">
                <div className="pb-3 border-b border-[#0E3B24]/10 space-y-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-base font-semibold text-[#0E3B24]">Patron Pass Details</h3>
                    <span className="font-mono text-xs text-[#0E3B24]/70 tabular-nums">Step 1 of 2</span>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-[#0E3B24]/80">
                      Inclusive of an all day Endless Barbecue
                    </p>
                  </div>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label htmlFor="patron-name" className="block text-sm font-medium text-[#111D15] mb-1">
                      Full Name <span className="text-[#0E3B24]">*</span>
                    </label>
                    <input
                      id="patron-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (errors.fullName) setErrors((prev) => ({ ...prev, fullName: undefined }));
                      }}
                      placeholder="e.g. Samuel Kato"
                      className="w-full h-11 px-3.5 rounded-lg border border-[#0E3B24]/25 bg-[#FAF8F3]/50 text-[#111D15] text-sm placeholder:text-[#111D15]/40 focus:outline-none focus:border-[#0E3B24] focus:ring-2 focus:ring-[#0E3B24]/15 transition-colors"
                    />
                    {errors.fullName && (
                      <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                        {errors.fullName}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="patron-phone" className="block text-sm font-medium text-[#111D15] mb-1">
                        Phone Number <span className="text-[#0E3B24]">*</span>
                      </label>
                      <div className="flex h-11 rounded-lg border border-[#0E3B24]/25 bg-[#FAF8F3]/50 focus-within:border-[#0E3B24] focus-within:ring-2 focus-within:ring-[#0E3B24]/15 transition-colors overflow-hidden">
                        <div className="relative flex items-center gap-1.5 px-2.5 border-r border-[#0E3B24]/25 bg-[#FAF8F3] shrink-0 select-none">
                          <CountryFlag iso={selectedCountry.iso} emoji={selectedCountry.emoji} />
                          <span className="font-mono tabular-nums text-xs sm:text-sm font-medium text-[#111D15]">
                            {selectedCountry.dialCode}
                          </span>
                          <ChevronDown className="w-3.5 h-3.5 text-[#0E3B24]/70 shrink-0" aria-hidden="true" />
                          <select
                            aria-label="Country dial code"
                            value={countryIso}
                            onChange={(e) => setCountryIso(e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          >
                            {COUNTRY_OPTIONS.map((country) => (
                              <option key={country.iso} value={country.iso}>
                                {country.emoji} {country.name} ({country.dialCode})
                              </option>
                            ))}
                          </select>
                        </div>

                        <input
                          id="patron-phone"
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => {
                            setPhone(e.target.value);
                            if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                          }}
                          placeholder="777 075 940"
                          className="flex-1 min-w-0 h-full px-3 bg-transparent text-[#111D15] text-sm placeholder:text-[#111D15]/40 focus:outline-none"
                        />
                      </div>
                      {errors.phone && (
                        <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                          {errors.phone}
                        </p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="patron-email" className="block text-sm font-medium text-[#111D15] mb-1">
                        Email <span className="text-[#111D15]/50 font-normal">(Optional)</span>
                      </label>
                      <input
                        id="patron-email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
                        }}
                        placeholder="name@example.com"
                        className="w-full h-11 px-3.5 rounded-lg border border-[#0E3B24]/25 bg-[#FAF8F3]/50 text-[#111D15] text-sm placeholder:text-[#111D15]/40 focus:outline-none focus:border-[#0E3B24] focus:ring-2 focus:ring-[#0E3B24]/15 transition-colors"
                      />
                      {errors.email && (
                        <p className="mt-1 text-xs font-medium text-red-700" role="alert">
                          {errors.email}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <fieldset className="space-y-2.5">
                  <legend className="text-sm font-medium text-[#111D15]">
                    Ticket Type <span className="text-[#0E3B24]">*</span>
                  </legend>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {TICKET_TIERS.map((tier) => {
                      const isSelected = tier.id === selectedTierId;
                      return (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setSelectedTierId(tier.id)}
                          aria-pressed={isSelected}
                          className={`flex flex-col justify-between p-4 rounded-xl border text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24] ${
                            isSelected
                              ? 'border-[#0E3B24] bg-[#0E3B24]/[0.04]'
                              : 'border-[#0E3B24]/20 bg-white hover:border-[#0E3B24]/45'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="text-sm font-semibold text-[#0E3B24]">{tier.name}</span>
                            <span
                              className={`inline-flex items-center justify-center w-5 h-5 rounded-full border shrink-0 ${
                                isSelected
                                  ? 'bg-[#0E3B24] border-[#0E3B24] text-white'
                                  : 'border-[#0E3B24]/30 bg-white'
                              }`}
                              aria-hidden="true"
                            >
                              {isSelected && <Check className="w-3 h-3" />}
                            </span>
                          </div>
                          <p className="font-mono tabular-nums text-lg font-semibold text-[#111D15] mb-1">
                            {formatUgx(tier.priceUgx)}
                          </p>
                          <p className="text-xs text-[#111D15]/70">{tier.summary}</p>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FAF8F3] border border-[#0E3B24]/12">
                  <div>
                    <label htmlFor="ticket-quantity" className="block text-sm font-medium text-[#111D15]">
                      Number of Tickets
                    </label>
                    <p className="text-xs text-[#111D15]/65 font-mono tabular-nums">
                      {totalPatrons} {totalPatrons === 1 ? 'patron' : 'patrons'} admitted
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      aria-label="Decrease number of tickets"
                      className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#0E3B24]/25 bg-white text-[#0E3B24] hover:bg-[#0E3B24]/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      <Minus className="w-4 h-4" aria-hidden="true" />
                    </button>

                    <input
                      id="ticket-quantity"
                      type="number"
                      min={1}
                      max={10}
                      value={quantity}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        if (!Number.isNaN(parsed)) {
                          setQuantity(Math.min(10, Math.max(1, parsed)));
                        }
                      }}
                      className="w-12 h-10 text-center font-mono tabular-nums text-sm font-semibold text-[#111D15] bg-white border border-[#0E3B24]/25 rounded-lg focus:outline-none focus:border-[#0E3B24]"
                    />

                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                      disabled={quantity >= 10}
                      aria-label="Increase number of tickets"
                      className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#0E3B24]/25 bg-white text-[#0E3B24] hover:bg-[#0E3B24]/5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {gatewayMethods.length > 0 && (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium text-[#111D15]">
                      Payment Method
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMethodId('all')}
                        aria-pressed={selectedMethodId === 'all'}
                        className={`h-9 px-3.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                          selectedMethodId === 'all'
                            ? 'border-[#0E3B24] bg-[#0E3B24]/[0.06] text-[#0E3B24]'
                            : 'border-[#0E3B24]/20 bg-white text-[#111D15]/80 hover:border-[#0E3B24]/45'
                        }`}
                      >
                        All Supported ({gatewayMethods.map((m) => m.name).join(' · ')})
                      </button>
                      {gatewayMethods.map((method) => {
                        const isSelected = selectedMethodId === method.id;
                        return (
                          <button
                            key={method.id}
                            type="button"
                            onClick={() => setSelectedMethodId(method.id)}
                            aria-pressed={isSelected}
                            className={`h-9 px-3.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                              isSelected
                                ? 'border-[#0E3B24] bg-[#0E3B24]/[0.06] text-[#0E3B24]'
                                : 'border-[#0E3B24]/20 bg-white text-[#111D15]/80 hover:border-[#0E3B24]/45'
                            }`}
                          >
                            {method.name}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                {checkoutError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs sm:text-sm"
                  >
                    <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <p>{checkoutError}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-[#0E3B24]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-[#111D15]/65">
                      {quantity} × {selectedTier.name}
                    </p>
                    <p className="font-mono tabular-nums text-2xl font-semibold text-[#0E3B24]">
                      {formatUgx(totalUgx)}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isEventEnded || isInitializing}
                    className={`inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24] ${
                      isEventEnded
                        ? 'bg-[#111D15]/15 text-[#111D15]/55 cursor-not-allowed'
                        : isInitializing
                          ? 'bg-[#0E3B24]/80 text-[#FAF8F3] cursor-wait'
                          : 'bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] cursor-pointer'
                    }`}
                  >
                    {isInitializing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>Initializing Checkout...</span>
                      </>
                    ) : (
                      <>
                        <Ticket className="w-4 h-4" aria-hidden="true" />
                        <span>{isEventEnded ? 'Event Ended' : 'Proceed to Buy Tickets'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {step === 'verifying' && (
              <div className="py-10 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#0E3B24]/10 text-[#0E3B24]">
                  <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-serif text-xl font-semibold text-[#0E3B24]">
                    Verifying Payment Status
                  </h3>
                  <p className="text-sm text-[#111D15]/75">
                    Confirming your transaction with the payment gateway...
                  </p>
                </div>
              </div>
            )}

            {step === 'awaiting_payment' && pendingCheckout && (
              <div className="space-y-5">
                <div className="pb-3 border-b border-[#0E3B24]/10 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E3B24] hover:underline cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Edit Details</span>
                  </button>
                  <span className="font-mono text-xs text-[#0E3B24]/70 tabular-nums">Step 2 of 2</span>
                </div>

                <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#0E3B24]/12 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-medium text-[#0E3B24]/70">Order Reference</span>
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#0E3B24]">
                      {pendingCheckout.orderId}
                    </span>
                  </div>
                  {pendingCheckout.fullName && (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#111D15]/75">
                        {pendingCheckout.fullName} ({pendingCheckout.phone})
                      </span>
                      <span className="font-mono tabular-nums font-medium text-[#111D15]">
                        {pendingCheckout.quantity} × {pendingCheckout.tierName}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 text-xs text-[#0E3B24]">
                    <span>Protea Hotel Entebbe Double Occupancy</span>
                    <span className="font-medium">50% Off Included</span>
                  </div>
                  {pendingCheckout.amountUgx > 0 && (
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#0E3B24]/10">
                      <span className="font-semibold text-[#0E3B24]">Total Due</span>
                      <span className="font-mono tabular-nums text-lg font-semibold text-[#0E3B24]">
                        {formatUgx(pendingCheckout.amountUgx)}
                      </span>
                    </div>
                  )}
                  {formatUtcTime(pendingCheckout.expiresAtUtc) && (
                    <p className="text-xs text-[#111D15]/60">
                      Checkout session expires {formatUtcTime(pendingCheckout.expiresAtUtc)}
                    </p>
                  )}
                </div>

                {statusMessage && (
                  <p className="text-xs sm:text-sm text-[#0E3B24]/85 bg-[#0E3B24]/[0.04] border border-[#0E3B24]/15 rounded-xl p-3">
                    {statusMessage}
                  </p>
                )}

                {checkoutError && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-900 text-xs sm:text-sm"
                  >
                    <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <p>{checkoutError}</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <p className="inline-flex items-center gap-1.5 text-xs text-[#111D15]/65">
                    <ShieldCheck className="w-4 h-4 text-[#0E3B24] shrink-0" aria-hidden="true" />
                    <span>Complete payment on the secure checkout page, then verify below.</span>
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {pendingCheckout.checkoutUrl && (
                      <a
                        href={pendingCheckout.checkoutUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                      >
                        <span>Open Checkout Page</span>
                        <ExternalLink className="w-4 h-4" aria-hidden="true" />
                      </a>
                    )}

                    <button
                      type="button"
                      disabled={isCheckingStatus || !activeOrderId}
                      onClick={() => {
                        if (activeOrderId) void verifyOrderStatus(activeOrderId);
                      }}
                      className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-[#0E3B24]/25 bg-white hover:bg-[#FAF8F3] text-[#0E3B24] text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${isCheckingStatus ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>{isCheckingStatus ? 'Checking...' : 'Verify Status'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 'failed' && (
              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-900">
                  <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold">Payment Not Completed</h3>
                    <p className="text-xs sm:text-sm text-red-800/90">
                      {checkoutError || statusMessage || 'The transaction was not completed or failed verification.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-[#0E3B24]/25 bg-white text-sm font-medium text-[#0E3B24] hover:bg-[#FAF8F3] transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Return to Ticket Form</span>
                  </button>

                  {activeOrderId && (
                    <button
                      type="button"
                      disabled={isCheckingStatus}
                      onClick={() => void verifyOrderStatus(activeOrderId)}
                      className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-4 h-4 ${isCheckingStatus ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      <span>Re-check Payment Status</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 'confirmed' && receipt && (
              <div className="space-y-5">
                <div className="pb-3 border-b border-[#0E3B24]/10 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-[#0E3B24]">Payment Verified</p>
                    <h3 className="font-serif text-2xl font-semibold text-[#0E3B24]">
                      Patron Pass Ready
                    </h3>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-semibold text-[#0E3B24] bg-[#FAF8F3] px-3 py-1 rounded-lg border border-[#0E3B24]/20">
                    {receipt.reference}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center bg-[#FAF8F3] p-4 rounded-xl border border-[#0E3B24]/15">
                  <div className="sm:col-span-7 space-y-2 text-sm">
                    <p className="font-semibold text-[#111D15]">{receipt.fullName}</p>
                    <p className="text-[#111D15]/75">
                      {receipt.phone}
                      {receipt.email ? ` · ${receipt.email}` : ''}
                    </p>
                    <p className="font-medium text-[#0E3B24]">
                      {receipt.quantity} × {receipt.tier.name}
                    </p>
                    <p className="font-mono tabular-nums font-semibold text-[#0E3B24] pt-1 border-t border-[#0E3B24]/10">
                      Paid ({receipt.paymentMethod}): {formatUgx(receipt.totalUgx)}
                    </p>
                    {(receipt.bankRef || receipt.externalRef) && (
                      <p className="font-mono tabular-nums text-xs text-[#111D15]/65">
                        Ref: {receipt.externalRef || receipt.bankRef}
                        {formatUtcTime(receipt.valueDate) ? ` · ${formatUtcTime(receipt.valueDate)}` : ''}
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-5 flex flex-col items-center text-center">
                    {passQrDataUrl && (
                      <img
                        src={passQrDataUrl}
                        alt={`Gate pass QR code for ${receipt.reference}`}
                        className="w-32 h-32 rounded-lg bg-white p-2 border border-[#0E3B24]/15"
                      />
                    )}
                    <p className="text-xs text-[#111D15]/65 mt-1.5">Gate Pass QR</p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0E3B24] text-[#FAF8F3] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#E2CB7A] font-medium">50% Stay Benefit Unlocked</p>
                    <p className="text-sm font-semibold text-white">
                      {PROTEA_HOTEL_OFFER.partnerName} (Double Occupancy)
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-semibold bg-white/10 text-[#E2CB7A] px-3 py-1 rounded-lg border border-[#E2CB7A]/30 self-start sm:self-auto whitespace-nowrap">
                    {receipt.hotelVoucherCode}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[#0E3B24]/25 bg-white text-sm font-medium text-[#0E3B24] hover:bg-[#FAF8F3] transition-colors cursor-pointer"
                    >
                      <Printer className="w-4 h-4" aria-hidden="true" />
                      <span>Print Pass</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadPassQr}
                      disabled={!passQrDataUrl}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-[#0E3B24]/25 bg-white text-sm font-medium text-[#0E3B24] hover:bg-[#FAF8F3] disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>Download QR</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-[#0E3B24] text-sm font-medium text-[#FAF8F3] hover:bg-[#134d30] transition-colors cursor-pointer"
                  >
                    <span>Buy Another Pass</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right 5 Columns: Ticket Form QR Code + Automatic Protea 50% Benefit */}
          <div className="lg:col-span-5 space-y-5 print:hidden">
            <div className="bg-white rounded-2xl border border-[#0E3B24]/15 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <p className="text-xs font-medium text-[#0E3B24]/70">Quick Mobile Access</p>
                  <h3 className="font-serif text-lg font-semibold text-[#0E3B24]">
                    Ticket Form QR Code
                  </h3>
                </div>
                <QrCode className="w-5 h-5 text-[#0E3B24]" aria-hidden="true" />
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4 p-3.5 rounded-xl bg-[#FAF8F3] border border-[#0E3B24]/10">
                <div className="w-36 h-36 rounded-xl bg-white p-2 border border-[#0E3B24]/15 flex items-center justify-center shrink-0">
                  {formQrDataUrl ? (
                    <img
                      src={formQrDataUrl}
                      alt="Scannable QR code linking directly to The Course ticket buying form"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <QrCode className="w-14 h-14 text-[#0E3B24]/40" aria-hidden="true" />
                  )}
                </div>

                <div className="space-y-3 text-center sm:text-left lg:text-center xl:text-left">
                  <p className="text-xs sm:text-sm text-[#111D15]/80">
                    Scan to open this ticket form on mobile or share with your convoy.
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start lg:justify-center xl:justify-start gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadFormQr}
                      disabled={!formQrDataUrl}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#0E3B24] text-[#FAF8F3] text-xs font-medium hover:bg-[#134d30] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Download QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#0E3B24]/25 bg-white text-[#0E3B24] text-xs font-medium hover:bg-[#0E3B24]/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <PartnersCarousel />
          </div>
        </div>
      </div>

    </section>
  );
}
