import { useState } from 'react';
import { ArrowDownRight, BedDouble, Check, ImageOff } from 'lucide-react';
import { PROTEA_HOTEL_OFFER } from '../data/eventData';

export function ProteaStaySection() {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const markFailed = (id: string) => {
    setFailedImages((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <section id="stay" className="py-12 sm:py-14 border-t border-[#0E3B24]/10 bg-[#FAF8F3]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-center mb-8">
          <div className="md:col-span-6 lg:col-span-7 space-y-2.5">
            <p className="text-xs font-medium tracking-wide text-[#0E3B24]/70">
              {PROTEA_HOTEL_OFFER.partnerName}
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#0E3B24]">
              {PROTEA_HOTEL_OFFER.headline}
            </h2>
            <p className="text-sm sm:text-base text-[#111D15]/80 leading-relaxed max-w-xl">
              {PROTEA_HOTEL_OFFER.summary}
            </p>
          </div>

          <div className="md:col-span-6 lg:col-span-5 bg-white rounded-2xl border border-[#0E3B24]/15 p-5 shadow-sm flex flex-col justify-between gap-4">
            <div className="flex items-start justify-between gap-4">
              <ul className="space-y-1.5 text-sm text-[#111D15]/80">
                {PROTEA_HOTEL_OFFER.highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#0E3B24] mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col items-end gap-1.5 shrink-0 text-right">
                <BedDouble className="w-5 h-5 text-[#0E3B24]" aria-hidden="true" />
                <a
                  href="https://www.marriott.com/en-us/hotels/ebben-protea-hotel-entebbe/overview/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#0E3B24] hover:underline whitespace-nowrap"
                >
                  See Hotel Photos
                </a>
              </div>
            </div>

            <a
              href="#tickets"
              className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 self-start"
            >
              <span>Unlock 50% Stay with Ticket</span>
              <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* 3 Official Protea Hotel by Marriott Entebbe Photos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PROTEA_HOTEL_OFFER.features.map((feature) => (
            <article
              key={feature.id}
              className="bg-white rounded-2xl overflow-hidden border border-[#0E3B24]/15 flex flex-col"
            >
              <div className="relative aspect-[16/10] bg-[#0E3B24] overflow-hidden">
                {failedImages[feature.id] ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 p-4">
                    <ImageOff className="w-6 h-6 mb-1" aria-hidden="true" />
                    <span className="text-xs">{feature.title}</span>
                  </div>
                ) : (
                  <img
                    src={feature.image}
                    alt={feature.alt}
                    referrerPolicy="no-referrer"
                    onError={() => markFailed(feature.id)}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-4">
                <p className="text-xs font-medium text-[#0E3B24]/70 mb-0.5">{feature.label}</p>
                <h3 className="font-serif text-lg font-semibold text-[#0E3B24] mb-1">
                  {feature.title}
                </h3>
                <p className="text-xs sm:text-sm text-[#111D15]/75">{feature.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
