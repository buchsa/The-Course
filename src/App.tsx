import { ArrowDownRight } from 'lucide-react';
import { AccordionGallery } from './components/AccordionGallery';
import { ProteaStaySection } from './components/ProteaStaySection';
import { TeaserVideoPlayer } from './components/TeaserVideoPlayer';
import { TicketFormSection } from './components/TicketFormSection';
import { EVENT_INFO } from './data/eventData';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#111D15]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-sm border-b border-[#0E3B24]/12">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-serif text-lg sm:text-xl font-bold tracking-tight text-[#0E3B24] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0E3B24]"
          >
            {EVENT_INFO.brand}
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#111D15]/75"
          >
            <a
              href="#gathering"
              className="hover:text-[#0E3B24] transition-colors whitespace-nowrap shrink-0"
            >
              The Gathering
            </a>
            <a
              href="#gallery"
              className="hover:text-[#0E3B24] transition-colors whitespace-nowrap shrink-0"
            >
              Gallery
            </a>
            <a
              href="#stay"
              className="hover:text-[#0E3B24] transition-colors whitespace-nowrap shrink-0"
            >
              Protea Stay
            </a>
            <a
              href="#tickets"
              className="hover:text-[#0E3B24] transition-colors whitespace-nowrap shrink-0"
            >
              Tickets
            </a>
          </nav>

          <a
            href="#tickets"
            className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
          >
            Buy Passes
          </a>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Section with Official Logo & Dual Video Theater Right After Header */}
        <section id="gathering" className="py-8 sm:py-12">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={EVENT_INFO.logoPath}
                      alt="The Course — A Patrons' Gathering official emblem"
                      referrerPolicy="no-referrer"
                      className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover border border-[#C5A246]/40 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[#0E3B24]/75">
                        <span className="block">{EVENT_INFO.dateLabel}</span>
                        <span className="block">{EVENT_INFO.venue}</span>
                      </p>
                      <p className="font-serif text-lg sm:text-xl font-semibold text-[#0E3B24]">
                        <span className="block">{EVENT_INFO.brand}</span>
                        <span className="block text-sm sm:text-base font-medium italic text-[#0E3B24]/85">
                          - {EVENT_INFO.tagline} -
                        </span>
                      </p>
                    </div>
                  </div>

                  <h1 className="font-serif text-[clamp(2.25rem,4vw,3.5rem)] leading-[1.08] font-semibold tracking-tight text-[#0E3B24]">
                    {EVENT_INFO.ctaLine}
                  </h1>

                  <p className="text-base text-[#111D15]/80 leading-relaxed max-w-lg">
                    Exceptional cars, championship golf, live band, stunning fashion, high-stakes
                    poker, fine dining, all in great company!
                  </p>

                  <p className="font-serif italic text-sm sm:text-base text-[#0E3B24]/85">
                    {EVENT_INFO.narrativeLine}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href="#tickets"
                    className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-[#0E3B24] hover:bg-[#134d30] text-[#FAF8F3] text-sm font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E3B24]"
                  >
                    <span>Buy Passes</span>
                    <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                  </a>

                  <a
                    href="#gallery"
                    className="inline-flex items-center justify-center h-11 px-5 rounded-xl border border-[#0E3B24]/25 bg-white hover:bg-[#0E3B24]/5 text-[#0E3B24] text-sm font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    Explore Gallery
                  </a>
                </div>
              </div>

              <div className="lg:col-span-5">
                <TeaserVideoPlayer />
              </div>
            </div>

            {/* Compact 4-Column Key Info Strip */}
            <div className="mt-9 pt-6 border-t border-[#0E3B24]/15 grid grid-cols-2 lg:grid-cols-4 gap-5">
              <div>
                <p className="text-xs text-[#111D15]/60 mb-0.5">Date</p>
                <p className="text-sm font-semibold text-[#0E3B24]">{EVENT_INFO.dateLabel}</p>
              </div>
              <div>
                <p className="text-xs text-[#111D15]/60 mb-0.5">Venue</p>
                <p className="text-sm font-semibold text-[#0E3B24]">{EVENT_INFO.venue}</p>
              </div>
              <div>
                <p className="text-xs text-[#111D15]/60 mb-0.5">On the Greens</p>
                <p className="text-sm font-semibold text-[#0E3B24]">
                  Petrol RC Track · Catwalk · Live Band
                </p>
              </div>
              <div>
                <p className="text-xs text-[#111D15]/60 mb-0.5">Stay Privilege</p>
                <p className="text-sm font-semibold text-[#0E3B24]">
                  50% Off Protea Hotel Entebbe
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Accordion Player Gallery */}
        <AccordionGallery />

        {/* Protea Hotel Entebbe 50% Double Occupancy Section (Official Hotel Photos) */}
        <ProteaStaySection />

        {/* Ticket Buying Form & QR Code */}
        <TicketFormSection />
      </main>

      {/* Quiet Compact Footer */}
      <footer className="bg-[#0E3B24] text-[#FAF8F3] border-t border-[#C5A246]/25">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-9">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/15">
            <div>
              <p className="font-serif text-lg font-semibold text-white">
                {EVENT_INFO.brand} — {EVENT_INFO.tagline}
              </p>
              <p className="text-xs text-[#E2CB7A] mt-0.5">
                {EVENT_INFO.dateLabel} · {EVENT_INFO.venue} · {EVENT_INFO.hashtags}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/85">
              <span className="font-mono tabular-nums">{EVENT_INFO.phones.join(' · ')}</span>
              <a
                href={`mailto:${EVENT_INFO.email}`}
                className="hover:text-[#E2CB7A] underline underline-offset-4 transition-colors"
              >
                {EVENT_INFO.email}
              </a>
            </div>
          </div>

          <div className="pt-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-white/60">
            <p>© 2026 {EVENT_INFO.organiser} ({EVENT_INFO.organiserNote}).</p>
            <div className="flex items-center gap-5">
              <a href="#gathering" className="hover:text-white transition-colors">
                The Gathering
              </a>
              <a href="#gallery" className="hover:text-white transition-colors">
                Gallery
              </a>
              <a href="#stay" className="hover:text-white transition-colors">
                Protea Stay
              </a>
              <a href="#tickets" className="hover:text-white transition-colors">
                Tickets
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
