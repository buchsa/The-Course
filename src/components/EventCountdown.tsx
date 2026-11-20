import { useEffect, useState } from 'react';

type CountdownPhase =
  | {
      status: 'counting';
      days: number;
      hours: number;
      minutes: number;
      seconds: number;
    }
  | { status: 'today' }
  | { status: 'after' };

// Saturday, 19 December 2026 in Entebbe (EAT, UTC+03:00)
const EVENT_DAY_START_MS = Date.parse('2026-12-19T00:00:00+03:00');
const EVENT_DAY_END_MS = Date.parse('2026-12-20T00:00:00+03:00');

function computeCountdown(nowMs: number): CountdownPhase {
  if (nowMs >= EVENT_DAY_END_MS) {
    return { status: 'after' };
  }
  if (nowMs >= EVENT_DAY_START_MS) {
    return { status: 'today' };
  }

  const diffSeconds = Math.max(0, Math.floor((EVENT_DAY_START_MS - nowMs) / 1000));
  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  return { status: 'counting', days, hours, minutes, seconds };
}

export function useEventCountdown(): CountdownPhase {
  const [phase, setPhase] = useState<CountdownPhase>(() => computeCountdown(Date.now()));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPhase(computeCountdown(Date.now()));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return phase;
}

interface EventCountdownProps {
  variant?: 'default' | 'mini';
}

export function EventCountdown({ variant = 'default' }: EventCountdownProps) {
  const phase = useEventCountdown();
  const isMini = variant === 'mini';

  if (phase.status === 'today') {
    if (isMini) {
      return (
        <div
          aria-live="polite"
          className="inline-flex items-center gap-2 bg-[#0E3B24] text-[#FAF8F3] rounded-lg border border-[#C5A246]/40 px-3 py-1.5 shadow-xs shrink-0"
        >
          <span className="text-[11px] font-semibold text-[#E2CB7A]">19 Dec 2026</span>
          <span className="text-white/30" aria-hidden="true">
            ·
          </span>
          <span className="font-serif text-sm font-semibold text-white">Happening Today</span>
        </div>
      );
    }

    return (
      <div
        aria-live="polite"
        className="sm:ml-auto bg-[#0E3B24] text-[#FAF8F3] rounded-xl border border-[#C5A246]/45 px-5 py-3.5 text-center shadow-sm shrink-0"
      >
        <p className="text-xs font-semibold text-[#E2CB7A]">19 Dec 2026</p>
        <p className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-white mt-0.5">
          Happening Today
        </p>
      </div>
    );
  }

  if (phase.status === 'after') {
    if (isMini) {
      return (
        <div
          aria-live="polite"
          className="inline-flex items-center gap-2 bg-white text-[#0E3B24] rounded-lg border border-[#0E3B24]/20 px-3 py-1.5 shadow-xs shrink-0"
        >
          <span className="text-[11px] font-semibold text-[#0E3B24]/65">The Course</span>
          <span className="text-[#0E3B24]/25" aria-hidden="true">
            ·
          </span>
          <span className="font-serif text-sm font-semibold text-[#0E3B24]">In Plan</span>
        </div>
      );
    }

    return (
      <div
        aria-live="polite"
        className="sm:ml-auto bg-white text-[#0E3B24] rounded-xl border border-[#0E3B24]/25 px-5 py-3.5 text-center shadow-sm shrink-0"
      >
        <p className="text-xs font-semibold text-[#0E3B24]/70">The Course</p>
        <p className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-[#0E3B24] mt-0.5">
          In Plan
        </p>
      </div>
    );
  }

  const units = [
    { label: 'Days', value: String(phase.days).padStart(2, '0') },
    { label: 'Hrs', value: String(phase.hours).padStart(2, '0') },
    { label: 'Min', value: String(phase.minutes).padStart(2, '0') },
    { label: 'Sec', value: String(phase.seconds).padStart(2, '0') },
  ];

  if (isMini) {
    return (
      <div
        aria-label="Countdown to 19 December 2026"
        className="inline-flex flex-col bg-[#FAF8F3] rounded-lg border border-[#0E3B24]/18 shadow-xs overflow-hidden shrink-0"
      >
        <div className="px-2.5 py-0.5 bg-[#0E3B24] text-center border-b border-[#C5A246]/30">
          <p className="text-[10px] font-semibold text-[#E2CB7A] tracking-wide whitespace-nowrap">
            Countdown to Tee-Off
          </p>
        </div>
        <div className="grid grid-cols-4 divide-x divide-[#0E3B24]/12 bg-white">
          {units.map((unit) => (
            <div key={unit.label} className="px-2 py-1 text-center min-w-[40px]">
              <span className="block font-mono tabular-nums text-xs sm:text-sm font-bold text-[#0E3B24] leading-none">
                {unit.value}
              </span>
              <span className="block text-[9px] font-semibold text-[#111D15]/65 mt-0.5">
                {unit.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label="Countdown to 19 December 2026"
      className="sm:ml-auto bg-white rounded-xl border border-[#0E3B24]/20 shadow-sm overflow-hidden shrink-0"
    >
      <div className="px-3 xl:px-4 py-1 xl:py-1.5 bg-[#0E3B24] text-center border-b border-[#C5A246]/35">
        <p className="text-[11px] xl:text-xs font-semibold text-[#E2CB7A] tracking-wide whitespace-nowrap">
          Countdown to Tee-Off
        </p>
      </div>
      <div className="grid grid-cols-4 divide-x divide-[#0E3B24]/15">
        {units.map((unit) => (
          <div
            key={unit.label}
            className="px-1.5 lg:px-2.5 xl:px-3.5 py-2 lg:py-2.5 xl:py-3 text-center min-w-[46px] lg:min-w-[54px] xl:min-w-[58px]"
          >
            <span className="block font-mono tabular-nums text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-[#0E3B24] leading-none">
              {unit.value}
            </span>
            <span className="block text-[10px] xl:text-[11px] font-semibold text-[#111D15]/75 mt-1 xl:mt-1.5">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
