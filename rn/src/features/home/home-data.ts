import type { ImageSourcePropType } from 'react-native';

export type Attendance = 'Waitlisted' | 'Going' | 'Invited';
export type EventPreview = {
  id: string;
  title: string;
  host: string;
  artwork?: ImageSourcePropType | { uri: string } | null;
  hostAvatar?: ImageSourcePropType | { uri: string };
  time: string;
  location: string;
  attendance?: Attendance;
  price?: string;
  status?: string;
  nearCapacity?: boolean;
};

const artwork = {
  founders: require('../../../assets/events/founders.png'),
  dogs: require('../../../assets/events/dogs.png'),
  eclipse: require('../../../assets/events/eclipse.png'),
  afterHours: require('../../../assets/events/after-hours.png'),
  design: require('../../../assets/events/design-week.png'),
  worldCup: require('../../../assets/events/world-cup.png'),
  embroidery: require('../../../assets/events/embroidery.png'),
  pages: require('../../../assets/events/morning-pages.png'),
  books: require('../../../assets/events/books.png'),
};
const hosts = {
  founders: require('../../../assets/events/host-founders.png'),
  dogs: require('../../../assets/events/host-dogs.png'),
  alex: require('../../../assets/events/host-alex.png'),
  coffee: require('../../../assets/events/host-coffee.png'),
  design: require('../../../assets/events/host-design.png'),
  relay: require('../../../assets/events/host-relay.png'),
  folk: require('../../../assets/events/host-folk.png'),
  paper: require('../../../assets/events/host-paper.png'),
  books: require('../../../assets/events/host-books.png'),
};

// Screenshot-derived fixtures for the UI prototype; these are not live events.
export const yourEvents: EventPreview[] = [
  { id: 'founders', title: 'Extraordinary Founders Dinner (hosted by Andrew Yeung)', host: "Andrew’s Yeung’s Tech Events", artwork: artwork.founders, hostAvatar: hosts.founders, time: 'Today, 6:00 PM GMT-7', location: 'Showplace Square', attendance: 'Waitlisted' },
  { id: 'dogs', title: 'Paws, People & Purpose', host: 'Dogs Only Social Club and Big Dog...', artwork: artwork.dogs, hostAvatar: hosts.dogs, time: '18 Jul, 2:00 PM GMT-7', location: 'GoodPeople', attendance: 'Going' },
  { id: 'eclipse', title: '🌒 Solar Eclipse Viewing Party', host: 'Alex Smith', artwork: artwork.eclipse, hostAvatar: hosts.alex, time: '22 Jul, 1:30 PM GMT-7', location: '1226 University Dr', attendance: 'Invited' },
];

export const nearbyGroups: { date: string; weekday: string; events: EventPreview[] }[] = [
  { date: 'Tomorrow', weekday: 'Wednesday', events: [
    { id: 'after-hours', title: "after hours: a happy hour for la's creatives and founders", host: 'Creative Coffee Club', artwork: artwork.afterHours, hostAvatar: hosts.coffee, time: '5:30 PM GMT-7', location: 'Tu Madre - West Hollywood', price: 'US$10' },
  ] },
  { date: '2 July', weekday: 'Thursday', events: [
    { id: 'design', title: 'LADW 2026 Host Application', host: 'LA Design Weekend and Emily Ibarra', artwork: artwork.design, hostAvatar: hosts.design, time: '11:00 AM GMT-7', location: 'Los Angeles' },
    { id: 'world-cup', title: 'Gundo World Cup Watch Party: USA vs Everybody', host: 'Relay Industries', artwork: artwork.worldCup, hostAvatar: hosts.relay, time: '4:30 PM GMT-7', location: 'El Segundo, CA' },
  ] },
  { date: '19 July', weekday: 'Sunday', events: [
    { id: 'embroidery', title: 'Embroidery Social Level 0 ✥ Barnsdall Art Park (free)', host: 'Folk Lounge - Textile...', artwork: artwork.embroidery, hostAvatar: hosts.folk, time: '10:00 AM GMT-7', location: 'Barnsdall Art Park', nearCapacity: true },
    { id: 'pages', title: 'Morning Pages: Monthly Journaling Meetup & Stationery...', host: 'Paper Plant Co and Krystie...', artwork: artwork.pages, hostAvatar: hosts.paper, time: '11:00 AM GMT-7', location: 'Paper Plant Co', price: 'US$5' },
    { id: 'dogs-nearby', title: 'Paws, People & Purpose', host: 'Dogs Only Social Club and Big Dog...', artwork: artwork.dogs, hostAvatar: hosts.dogs, time: '2:00 PM GMT-7', location: 'GoodPeople' },
  ] },
  { date: '20 July', weekday: 'Monday', events: [
    { id: 'books', title: 'Between the Pages | Afternoon Tea', host: 'Reading Rhythms California', artwork: artwork.books, hostAvatar: hosts.books, time: '4:00 PM GMT-7', location: 'Chado Tea Room', price: 'US$20' },
  ] },
];
