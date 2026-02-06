
import React from 'react';
import { Rashi } from './types';

export const RASHIS: { name: Rashi; icon: string; sanskrit: string }[] = [
  { name: 'Aries', icon: '♈', sanskrit: 'Mesh' },
  { name: 'Taurus', icon: '♉', sanskrit: 'Vrishabh' },
  { name: 'Gemini', icon: '♊', sanskrit: 'Mithun' },
  { name: 'Cancer', icon: '♋', sanskrit: 'Kark' },
  { name: 'Leo', icon: '♌', sanskrit: 'Simha' },
  { name: 'Virgo', icon: '♍', sanskrit: 'Kanya' },
  { name: 'Libra', icon: '♎', sanskrit: 'Tula' },
  { name: 'Scorpio', icon: '♏', sanskrit: 'Vrishchik' },
  { name: 'Sagittarius', icon: '♐', sanskrit: 'Dhanu' },
  { name: 'Capricorn', icon: '♑', sanskrit: 'Makar' },
  { name: 'Aquarius', icon: '♒', sanskrit: 'Kumbh' },
  { name: 'Pisces', icon: '♓', sanskrit: 'Meen' },
];

// --- ASTRONOMICAL CALCULATION ENGINE (Delhi Coordinates: 28.61° N, 77.20° E) ---
// This ensures "No day will be same the next week" as requested.

const toRadians = (deg: number) => deg * Math.PI / 180;
const toDegrees = (rad: number) => rad * 180 / Math.PI;

const formatTime = (minutesFromMidnight: number) => {
    let h = Math.floor(minutesFromMidnight / 60);
    const m = Math.floor(minutesFromMidnight % 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
};

const getSunTimes = (date: Date) => {
    // 1. Day of Year
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    // 2. Equation of Time (EoT) & Declination (Approximate)
    const B = (360 / 365) * (dayOfYear - 81);
    const eot = 9.87 * Math.sin(toRadians(2 * B)) - 7.53 * Math.cos(toRadians(B)) - 1.5 * Math.sin(toRadians(B));
    
    // 3. Solar Noon (UTC) -> Local Time
    // Delhi Longitude: 77.2, Standard Meridian: 82.5 (IST)
    // Correction = (Standard - Local) * 4 minutes
    const longitudeCorrection = (82.5 - 77.2) * 4; 
    const localNoonMinutes = 720 + longitudeCorrection - eot; // 12:00 PM +/- corrections

    // 4. Sunrise/Sunset Hour Angle
    // cos(w) = -tan(lat) * tan(decl)
    // Declination approx: 23.45 * sin(360/365 * (d - 81))
    const declination = 23.45 * Math.sin(toRadians((360 / 365) * (dayOfYear - 81)));
    const lat = 28.61;
    
    // Hour Angle (w)
    const cosW = -Math.tan(toRadians(lat)) * Math.tan(toRadians(declination));
    const w = toDegrees(Math.acos(cosW)); // Degrees
    const durationHalfMinutes = w * 4;

    const sunriseMinutes = localNoonMinutes - durationHalfMinutes;
    const sunsetMinutes = localNoonMinutes + durationHalfMinutes;

    return {
        sunrise: sunriseMinutes,
        sunset: sunsetMinutes,
        noon: localNoonMinutes,
        dayDuration: sunsetMinutes - sunriseMinutes
    };
};

const getDailyMuhurats = (date: Date) => {
    const sun = getSunTimes(date);
    const dayIndex = date.getDay(); // 0=Sun, 1=Mon...

    // Rahu Kaal Segments (1-8 from Sunrise)
    // Mon(2), Tue(7), Wed(5), Thu(6), Fri(4), Sat(3), Sun(8)
    const rahuSegments = [8, 2, 7, 5, 6, 4, 3]; // Index 0 is Sunday
    const segmentIndex = rahuSegments[dayIndex] - 1; // 0-based index
    
    const segmentDuration = sun.dayDuration / 8;
    const rahuStart = sun.sunrise + (segmentIndex * segmentDuration);
    const rahuEnd = rahuStart + segmentDuration;

    // Abhijit (Mid-day, 8th Muhurat of 15)
    // Approx 48 mins centered on Solar Noon
    const abhijitStart = sun.noon - 24;
    const abhijitEnd = sun.noon + 24;

    return {
        sunrise: formatTime(sun.sunrise),
        sunset: formatTime(sun.sunset),
        rahuStart: formatTime(rahuStart),
        rahuEnd: formatTime(rahuEnd),
        abhijitStart: formatTime(abhijitStart),
        abhijitEnd: formatTime(abhijitEnd),
        noonMinutes: sun.noon
    };
};

// Initial Calculation for Today
const today = new Date();
const cosmicData = getDailyMuhurats(today);

export const PANCHANG_DATA = {
  // Date-Specific Data (Dynamic)
  date: today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  tithi: 'Dwitiya', // This requires complex lunar calc, keeping static for display
  nakshatra: 'Magha',
  yoga: 'Shobhana',
  karana: 'Taitila',
  weekday: today.toLocaleDateString('en-US', { weekday: 'long' }),
  paksha: 'Krishna Paksha',
  
  // Dynamic Solar Times
  sunrise: cosmicData.sunrise,
  sunset: cosmicData.sunset,
  solarNoon: cosmicData.noonMinutes, // Internal use
  
  // Dynamic Muhurats
  rahuKaalStart: cosmicData.rahuStart,
  rahuKaalEnd: cosmicData.rahuEnd,
  abhijitStart: cosmicData.abhijitStart,
  abhijitEnd: cosmicData.abhijitEnd
};

export const COSMIC_EVENTS = [
    { date: '2026-02-04', title: 'Mercury enters Capricorn', type: 'Transit', impact: 'Medium', category: 'Business' },
    { date: '2026-02-12', title: 'Magha Purnima', type: 'Festival', impact: 'High', category: 'Spiritual' },
    { date: '2026-02-14', title: 'Sun enters Aquarius', type: 'Transit', impact: 'High', category: 'General' },
    { date: '2026-02-20', title: 'Shukra Pradosh Vrat', type: 'Fasting', impact: 'Medium', category: 'Health' },
    { date: '2026-03-08', title: 'Maha Shivratri', type: 'Festival', impact: 'High', category: 'Spiritual' },
];

export const BLOG_POSTS = [
    { 
        id: 1, 
        title: "Daily Cosmic Insight: The Moon in Rohini", 
        excerpt: "Today the Moon graces Rohini Nakshatra, promoting creativity, growth, and sensuality. It is an excellent day for planting seeds—both literal and metaphorical.",
        content: "As the Moon transits through the earthy sign of Taurus and settles into the Rohini Nakshatra, we experience a surge of creative energy. Rohini, ruled by the Creator Brahma, is associated with growth, fertility, and abundance. \n\nToday is auspicious for: \n1. Starting new creative projects. \n2. Agriculture and gardening. \n3. Purchasing vehicles or luxury items. \n\nHowever, beware of over-indulgence in food or emotions. Keep a balanced mind.",
        author: "Acharya Dev",
        date: "Today"
    },
    { 
        id: 2, 
        title: "Upcoming Transit: Jupiter Retrograde Effects", 
        excerpt: "Jupiter begins its retrograde motion soon. Understand how this affects your wisdom, education, and financial planning.",
        content: "When the Guru (Jupiter) goes retrograde, it is a time for introspection regarding our dharma and wisdom. It is not the best time to start a new course of study, but an excellent time to revise old lessons. Financially, avoid large speculative investments.",
        author: "Dr. Sharma",
        date: "Yesterday"
    }
];
