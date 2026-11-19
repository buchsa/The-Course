import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, Pause, Play } from 'lucide-react';
import { GALLERY_SLIDES } from '../data/eventData';

export function AccordionGallery() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % GALLERY_SLIDES.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying]);

  const handleSelect = (idx: number) => {
    setActiveIndex(idx);
  };

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + GALLERY_SLIDES.length) % GALLERY_SLIDES.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % GALLERY_SLIDES.length);
  };

  const markImageFailed = (id: string) => {
    setFailedImages((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <section id="gallery" className="py-12 sm:py-14 border-t border-[#0E3B24]/10">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-medium tracking-wide text-[#0E3B24]/70 mb-1">
              Experience Gallery
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-[#0E3B24]">
              Inside the Gathering.
            </h2>
          </div>

          <div
            className="flex items-center gap-2 self-start md:self-auto"
            role="group"
            aria-label="Gallery accordion player controls"
          >
            <span className="font-mono tabular-nums text-xs text-[#0E3B24]/75 pr-2">
              {String(activeIndex + 1).padStart(2, '0')} / {String(GALLERY_SLIDES.length).padStart(2, '0')}
            </span>

            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous gallery panel"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#0E3B24]/20 bg-white text-[#0E3B24] hover:bg-[#0E3B24]/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setIsAutoPlaying((prev) => !prev)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#0E3B24] text-[#FAF8F3] text-xs font-medium hover:bg-[#134d30] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
            >
              {isAutoPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleNext}
              aria-label="Next gallery panel"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#0E3B24]/20 bg-white text-[#0E3B24] hover:bg-[#0E3B24]/5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Desktop Horizontal Expanding Accordion */}
        <div
          className="hidden md:flex gap-2.5 h-[400px] w-full"
          role="tablist"
          aria-label="The Course Experience Gallery"
        >
          {GALLERY_SLIDES.map((slide, idx) => {
            const isActive = idx === activeIndex;
            const hasFailed = Boolean(failedImages[slide.id]);

            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleSelect(idx)}
                className={`group relative overflow-hidden rounded-2xl text-left border transition-[flex-grow,border-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24] ${
                  isActive
                    ? 'flex-[4.5] border-[#0E3B24]/30 shadow-sm'
                    : 'flex-[0.85] border-[#0E3B24]/15 hover:flex-[1.1]'
                }`}
              >
                {hasFailed ? (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#0E3B24] to-[#1C5E3B] flex flex-col items-center justify-center p-6 text-white/80">
                    <ImageOff className="w-7 h-7 mb-2 opacity-70" aria-hidden="true" />
                    <span className="text-sm font-medium">{slide.title}</span>
                  </div>
                ) : (
                  <img
                    src={slide.image}
                    alt={slide.alt}
                    referrerPolicy="no-referrer"
                    onError={() => markImageFailed(slide.id)}
                    className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out ${
                      isActive ? 'scale-100' : 'scale-105 group-hover:scale-100'
                    }`}
                  />
                )}

                <div
                  className={`absolute inset-0 transition-opacity duration-300 ${
                    isActive
                      ? 'bg-gradient-to-t from-black/85 via-black/30 to-black/10'
                      : 'bg-gradient-to-t from-black/80 via-black/45 to-black/25'
                  }`}
                />

                {!isActive && (
                  <div className="relative z-10 h-full flex flex-col items-center justify-between py-5 px-2 text-white">
                    <span className="font-mono tabular-nums text-xs text-[#E2CB7A]">{slide.index}</span>
                    <span className="text-xs font-medium tracking-wide whitespace-nowrap [writing-mode:vertical-rl] rotate-180 text-white/95">
                      {slide.pillar}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40" aria-hidden="true" />
                  </div>
                )}

                {isActive && (
                  <div className="relative z-10 h-full flex flex-col justify-end p-6 text-white max-w-lg">
                    <p className="text-xs font-medium text-[#E2CB7A] mb-1">
                      {slide.index}. {slide.pillar}
                    </p>
                    <h3 className="font-serif text-2xl font-semibold text-white mb-1.5">
                      {slide.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-white/85">{slide.caption}</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Mobile Vertical Accordion */}
        <div className="md:hidden space-y-2.5">
          {GALLERY_SLIDES.map((slide, idx) => {
            const isActive = idx === activeIndex;
            const hasFailed = Boolean(failedImages[slide.id]);

            return (
              <div
                key={slide.id}
                className="rounded-xl overflow-hidden border border-[#0E3B24]/15 bg-white"
              >
                <button
                  type="button"
                  onClick={() => handleSelect(idx)}
                  aria-expanded={isActive}
                  className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left bg-white hover:bg-[#FAF8F3] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono tabular-nums text-xs font-semibold text-[#0E3B24]">
                      {slide.index}
                    </span>
                    <span className="text-sm font-semibold text-[#111D15] truncate">
                      {slide.pillar}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[#0E3B24]/70 shrink-0">
                    {isActive ? 'Open' : 'View'}
                  </span>
                </button>

                {isActive && (
                  <div className="border-t border-[#0E3B24]/10">
                    <div className="relative aspect-[4/3] bg-[#0E3B24]">
                      {hasFailed ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 p-4">
                          <ImageOff className="w-6 h-6 mb-1" aria-hidden="true" />
                          <span className="text-xs">{slide.title}</span>
                        </div>
                      ) : (
                        <img
                          src={slide.image}
                          alt={slide.alt}
                          referrerPolicy="no-referrer"
                          onError={() => markImageFailed(slide.id)}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="p-4 bg-white">
                      <h3 className="font-serif text-lg font-semibold text-[#0E3B24] mb-1">
                        {slide.title}
                      </h3>
                      <p className="text-sm text-[#111D15]/80">{slide.caption}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
