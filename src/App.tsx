import { useState } from 'react';
import { ArrowDownRight, BedDouble, CalendarDays, Flag, MapPin } from 'lucide-react';
import { AccordionGallery } from './components/AccordionGallery';
import { EventCountdown } from './components/EventCountdown';
import { HostPortalModal } from './components/HostPortalModal';
import { ProteaStaySection } from './components/ProteaStaySection';
import { TeaserVideoPlayer } from './components/TeaserVideoPlayer';
import { TicketFormSection } from './components/TicketFormSection';
import { EVENT_INFO, SIGNATURE_MOMENTS } from './data/eventData';

export default function App() {
  const [isHostPortalOpen, setIsHostPortalOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#111D15]">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-sm border-b border-[#0E3B24]/12 print:hidden">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="https://thecourse.autoshowkampala.com/"
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
            Buy Tickets
          </a>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Section with Official Logo, Countdown & Extreme-Right KV Poster */}
        <section id="gathering" className="pt-2 pb-8 sm:pt-3 sm:pb-12 print:hidden">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-stretch">
              <div className="md:col-span-8 lg:col-span-7 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 lg:gap-3 xl:gap-4 w-full max-w-[615px]">
                    <img
                      src={EVENT_INFO.logoPath}
                      alt="The Course — A Patrons' Gathering official emblem"
                      referrerPolicy="no-referrer"
                      className="w-28 h-28 md:w-28 md:h-28 lg:w-36 lg:h-36 xl:w-40 xl:h-40 rounded-2xl object-cover border border-[#C5A246]/45 shadow-sm shrink-0"
                    />
                    <div className="min-w-0 shrink-0">
                      <p className="text-xs font-medium text-[#0E3B24]/75">
                        <span className="block">{EVENT_INFO.dateLabel}</span>
                        <span className="block">{EVENT_INFO.venue}</span>
                      </p>
                      <p className="font-serif text-base lg:text-lg xl:text-xl font-semibold text-[#0E3B24]">
                        <span className="block">{EVENT_INFO.brand}</span>
                        <span className="block text-xs lg:text-sm xl:text-base font-medium italic text-[#0E3B24]/85">
                          - {EVENT_INFO.tagline} -
                        </span>
                      </p>
                    </div>
                    <EventCountdown />
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
                    <span>Buy Tickets</span>
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

              <div className="md:col-span-4 lg:col-span-5 flex items-center justify-end">
                <img
                  src={EVENT_INFO.kvImagePath}
                  alt="The Course — A Patrons' Gathering key visual poster for 19 December 2026 at Entebbe Golf Course"
                  referrerPolicy="no-referrer"
                  className="w-full max-w-[400px] aspect-[4/5] object-cover rounded-2xl border border-[#C5A246]/35 shadow-sm md:ml-auto"
                />
              </div>
            </div>

            {/* Dual Teaser Video Theater (Left) & Top-Aligned Details + Height-Bound Signature Moments (Right) */}
            <div className="mt-9 pt-7 border-t border-[#0E3B24]/15 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-5 text-left">
                <TeaserVideoPlayer />
              </div>

              <div className="lg:col-span-7 flex flex-col justify-between gap-5 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0E3B24]/[0.06] border border-[#0E3B24]/15 text-[#0E3B24] shrink-0 mt-0.5">
                      <CalendarDays className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs text-[#111D15]/60 mb-0.5">Date</p>
                      <p className="text-sm font-semibold text-[#0E3B24]">{EVENT_INFO.dateLabel}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0E3B24]/[0.06] border border-[#0E3B24]/15 text-[#0E3B24] shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs text-[#111D15]/60 mb-0.5">Venue</p>
                      <p className="text-sm font-semibold text-[#0E3B24]">Entebbe Golf Club Oval</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0E3B24]/[0.06] border border-[#0E3B24]/15 text-[#0E3B24] shrink-0 mt-0.5">
                      <Flag className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs text-[#111D15]/60 mb-0.5">On the Greens</p>
                      <p className="text-sm font-semibold text-[#0E3B24]">
                        Championship Golf · Exquisite Cars
                        <br />
                        Fashion Catwalk · Live Band · Endless Barbecue
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#0E3B24]/[0.06] border border-[#0E3B24]/15 text-[#0E3B24] shrink-0 mt-0.5">
                      <BedDouble className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="text-xs text-[#111D15]/60 mb-0.5">Stay Privilege</p>
                      <p className="text-sm font-semibold text-[#0E3B24]">
                        50% Discount for Double Occupancy
                        <br />
                        At Protea Hotel (Marriott), Entebbe
                      </p>
                    </div>
                  </div>
                </div>

                {/* Height-Bound Signature Moments Sub-Div */}
                <div className="flex-1 bg-white rounded-2xl border border-[#0E3B24]/15 p-4 sm:p-5 shadow-sm flex flex-col justify-between gap-3.5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#0E3B24]/70">
                      Signature Moments
                    </p>
                    <h3 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-[#0E3B24] mt-0.5">
                      Things people will remember — and post.
                    </h3>
                    <p className="text-sm text-[#111D15]/75 mt-0.5">
                      The simple mechanics that describe The Course.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                    {SIGNATURE_MOMENTS.map((moment) => (
                      <div
                        key={moment.index}
                        className="rounded-xl bg-[#FAF8F3]/80 border border-[#0E3B24]/12 p-4 flex flex-col justify-center"
                      >
                        <h4 className="text-sm font-bold tracking-wide text-[#0E3B24] uppercase mb-1">
                          {moment.title}
                        </h4>
                        <p className="text-xs sm:text-sm leading-relaxed text-[#111D15]/80">
                          {moment.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Accordion Player Gallery */}
        <div className="print:hidden">
          <AccordionGallery />
        </div>

        {/* Protea Hotel Entebbe 50% Double Occupancy Section (Official Hotel Photos) */}
        <div className="print:hidden">
          <ProteaStaySection />
        </div>

        {/* Ticket Buying Form & QR Code */}
        <TicketFormSection />
      </main>

      {/* Quiet Compact Footer */}
      <footer className="bg-[#0E3B24] text-[#FAF8F3] border-t border-[#C5A246]/25 print:hidden">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-9">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-5 border-b border-white/15">
            <div>
              <p className="font-serif text-lg font-semibold text-white">
                {EVENT_INFO.brand} — {EVENT_INFO.tagline}
              </p>
              <p className="text-xs text-[#E2CB7A] mt-0.5">
                {EVENT_INFO.dateLabel} · {EVENT_INFO.venue} · {EVENT_INFO.hashtags}
              </p>
            </div>

            <div className="flex items-end justify-between md:justify-end gap-6">
              <div className="flex flex-col md:items-end gap-1 text-sm text-white/85">
                <span className="font-mono tabular-nums">{EVENT_INFO.phones.join(' · ')}</span>
                <a
                  href={`mailto:${EVENT_INFO.email}`}
                  className="hover:text-[#E2CB7A] underline underline-offset-4 transition-colors w-fit"
                >
                  {EVENT_INFO.email}
                </a>
              </div>

              <button
                type="button"
                onClick={() => setIsHostPortalOpen(true)}
                className="text-xs font-semibold text-[#E2CB7A] hover:text-white border border-[#E2CB7A]/40 hover:border-[#E2CB7A] rounded-md px-2.5 py-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Host Login
              </button>
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

      <HostPortalModal isOpen={isHostPortalOpen} onClose={() => setIsHostPortalOpen(false)} />
    </div>
  );
}
