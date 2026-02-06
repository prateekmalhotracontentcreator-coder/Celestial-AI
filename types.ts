
export type Rashi = 'Aries' | 'Taurus' | 'Gemini' | 'Cancer' | 'Leo' | 'Virgo' | 'Libra' | 'Scorpio' | 'Sagittarius' | 'Capricorn' | 'Aquarius' | 'Pisces';

export interface HoroscopeData {
  prediction: string;
  luckyNumber: number;
  luckyColor: string;
  remedy: string;
  energyLevel: number;
}

export interface CosmicEvent {
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
}

export interface UserProfile {
  name: string;
  rashi: Rashi;
  isPremium: boolean;
  joinedDate: string;
}

export interface BlogPost {
  id: number | string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  date: string;
  image?: string; // URL to an image (jpg, png)
  video?: string; // URL to a video (mp4, webm)
  pdf?: string;   // URL to a PDF document
}

export enum AppSection {
  DASHBOARD = 'DASHBOARD',
  HOROSCOPE = 'HOROSCOPE',
  BIRTH_CHART = 'BIRTH_CHART',
  VASTU = 'VASTU',
  PANDITJI = 'PANDITJI',
  REMEDIES = 'REMEDIES',
  CALENDAR = 'CALENDAR',
  PREMIUM = 'PREMIUM',
  KUNDALI_MILAN = 'KUNDALI_MILAN',
  DOWNLOADS = 'DOWNLOADS',
  EVENTS = 'EVENTS',
  BLOG = 'BLOG'
}
