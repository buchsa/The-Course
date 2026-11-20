import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PartnerItem {
  id: string;
  name: string;
  role: string;
  logoSrc: string;
}

const PARTNERS: PartnerItem[] = [
  {
    id: 'fusion-media',
    name: 'Fusion Media',
    role: 'Organiser & Production Partner',
    logoSrc: '/assets/aistudio/fusion_logo_no_words_52628d39.jpg',
  },
  {
    id: 'autoshow-kampala',
    name: 'The Auto Show Kampala',
    role: 'Community Partner',
    logoSrc: '/assets/aistudio/logo_6b2fe8bd.jpg',
  },
  {
    id: 'entebbe-club',
    name: 'Entebbe Golf Club',
    role: 'Host Venue Partner',
    logoSrc: '/assets/aistudio/ebbclubLogo-1_d20f4266.png',
  },
  {
    id: 'protea-entebbe',
    name: 'Protea Hotel by Marriott Entebbe',
    role: 'Hospitality Partner',
    logoSrc: '/assets/aistudio/WhatsApp_Image_2026-11-20_at_8.48.28_PM_0e48511b.jpeg',
  },
];

const PARTNER_GROUPS = [PARTNERS.slice(0, 2), PARTNERS.slice(2, 4)];

export function PartnersCarousel() {
  const [groupIndex, setGroupIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setGroupIndex((prev) => (prev + 1) % PARTNER_GROUPS.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const currentPair = PARTNER_GROUPS[groupIndex];

  const handlePrev = () => {
    setGroupIndex((prev) => (prev - 1 + PARTNER_GROUPS.length) % PARTNER_GROUPS.length);
  };

  const handleNext = () => {
    setGroupIndex((prev) => (prev + 1) % PARTNER_GROUPS.length);
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="bg-white rounded-2xl border border-[#0E3B24]/15 p-5 shadow-sm"
      aria-label="Event partners carousel"
    >
      <div className="flex items-center justify-between gap-4 mb-3">
        <div>
          <p className="text-xs font-medium text-[#0E3B24]/70">In Collaboration With</p>
          <h3 className="font-serif text-lg font-semibold text-[#0E3B24]">Event Partners</h3>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous partner logos"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] hover:bg-[#0E3B24]/10 text-[#0E3B24] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            aria-label="Next partner logos"
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#0E3B24]/20 bg-[#FAF8F3] hover:bg-[#0E3B24]/10 text-[#0E3B24] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {currentPair.map((partner) => (
          <div
            key={partner.id}
            className="flex items-center justify-center rounded-xl border border-[#0E3B24]/12 bg-white p-2.5 h-24 overflow-hidden"
          >
            <img
              src={partner.logoSrc}
              alt={`${partner.name} — ${partner.role}`}
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain rounded-md"
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-[#111D15]/60">
        <span>
          Showing {groupIndex * 2 + 1}–{groupIndex * 2 + currentPair.length} of {PARTNERS.length}
        </span>
        <div className="flex items-center gap-1.5" role="tablist" aria-label="Partner slides">
          {PARTNER_GROUPS.map((_, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={idx === groupIndex}
              aria-label={`Show partners group ${idx + 1}`}
              onClick={() => setGroupIndex(idx)}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                idx === groupIndex ? 'w-5 bg-[#0E3B24]' : 'w-2 bg-[#0E3B24]/25 hover:bg-[#0E3B24]/45'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
