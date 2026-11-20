export interface TicketTier {
  id: 'solo' | 'duo';
  name: string;
  priceUgx: number;
  guestsIncluded: number;
  summary: string;
}

export interface GallerySlide {
  id: string;
  index: string;
  pillar: string;
  title: string;
  caption: string;
  image: string;
  alt: string;
}

export interface SignatureMoment {
  index: string;
  timeWindow: string;
  title: string;
  description: string;
}

export interface HotelFeature {
  id: string;
  label: string;
  title: string;
  description: string;
  image: string;
  alt: string;
}

export const EVENT_INFO = {
  brand: 'THE COURSE',
  tagline: "A Patrons' Gathering",
  ctaLine: 'An arrangement of taste and tone.',
  narrativeLine: 'For the love of the drive—and everything that happens when you arrive.',
  dateLabel: 'Saturday, 19 December 2026',
  shortDate: '19 December 2026',
  venue: 'Entebbe Golf Club',
  organiser: 'Fusion Media',
  organiserNote: 'Creators of The Auto Show Kampala',
  phones: ['0777 075 940', '0702 609 811'],
  email: 'connect@autoshowkampala.com',
  hashtags: '#TheCourseUG · #APatronsGathering',
  logoPath: '/assets/aistudio/The_Course_Profile_edit_bab94824.jpeg',
  kvImagePath: '/assets/aistudio/WhatsApp_Image_2026-11-20_at_2.35.06_PM_5494ab07.jpeg',
  videoPath: '/assets/aistudio/WhatsApp_Video_2026-11-10_at_10.33.38_PM_7f2893e0.mp4',
  venueVideoPath: '/assets/aistudio/kling_20261113_VIDEO_Create_a_r_668_0_2_24e1e7a6.mp4',
} as const;

export const TICKET_TIERS: TicketTier[] = [
  {
    id: 'solo',
    name: 'The Solo Drive-in Pass',
    priceUgx: 250_000,
    guestsIncluded: 1,
    summary: '1 patron · Full-day drive-in lawn access + 50% Protea stay privilege.',
  },
  {
    id: 'duo',
    name: 'The Drive-in Duo Pass',
    priceUgx: 400_000,
    guestsIncluded: 2,
    summary: '2 patrons · Shared vehicle lawn access + 50% Protea stay privilege.',
  },
];

export const GALLERY_SLIDES: GallerySlide[] = [
  {
    id: 'cars',
    index: '01',
    pillar: 'Exceptional Cars',
    title: 'Drive In & Park on the Greens',
    caption: 'Classics, exotics, 4x4s, and daily builds arranged across the fairways.',
    image: '/src/assets/images/gallery_cars_entebbe_patrons_1795119362618.jpg',
    alt: 'Classic and luxury cars parked on sunlit Entebbe golf greens beside pallet lounges, parasols, and patrons',
  },
  {
    id: 'rc-track',
    index: '02',
    pillar: 'Petrol RC Track',
    title: 'Lawn-Side Petrol RC Circuit',
    caption: 'Compact enclosed RC oval surrounded by parasols, pallet lounges, and picnic mats.',
    image: '/src/assets/images/gallery_rc_track_picnic_1795119362192.jpg',
    alt: 'Compact petrol RC oval racing circuit surrounded by cream parasols, wooden pallet seats, picnic mats, and parked cars',
  },
  {
    id: 'golf',
    index: '03',
    pillar: 'Championship Golf',
    title: 'Fairway Play & Putting',
    caption: 'Championship rounds on the Entebbe greens plus lawn-side putting.',
    image: '/src/assets/images/gallery_golf_play_1795108287361.jpg',
    alt: 'Golfer finishing an iron swing on an Entebbe fairway overlooking Lake Victoria',
  },
  {
    id: 'catwalk',
    index: '04',
    pillar: 'Stage Catwalk',
    title: 'Evening Catwalk on Stage',
    caption: 'Runway fashion right on the main stage just before the live band.',
    image: '/src/assets/images/gallery_stage_catwalk_trees_1795120079833.jpg',
    alt: 'Evening fashion runway extending from The Course stage inside a tree-lined green oval flanked by classic cars',
  },
  {
    id: 'music',
    index: '05',
    pillar: 'Live Band',
    title: 'Post-Catwalk Live Band',
    caption: 'Live band takes the stage immediately after the runway into nightfall.',
    image: '/src/assets/images/gallery_live_band_trees_1795120124281.jpg',
    alt: 'Sharp 3/4 perspective view of the live band performing on The Course stage framed by a perimeter circle of trees at twilight',
  },
  {
    id: 'dining',
    index: '06',
    pillar: 'Fine Dining',
    title: 'Fine Dining Outdoors',
    caption: 'Curated dining and artisan cocktails under shaded lawn parasols.',
    image: '/src/assets/images/gallery_fine_dining_entebbe_1795119362493.jpg',
    alt: 'Guests dining outdoors at a wooden fairway table under a cream parasol overlooking Lake Victoria',
  },
  {
    id: 'poker',
    index: '07',
    pillar: 'High-Stakes Poker',
    title: 'Lawn Poker Under Lit Parasols',
    caption: 'Picnic-style pallet seating and poker tables outdoors under lit parasols.',
    image: '/src/assets/images/gallery_poker_parasol_picnic_1795119362097.jpg',
    alt: 'Patrons playing poker outdoors on the golf lawn in pallet seating and camp chairs beneath a lit parasol at dusk',
  },
];

