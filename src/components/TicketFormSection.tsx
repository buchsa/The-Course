import { useEffect, useMemo, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  BedDouble,
  Check,
  Copy,
  Download,
  Minus,
  Plus,
  Printer,
  QrCode,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { EVENT_INFO, PROTEA_HOTEL_OFFER, TICKET_TIERS, formatUgx, type TicketTier } from '../data/eventData';

type CheckoutStep = 'form' | 'payment' | 'confirmed';
type PaymentMethod = 'mtn' | 'airtel' | 'card';

interface BookingReceipt {
  reference: string;
  hotelVoucherCode: string;
  fullName: string;
  phone: string;
  email: string;
  tier: TicketTier;
  quantity: number;
  totalUgx: number;
  paymentMethod: PaymentMethod;
}

export function TicketFormSection() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedTierId, setSelectedTierId] = useState<'solo' | 'duo'>('solo');
  const [quantity, setQuantity] = useState(1);

  const [step, setStep] = useState<CheckoutStep>('form');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mtn');
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string; email?: string }>({});
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);

  const [formQrDataUrl, setFormQrDataUrl] = useState<string>('');
  const [passQrDataUrl, setPassQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const selectedTier = useMemo(
    () => TICKET_TIERS.find((tier) => tier.id === selectedTierId) ?? TICKET_TIERS[0],
    [selectedTierId]
  );

  const totalUgx = selectedTier.priceUgx * quantity;
  const totalPatrons = selectedTier.guestsIncluded * quantity;

  const ticketFormUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://thecourse.ug/#tickets';
    const base = window.location.href.split('#')[0];
    return `${base}#tickets`;
  }, []);

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

  const validateForm = (): boolean => {
    const nextErrors: { fullName?: string; phone?: string; email?: string } = {};
    const trimmedName = fullName.trim();
    const cleanedPhone = phone.replace(/[\s\-()]/g, '');
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      nextErrors.fullName = 'Please enter your full name.';
    }

    if (!/^(?:\+?\d{9,15}|0\d{9})$/.test(cleanedPhone)) {
      nextErrors.phone = 'Enter a valid phone number (e.g. 0777 075 940).';
    }

    if (trimmedEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address or leave blank.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleProceed = (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setStep('payment');
  };

  const handleConfirmPurchase = () => {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    const nextReceipt: BookingReceipt = {
      reference: `TC-2026-${randomCode}`,
      hotelVoucherCode: `PROTEA50-${randomCode}`,
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      tier: selectedTier,
      quantity,
      totalUgx,
      paymentMethod,
    };
    setReceipt(nextReceipt);
    setStep('confirmed');
  };

  const handleReset = () => {
    setStep('form');
    setReceipt(null);
    setQuantity(1);
    setErrors({});
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

  const paymentLabel: Record<PaymentMethod, string> = {
    mtn: 'MTN MoMo',
    airtel: 'Airtel Money',
    card: 'Visa / Mastercard',
  };

  return (
    <section id="tickets" className="py-12 sm:py-14 border-t border-[#0E3B24]/10 bg-[#F3F0E7]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mb-8">
          <p className="text-xs font-medium tracking-wide text-[#0E3B24]/70 mb-1">
            Tickets · {EVENT_INFO.shortDate}
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#0E3B24]">
            Buy Your Drive-in Pass.
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
          {/* Left 7 Columns: Concise Ticket Purchasing Form */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#0E3B24]/15 p-5 sm:p-7 shadow-sm">
            {step === 'form' && (
              <form onSubmit={handleProceed} noValidate className="space-y-5">
                <div className="pb-3 border-b border-[#0E3B24]/10 flex items-center justify-between gap-4">
                  <h3 className="text-base font-semibold text-[#0E3B24]">Patron & Pass Details</h3>
                  <span className="font-mono text-xs text-[#0E3B24]/70 tabular-nums">Step 1 of 2</span>
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
                      <input
                        id="patron-phone"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
                        }}
                        placeholder="0777 075 940"
                        className="w-full h-11 px-3.5 rounded-lg border border-[#0E3B24]/25 bg-[#FAF8F3]/50 text-[#111D15] text-sm placeholder:text-[#111D15]/40 focus:outline-none focus:border-[#0E3B24] focus:ring-2 focus:ring-[#0E3B24]/15 transition-colors"
                      />
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
                    className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
                  >
                    <Ticket className="w-4 h-4" aria-hidden="true" />
                    <span>Proceed to Buy Tickets</span>
                  </button>
                </div>
              </form>
            )}

            {step === 'payment' && (
              <div className="space-y-5">
                <div className="pb-3 border-b border-[#0E3B24]/10 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E3B24] hover:underline cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                    <span>Edit Details</span>
                  </button>
                  <span className="font-mono text-xs text-[#0E3B24]/70 tabular-nums">Step 2 of 2</span>
                </div>

                <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#0E3B24]/12 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[#111D15]/75">
                      {fullName} ({phone})
                    </span>
                    <span className="font-mono tabular-nums font-medium text-[#111D15]">
                      {quantity} × {selectedTier.name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 text-xs text-[#0E3B24]">
                    <span>Protea Hotel Entebbe Double Occupancy</span>
                    <span className="font-medium">50% Off Included</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-[#0E3B24]/10">
                    <span className="font-semibold text-[#0E3B24]">Total Due</span>
                    <span className="font-mono tabular-nums text-lg font-semibold text-[#0E3B24]">
                      {formatUgx(totalUgx)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#111D15]">Payment Method</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(['mtn', 'airtel', 'card'] as PaymentMethod[]).map((method) => {
                      const active = paymentMethod === method;
                      return (
                        <button
                          key={method}
                          type="button"
                          onClick={() => setPaymentMethod(method)}
                          aria-pressed={active}
                          className={`p-3 rounded-xl border text-left text-sm font-medium transition-colors cursor-pointer ${
                            active
                              ? 'border-[#0E3B24] bg-[#0E3B24]/[0.05] text-[#0E3B24]'
                              : 'border-[#0E3B24]/20 bg-white text-[#111D15] hover:border-[#0E3B24]/45'
                          }`}
                        >
                          {paymentLabel[method]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p className="inline-flex items-center gap-1.5 text-xs text-[#111D15]/65">
                    <ShieldCheck className="w-4 h-4 text-[#0E3B24]" aria-hidden="true" />
                    <span>Instant pass & Protea 50% voucher</span>
                  </p>

                  <button
                    type="button"
                    onClick={handleConfirmPurchase}
                    className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Complete Purchase · {formatUgx(totalUgx)}</span>
                  </button>
                </div>
              </div>
            )}

            {step === 'confirmed' && receipt && (
              <div className="space-y-5">
                <div className="pb-3 border-b border-[#0E3B24]/10 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-[#0E3B24]">Confirmed</p>
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
                      Paid ({paymentLabel[receipt.paymentMethod]}): {formatUgx(receipt.totalUgx)}
                    </p>
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

                <div className="flex flex-wrap items-center justify-between gap-3">
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
          <div className="lg:col-span-5 space-y-5">
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

            <div className="bg-[#0E3B24] text-[#FAF8F3] rounded-2xl p-5 border border-[#C5A246]/25 space-y-2.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#E2CB7A]">Included With Every Pass</p>
                  <h3 className="font-serif text-lg font-semibold text-white">
                    50% Off {PROTEA_HOTEL_OFFER.partnerName}
                  </h3>
                </div>
                <BedDouble className="w-5 h-5 text-[#E2CB7A] shrink-0" aria-hidden="true" />
              </div>
              <p className="text-xs sm:text-sm text-white/80">
                Automatic 50% discount on a double occupancy room on Lake Victoria.
              </p>
              <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs text-white/75">
                <a href="#stay" className="text-[#E2CB7A] hover:underline font-medium">
                  View Hotel Photos →
                </a>
                <span className="font-mono tabular-nums">{EVENT_INFO.phones.join(' · ')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