export const SIGNATURE_MOMENTS: SignatureMoment[] = [
  {
    index: '01',
    timeWindow: 'Morning',
    title: 'THE ROLL-IN',
    description: 'Clubs and friends arrive together. The entrance itself becomes content.',
  },
  {
    index: '02',
    timeWindow: 'Midday',
    title: 'KEYS PLEASE',
    description:
      'Scheduled call-outs bring categories together for quick owner moments and group photographs.',
  },
  {
    index: '03',
    timeWindow: 'Afternoon',
    title: 'PEOPLE’S PICK',
    description: 'One crowd-voted favourite. No complicated judging; just the car people loved most.',
  },
  {
    index: '04',
    timeWindow: 'Nightfall',
    title: 'THE LAST LAP',
    description: 'Departure moments that close the day with stage performances, pomp, movement and energy.',
  },
];

export const PROTEA_HOTEL_OFFER = {
  partnerName: 'Protea Hotel by Marriott Entebbe',
  headline: '50% off double occupancy at Protea Hotel Entebbe.',
  benefitTitle: 'Automatic 50% Discount · Double Occupancy Room',
  summary:
    'Every ticket purchased automatically includes 50% off a double occupancy room on the shores of Lake Victoria—minutes from Entebbe Golf Club.',
  highlights: [
    'Automatic with every Solo or Duo Drive-in Pass',
    'Valid for Double Occupancy Queen or Twin rooms',
    'Lakeside pool, Tides terrace dining, 5 mins from course',
  ],
  features: [
    {
      id: 'pool',
      label: 'Lakefront Pool',
      title: 'Pool & Tropical Gardens',
      description: 'Poolside loungers steps from Lake Victoria.',
      image: '/assets/protea/protea-pool.jpg',
      alt: 'Protea Hotel by Marriott Entebbe outdoor swimming pool, palm trees, and sun loungers',
    },
    {
      id: 'room',
      label: '50% Off Room',
      title: 'Double Occupancy Rooms',
      description: 'Spacious double rooms with lake-view balconies.',
      image: '/assets/protea/protea-deluxe-room.jpg',
      alt: 'Protea Hotel by Marriott Entebbe double occupancy guestroom with balcony light',
    },
    {
      id: 'terrace',
      label: 'Shoreline Lounge',
      title: 'Lake Victoria Terrace',
      description: 'Open-air lakeside seating right on the water.',
      image: '/assets/protea/protea-terrace.jpg',
      alt: 'Protea Hotel by Marriott Entebbe outdoor lounge terrace overlooking Lake Victoria',
    },
  ] satisfies HotelFeature[],
} as const;

export function formatUgx(amount: number): string {
  return `UGX ${amount.toLocaleString('en-UG')}`;
}
