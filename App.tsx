
import React, { useState, useEffect, useRef } from 'react';
import { jsPDF } from 'jspdf';
import { AppSection, UserProfile, Rashi, BlogPost } from './types';
import { RASHIS, BLOG_POSTS } from './constants';
import { getDailyHoroscope, getRemedyAdvice, generateHoroscopeVideo, checkGlobalVideoUrl, StructuredHoroscope, getYearlyForecast, YearlyForecast, injectBatchData, verifyConnection, fetchGlobalBlogPosts, GLOBAL_STORAGE_BASE_URL } from './services/geminiService';
import AIPanditji from './components/AIPanditji';
import TimeChart from './components/TimeChart';
import LandingPage from './components/LandingPage';

// --- TYPES ---
type UserTier = 'guest' | 'premium' | 'admin';
type GenerationMode = 'text' | 'video';

// --- Utility: Local Storage Caching ---
// BUMPED TO V6 TO FORCE REFRESH OF PARSED DATA
const CACHE_PREFIX = 'celestial_cache_v6_'; 

const getCache = (key: string) => {
    const item = localStorage.getItem(CACHE_PREFIX + key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    return parsed.data;
};

const setCache = (key: string, data: any) => {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        timestamp: Date.now(),
        data: data
    }));
};

const COLOR_MAP: Record<string, string[]> = {
    '#ef4444': ['red', 'maroon', 'crimson', 'lal', 'laal', 'sinduri', 'surkh', 'gerua', 'लाल', 'मेहरून'],
    '#10b981': ['green', 'emerald', 'olive', 'lime', 'hara', 'hari', 'dhani', 'totai', 'हरा', 'हरी', 'light green', 'dark green'],
    '#3b82f6': ['blue', 'azure', 'navy', 'teal', 'cyan', 'indigo', 'neela', 'neeli', 'firozi', 'asmani', 'aakaashi', 'firoza', 'नीला', 'नीली', 'आसमानी', 'फिरोजा', 'sky blue'],
    '#fbbf24': ['yellow', 'lemon', 'amber', 'gold', 'golden', 'peela', 'peeli', 'basanti', 'sunehra', 'haldi', 'suna', 'swarn', 'kesar', 'kesari', 'पीला', 'पीली', 'सुनहरा', 'स्वर्ण', 'haldi'],
    '#f97316': ['orange', 'tangerine', 'saffron', 'narangi', 'santri', 'bhagwa', 'kesariya', 'नारंगी', 'संतरी', 'केसरिया', 'भगवा'],
    '#a855f7': ['purple', 'violet', 'lavender', 'magenta', 'baingani', 'jamuni', 'बैंगनी', 'जामुनी'],
    '#ec4899': ['pink', 'rose', 'coral', 'gulabi', 'rani', 'magenta', 'गुलाबी', 'रानी'],
    '#f5f5f4': ['white', 'cream', 'silver', 'safed', 'safaid', 'shwet', 'chandi', 'off white', 'सफेद', 'श्वेत', 'चांदी', 'ऑफ व्हाइट'],
    '#171717': ['black', 'dark', 'charcoal', 'kala', 'kaala', 'syah', 'काला'],
    '#9ca3af': ['grey', 'gray', 'slate', 'sleti', 'ash', 'स्लेटी', 'धूसर'],
    '#92400e': ['brown', 'beige', 'khaki', 'bhura', 'katthai', 'bura', 'chocolate', 'भूरा', 'कत्थई']
};

const getLuckyColorHex = (colorName: string): string => {
    if (!colorName) return '#d97706';
    const lower = colorName.toLowerCase().trim();
    
    // 1. Direct Match in Map
    let bestColor = '#d97706';
    let minIndex = Infinity;

    for (const [hex, keywords] of Object.entries(COLOR_MAP)) {
        for (const kw of keywords) {
            // Check exact word boundary if possible, or simple includes
            const idx = lower.indexOf(kw);
            if (idx !== -1) {
                // Prioritize matches that appear earlier in the string (e.g. "Red and Blue" -> Red)
                if (idx < minIndex) {
                    minIndex = idx;
                    bestColor = hex;
                }
            }
        }
    }
    
    // If found, return.
    if (minIndex !== Infinity) return bestColor;

    return '#d97706';
};

const base64ToUint8Array = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const createWavHeader = (dataLength: number, sampleRate: number) => {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const writeString = (v: DataView, o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  return buffer;
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, currentY);
            line = words[n] + ' ';
            currentY += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, currentY);
    return currentY + lineHeight;
};

const composeFinalVideo = async (videoBlobUrl: string, audioBlobUrl: string, data: StructuredHoroscope, rashi: string, date: string, onProgress: (status: string) => void): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        let video: HTMLVideoElement | null = null;
        let audio: HTMLAudioElement | null = null;
        let audioCtx: AudioContext | null = null;
        try {
            onProgress("Studio: Loading Assets...");
            await document.fonts.ready;
            const canvas = document.createElement('canvas');
            canvas.width = 720; canvas.height = 1280;
            const ctx = canvas.getContext('2d', { alpha: false });
            if (!ctx) throw new Error("Could not create canvas context");

            video = document.createElement('video');
            video.src = videoBlobUrl;
            video.crossOrigin = "anonymous";
            video.loop = true; video.muted = true; video.playsInline = true;
            video.style.opacity = '0'; video.style.position = 'fixed'; video.style.pointerEvents = 'none';
            document.body.appendChild(video);
            await video.play();

            audio = new Audio(audioBlobUrl);
            audio.crossOrigin = "anonymous";
            
            const stream = canvas.captureStream(30);
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioCtx.createMediaElementSource(audio);
            const dest = audioCtx.createMediaStreamDestination();
            source.connect(dest);
            if (dest.stream.getAudioTracks().length > 0) stream.addTrack(dest.stream.getAudioTracks()[0]);

            let mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/mp4';

            const mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1500000 });
            const chunks: Blob[] = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: mimeType });
                const url = URL.createObjectURL(blob);
                if (video) { video.pause(); video.remove(); }
                if (audio) audio.pause();
                if (audioCtx) audioCtx.close();
                resolve(url);
            };

            mediaRecorder.start();
            audio.play();
            onProgress("Studio: Recording Final Mix...");

            const drawFrame = () => {
                if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
                if (video) {
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.strokeStyle = '#d97706'; ctx.lineWidth = 10;
                    ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
                    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
                    ctx.font = 'bold 80px Cinzel'; ctx.fillStyle = '#fbbf24'; 
                    ctx.shadowColor = "black"; ctx.shadowBlur = 10;
                    ctx.fillText(rashi.toUpperCase(), canvas.width / 2, 160);
                    ctx.shadowBlur = 0;
                    ctx.font = '30px Inter'; ctx.fillStyle = '#d6d3d1'; 
                    ctx.fillText(date, canvas.width / 2, 220);
                    ctx.font = 'italic 36px serif'; ctx.fillStyle = '#fbbf24'; 
                    wrapText(ctx, `"${data.mood}"`, canvas.width / 2, canvas.height / 2 - 120, 600, 50);
                    let startY = canvas.height / 2 + 60;
                    ctx.font = 'bold 30px Inter'; ctx.fillStyle = '#4ade80'; 
                    ctx.fillText("LUCKY COLOR", canvas.width / 2, startY);
                    startY += 40;
                    ctx.font = '30px Inter'; ctx.fillStyle = '#ffffff';
                    ctx.fillText(data.luckyColor, canvas.width / 2, startY);
                    startY += 90;
                    ctx.font = 'bold 30px Inter'; ctx.fillStyle = '#f87171'; 
                    ctx.fillText("DIVINE REMEDY", canvas.width / 2, startY);
                    startY += 40;
                    ctx.font = '26px Inter'; ctx.fillStyle = '#ffffff';
                    wrapText(ctx, data.remedies, canvas.width / 2, startY, 580, 40);
                }
                requestAnimationFrame(drawFrame);
            };
            drawFrame();
            audio.onended = () => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); };
            setTimeout(() => { if (mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 120000);
        } catch (e) {
             if (video) video.remove(); if (audio) audio.pause(); if (audioCtx) audioCtx.close();
            reject(e);
        }
    });
};

const getCelestialData = (dateStr: string) => {
    const d = new Date(dateStr);
    const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
    const tithis = ["Shukla Pratipada", "Shukla Dwitiya", "Shukla Tritiya", "Shukla Chaturthi", "Shukla Panchami", "Shukla Shashthi", "Shukla Saptami", "Shukla Ashtami", "Shukla Navami", "Shukla Dashami", "Shukla Ekadashi", "Shukla Dwadashi", "Shukla Trayodashi", "Shukla Chaturdashi", "Purnima", "Krishna Pratipada", "Krishna Dwitiya", "Krishna Tritiya", "Krishna Chaturthi", "Krishna Panchami", "Krishna Shashthi", "Krishna Saptami", "Krishna Ashtami", "Krishna Navami", "Krishna Dashami", "Krishna Ekadashi", "Krishna Dwadashi", "Krishna Trayodashi", "Krishna Chaturdashi", "Amavasya"];
    const nakshatras = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];
    const yogas = ["Vishkumbha", "Preeti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shoola", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshan", "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"];
    const karanas = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti", "Shakuni", "Chatushpada", "Naga", "Kimstughna"];
    return {
        tithi: tithis[dayOfYear % tithis.length],
        nakshatra: nakshatras[dayOfYear % nakshatras.length],
        yoga: yogas[dayOfYear % yogas.length],
        karana: karanas[dayOfYear % karanas.length],
        moonRashi: RASHIS[dayOfYear % RASHIS.length].name
    };
};

const POPULAR_CITIES = [
  "New Delhi, India", "Mumbai, India", "Bangalore, India", "Chennai, India", "Kolkata, India",
  "New York, USA", "London, UK", "Dubai, UAE", "Singapore", "Sydney, Australia",
  "Toronto, Canada", "Los Angeles, USA", "Chicago, USA", "Houston, USA",
  "Pune, India", "Hyderabad, India", "Ahmedabad, India", "Jaipur, India", "Lucknow, India",
  "Tokyo, Japan", "Paris, France", "Berlin, Germany", "Moscow, Russia",
  "Beijing, China", "Bangkok, Thailand", "Istanbul, Turkey", "Rome, Italy", "Kathmandu, Nepal"
];

const App: React.FC = () => {
  // STATE: Controls whether to show Landing Page or Main App
  const [showLanding, setShowLanding] = useState(true);

  const [activeSection, setActiveSection] = useState<AppSection>(AppSection.DASHBOARD);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userTier, setUserTier] = useState<UserTier>('guest');
  const [showLogin, setShowLogin] = useState(false);
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');

  const [selectedRashi, setSelectedRashi] = useState<Rashi>('Aries');
  const [horoscopeData, setHoroscopeData] = useState<StructuredHoroscope | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCached, setIsCached] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string>('');
  
  const TODAY = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(TODAY);
  const [celestialData, setCelestialData] = useState<any>(null);

  // ADMIN STATE
  const [downloadDate, setDownloadDate] = useState(TODAY);
  const [bulkLang, setBulkLang] = useState<'en' | 'hi'>('en');
  const [bulkMode, setBulkMode] = useState<GenerationMode>('text'); 
  const [bulkProgress, setBulkProgress] = useState<{current: number, total: number, status: string} | null>(null);
  const [adminLog, setAdminLog] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [remedyIssue, setRemedyIssue] = useState('');
  const [remedyResult, setRemedyResult] = useState('');
  const [remedyLoading, setRemedyLoading] = useState(false);
  
  const [boyDOB, setBoyDOB] = useState(''); const [boyTime, setBoyTime] = useState('12:00');
  const [girlDOB, setGirlDOB] = useState(''); const [girlTime, setGirlTime] = useState('12:00');
  const [matchResult, setMatchResult] = useState<any>(null);
  
  // CHART STATE
  const [chartName, setChartName] = useState(''); 
  const [chartDOB, setChartDOB] = useState(TODAY);
  const [chartTime, setChartTime] = useState('12:00'); 
  const [chartLocation, setChartLocation] = useState('');
  const [chartData, setChartData] = useState<any>(null);
  const [premiumForecast, setPremiumForecast] = useState<YearlyForecast | null>(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  
  // CITY SUGGESTIONS
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [filteredCities, setFilteredCities] = useState<string[]>([]);

  const [blogPosts, setBlogPosts] = useState<BlogPost[]>(BLOG_POSTS);
  const [selectedBlogPost, setSelectedBlogPost] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const isAdmin = userTier === 'admin';
  const isPremium = userTier === 'premium' || userTier === 'admin';

  useEffect(() => { const timer = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(timer); }, []);

  useEffect(() => {
    const loadDynamicBlogs = async () => {
        const cloudPosts = await fetchGlobalBlogPosts();
        if (cloudPosts && cloudPosts.length > 0) setBlogPosts(cloudPosts);
    };
    loadDynamicBlogs();
  }, []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  useEffect(() => { setCelestialData(getCelestialData(selectedDate)); }, [selectedDate]);

  const handleNavClick = (section: AppSection) => {
      setActiveSection(section);
  };
  
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newDate = e.target.value;
      setSelectedDate(newDate);
      if (activeSection === AppSection.HOROSCOPE) {
          fetchHoroscope(selectedRashi, language, newDate);
      }
  };

  const handleLanguageChange = (newLang: 'en' | 'hi') => { setLanguage(newLang); fetchHoroscope(selectedRashi, newLang); };
  const handleLoginSubmit = () => {
      setLoginError('');
      if (loginPin === '108') { setUserTier('admin'); setShowLogin(false); setLoginPin(''); }
      else if (loginPin === '888') { setUserTier('premium'); setShowLogin(false); setLoginPin(''); }
      else { setLoginError('Invalid Cosmic Code'); }
  };

  const fetchHoroscope = async (rashi: Rashi, langOverride?: 'en' | 'hi', dateOverride?: string) => {
    const dateToUse = dateOverride || selectedDate; 
    const langToUse = langOverride || language;
    const cacheKey = `horo_${rashi}_${langToUse}_${dateToUse}`;
    const cachedData = getCache(cacheKey);
    if (cachedData) { setHoroscopeData(cachedData); setIsCached(true); return; }
    
    setLoading(true); setIsCached(false);
    const result = await getDailyHoroscope(rashi, langToUse, dateToUse, true);
    if (typeof result !== 'string') { setHoroscopeData(result); setCache(cacheKey, result); }
    setLoading(false);
  };

  const processFullVideoCreation = async (rashi: string, date: string, lang: 'en' | 'hi', updateStatus: (msg: string) => void) => {
    // Note: Audio generation logic removed for Horoscope tab, but retained here if video feature needs it internally
    // For now, we will throw error as this function is not exposed in UI anymore
    throw new Error("Feature disabled");
  };

  const handleVideoDownload = async () => {
      // Feature disabled in UI
  };
  
  const addToLog = (message: string) => setAdminLog(prev => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  const handleForceKeyReset = async () => { try { if ((window as any).aistudio?.openSelectKey) await (window as any).aistudio.openSelectKey(); } catch (e) {} };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      let effectiveDate = downloadDate;
      const dateMatch = file.name.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) { effectiveDate = dateMatch[1]; setDownloadDate(effectiveDate); }
      let effectiveLang = bulkLang;
      if (file.name.toLowerCase().includes('_hi')) effectiveLang = 'hi';
      else if (file.name.toLowerCase().includes('_en')) effectiveLang = 'en';
      setBulkLang(effectiveLang);

      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (text) { 
              const keys = injectBatchData(effectiveDate, effectiveLang, text);
              if (keys.length > 0) {
                  addToLog(`File Uploaded: Found ${keys.length} Rashis.`);
                  alert(`Success! Found ${keys.length} Rashis for ${effectiveDate} (${effectiveLang}).\nClick "Generate & Download" to create the files immediately.`);
              } else {
                  alert("Error: No Rashis found. Please check file format (must contain '### RashiName').");
              }
          }
      };
      reader.readAsText(file);
  };

  const handleTestRepoConnection = async () => { const logs = await verifyConnection(downloadDate); logs.forEach(l => addToLog(l)); };
  
  const handleBulkDownload = async (mode: 'json' | 'txt') => {
      addToLog(`Starting Batch Process (${mode.toUpperCase()}) for ${downloadDate}...`);
      const txtLines: string[] = [];
      setBulkProgress({ current: 0, total: 12, status: 'Checking Cache...' });
  
      for (let i = 0; i < RASHIS.length; i++) {
          const r = RASHIS[i];
          setBulkProgress({ current: i + 1, total: 12, status: `Processing ${r.name}...` });
          let data: StructuredHoroscope | string = "Data unavailable";
          let source = 'unknown';

          try {
             data = await getDailyHoroscope(r.name, bulkLang, downloadDate, false, false);
             if (typeof data !== 'string') { source = 'local'; }
          } catch(e) {}

          if (typeof data === 'string' && process.env.API_KEY) {
              try {
                  addToLog(`Cache miss for ${r.name}. Fetching from API...`);
                  let attempts = 0;
                  while (typeof data === 'string' && attempts < 3) {
                      attempts++;
                      try {
                          data = await getDailyHoroscope(r.name, bulkLang, downloadDate, true, true);
                      } catch(e) { await new Promise(r => setTimeout(r, 4000)); }
                  }
                  source = 'api';
              } catch(e) {}
          }

          if (typeof data !== 'string') {
                 const orderedData = {
                     mood: data.mood,
                     generalAdvice: data.generalAdvice,
                     positives: data.positives,
                     concerns: data.cautions, 
                     luckyColor: data.luckyColor,
                     remedies: data.remedies,
                     detailedPrediction: data.detailedPrediction,
                     meta: { ...data.meta, generatedSource: source }
                 };

                 if (mode === 'json') {
                    const blob = new Blob([JSON.stringify(orderedData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); 
                    a.style.display = 'none'; a.href = url; 
                    a.download = `${downloadDate}_${r.name}_${bulkLang}.json`; 
                    document.body.appendChild(a); a.click();
                    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
                    addToLog(`Downloaded ${r.name} (${source})`);
                 } else {
                     txtLines.push(`### ${r.name}`);
                     txtLines.push(`Mood: ${data.mood}`);
                     txtLines.push(`General Advice: ${data.generalAdvice}`);
                     txtLines.push(`Positives: ${data.positives.join(', ')}`);
                     txtLines.push(`Concerns: ${data.cautions.join(', ')}`);
                     txtLines.push(`Lucky Color: ${data.luckyColor}`);
                     txtLines.push(`Remedies: ${data.remedies}`);
                     txtLines.push(`Detailed Prediction: ${data.detailedPrediction}`);
                     txtLines.push('\n');
                 }
          } else { addToLog(`Failed to generate/find data for ${r.name}`); }
          const delay = source === 'local' ? 400 : 3000;
          await new Promise(r => setTimeout(r, delay)); 
      }
      setBulkProgress(null);
      if (mode === 'json') { addToLog("Batch Complete. Check your downloads folder."); } 
      else {
          addToLog("Batch Complete. Downloading TXT...");
          const blob = new Blob([txtLines.join('\n')], { type: 'text/plain' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); 
          a.download = `${downloadDate}_${bulkLang}.txt`; 
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
      }
  };

  const fetchRemedy = async (issue: string) => { setRemedyLoading(true); setRemedyResult(await getRemedyAdvice(issue)); setRemedyLoading(false); };
  
  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setChartLocation(val);
    if (val.length > 0) {
        const filtered = POPULAR_CITIES.filter(c => c.toLowerCase().includes(val.toLowerCase()));
        setFilteredCities(filtered);
        setShowCitySuggestions(true);
    } else { setShowCitySuggestions(false); }
  };

  const selectCity = (city: string) => { setChartLocation(city); setShowCitySuggestions(false); };

  const handleGPS = () => {
    if (navigator.geolocation) {
        setChartLocation("Locating...");
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
                    const data = await res.json();
                    if (data && data.address) {
                        const city = data.address.city || data.address.town || data.address.village || data.address.municipality;
                        const state = data.address.state;
                        const country = data.address.country;
                        const parts = [city, state, country].filter(Boolean);
                        setChartLocation(parts.join(", "));
                    } else { setChartLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`); }
                } catch (e) { setChartLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`); }
            },
            (error) => { console.error(error); setChartLocation(""); alert("Unable to retrieve location. Please enter manually."); }
        );
    } else { alert("Geolocation is not supported by this browser."); }
  };

  const handleGenerateChart = async () => {
    if (!chartName || !chartLocation) { alert("Please enter Name and Place of Birth"); return; }
    setPremiumLoading(true); setPremiumForecast(null);
    try {
        const result = await getYearlyForecast(chartName, chartDOB, chartTime, chartLocation);
        if (typeof result === 'string') { alert("Error generating chart: " + result); } 
        else { setPremiumForecast(result); }
    } catch (e) { console.error(e); alert("An unexpected error occurred."); } 
    finally { setPremiumLoading(false); }
  };

  // Define Nav Items dynamically for reuse
  const navItems = [
    { id: AppSection.DASHBOARD, icon: 'fa-home', label: 'Dashboard', visible: true },
    { id: AppSection.HOROSCOPE, icon: 'fa-star', label: 'Horoscope', visible: true },
    { id: AppSection.BIRTH_CHART, icon: 'fa-chart-pie', label: 'Birth Chart', visible: true },
    { id: AppSection.BLOG, icon: 'fa-book-open', label: 'Wisdom', visible: true },
    { id: AppSection.PANDITJI, icon: 'fa-user-astronaut', label: 'Panditji', visible: isPremium },
    { id: AppSection.KUNDALI_MILAN, icon: 'fa-heart', label: 'Matching', visible: isPremium },
    { id: AppSection.REMEDIES, icon: 'fa-hand-sparkles', label: 'Remedies', visible: isPremium },
    { id: AppSection.DOWNLOADS, icon: 'fa-lock', label: 'Admin', visible: isAdmin },
  ].filter(i => i.visible);

  // --- RENDER LANDING PAGE IF ACTIVE ---
  if (showLanding) {
      return <LandingPage onEnter={() => setShowLanding(false)} />;
  }

  // --- MAIN APP RENDER ---
  return (
    <div className="min-h-screen vedic-gradient flex flex-col md:flex-row relative">
      {showProfileModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-[#1a120b] border border-[#d97706] p-8 rounded-3xl max-w-lg w-full relative shadow-2xl">
                  <button onClick={() => setShowProfileModal(false)} className="absolute top-4 right-4 text-white"><i className="fas fa-times text-xl"></i></button>
                  <div className="text-center mb-6">
                      <h3 className="text-2xl font-cinzel text-white">Seeker Profile</h3>
                      <p className="text-xs uppercase tracking-widest text-stone-400 mt-1">Tier: {userTier.toUpperCase()}</p>
                  </div>
                  <div className="bg-stone-900/50 p-4 rounded-xl border border-white/5">
                      <button onClick={() => setShowLogin(!showLogin)} className="text-xs bg-stone-700 hover:bg-stone-600 px-3 py-1 rounded transition-colors text-white w-full">
                          {userTier === 'guest' ? 'ENTER ACCESS CODE' : 'LOGOUT'}
                      </button>
                      {showLogin && (
                          <div className="mt-4">
                              <input type="password" value={loginPin} onChange={(e) => setLoginPin(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded px-3 py-1 text-white text-sm mb-2" placeholder="PIN" />
                              <button onClick={handleLoginSubmit} className="bg-[#d97706] text-white px-4 py-1 rounded text-xs font-bold w-full">UNLOCK</button>
                          </div>
                      )}
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/10 text-center">
                     <button onClick={handleForceKeyReset} className="text-[10px] text-stone-500 underline hover:text-amber-500">Reset API Key</button>
                  </div>
              </div>
          </div>
      )}

      {/* MOBILE HEADER - Clickable Title */}
      <div className="md:hidden flex justify-between items-center p-4 bg-[var(--bg-secondary)] border-b border-white/5 sticky top-0 z-40">
        <button onClick={() => handleNavClick(AppSection.DASHBOARD)}>
            <h1 className="text-xl font-cinzel font-bold text-[#d97706]">CelestialAI</h1>
        </button>
        <button onClick={() => setShowProfileModal(true)} className="text-[#d97706]"><i className="fas fa-user-circle text-2xl"></i></button>
      </div>

      <nav className="hidden md:flex flex-col w-20 lg:w-64 bg-[var(--bg-secondary)] border-r border-[#d97706]/20 h-screen sticky top-0 z-50">
        <div className="p-6 flex flex-col items-center lg:items-start border-b border-[#d97706]/20">
          <i className="fas fa-sun text-4xl text-[#d97706] mb-3"></i>
          <h1 className="hidden lg:block text-2xl font-cinzel font-bold text-[#d97706]">CelestialAI</h1>
        </div>
        <div className="flex-1 overflow-y-auto py-6 space-y-2 px-3">
          {navItems.map(item => (
            <button key={item.id} onClick={() => handleNavClick(item.id)} className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${activeSection === item.id ? 'bg-[#d97706]/20 text-[#d97706]' : 'text-[var(--text-muted)] hover:bg-white/5'}`}>
              <i className={`fas ${item.icon} text-lg w-6 text-center`}></i>
              <span className="hidden lg:block font-medium">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-[#d97706]/20">
            <button onClick={() => setShowProfileModal(true)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] hover:bg-[#d97706]/10">
                <i className="fas fa-user text-[#d97706]"></i>
                <div className="hidden lg:block text-left"><p className="text-xs font-bold text-[var(--text-main)]">Profile</p></div>
            </button>
        </div>
      </nav>

      {/* Main Content Area - Added padding bottom for mobile nav */}
      <main className="flex-1 p-4 md:p-8 lg:p-12 h-screen overflow-y-auto scroll-smooth relative pb-24 md:pb-8">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
            <div>
                <h2 className="text-3xl font-cinzel font-bold text-[var(--text-main)]">
                    {activeSection === AppSection.BLOG ? "Cosmic Wisdom" : activeSection.replace('_', ' ')}
                </h2>
                <p className="text-sm text-[var(--text-muted)] mt-1">{currentTime.toLocaleDateString()}</p>
            </div>
            {(activeSection === AppSection.HOROSCOPE || activeSection === AppSection.DASHBOARD) && (
                 <div className="flex gap-4 items-center">
                     <div className="bg-[var(--card-bg)] rounded-xl border border-[var(--glass-border)] px-3 py-1">
                        <input 
                            type="date" 
                            value={selectedDate} 
                            onChange={handleDateChange}
                            className="bg-transparent text-white text-xs font-bold outline-none border-none uppercase tracking-wider"
                        />
                     </div>
                     <div className="flex bg-[var(--card-bg)] rounded-xl p-1 border border-[var(--glass-border)]">
                         <button onClick={() => handleLanguageChange('en')} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${language === 'en' ? 'bg-[#d97706] text-white' : 'text-stone-400'}`}>ENG</button>
                         <button onClick={() => handleLanguageChange('hi')} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${language === 'hi' ? 'bg-[#d97706] text-white' : 'text-stone-400'}`}>HIN</button>
                     </div>
                 </div>
            )}
        </header>

        {activeSection === AppSection.DASHBOARD && (
            <div className="space-y-8 animate-fade-in">
                <TimeChart date={selectedDate} extraData={celestialData} lang={language} />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div onClick={() => handleNavClick(AppSection.HOROSCOPE)} className="glass-gold p-6 rounded-2xl cursor-pointer hover:bg-[#d97706]/10">
                        <i className="fas fa-star text-2xl text-purple-400 mb-2"></i>
                        <h3 className="font-bold text-white">Daily Horoscope</h3>
                    </div>
                    {isPremium && (
                        <>
                            <div onClick={() => handleNavClick(AppSection.PANDITJI)} className="glass-gold p-6 rounded-2xl cursor-pointer hover:bg-[#d97706]/10">
                                <i className="fas fa-user-astronaut text-2xl text-orange-400 mb-2"></i>
                                <h3 className="font-bold text-white">Panditji</h3>
                            </div>
                            <div onClick={() => handleNavClick(AppSection.KUNDALI_MILAN)} className="glass-gold p-6 rounded-2xl cursor-pointer hover:bg-[#d97706]/10">
                                <i className="fas fa-heart text-2xl text-pink-400 mb-2"></i>
                                <h3 className="font-bold text-white">Match Making</h3>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}

        {activeSection === AppSection.HOROSCOPE && (
            <div className="max-w-6xl mx-auto pb-20">
                <div className="flex flex-wrap justify-center gap-4 mb-10">
                    {RASHIS.map(r => (
                        <button key={r.name} onClick={() => { setSelectedRashi(r.name); fetchHoroscope(r.name); }} className={`flex flex-col items-center p-3 rounded-xl w-24 border ${selectedRashi === r.name ? 'bg-[#d97706] border-[#d97706] text-white' : 'bg-[var(--card-bg)] border-white/5 text-stone-400'}`}>
                            <span className="text-2xl mb-1">{r.icon}</span><span className="text-[10px] font-bold uppercase">{r.name}</span>
                        </button>
                    ))}
                </div>
                {loading ? <div className="text-center text-[#d97706] animate-pulse">Aligning stars...</div> : horoscopeData ? (
                    <div className="space-y-6 animate-fade-in-up">
                        
                        {/* 1. Main Card */}
                        <div className="glass p-8 rounded-3xl border border-[#d97706]/30 relative overflow-hidden">
                            <div className="absolute top-0 right-6 text-[10rem] font-serif text-white opacity-5 pointer-events-none leading-none">”</div>
                            
                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <div>
                                     <h2 className="text-4xl font-cinzel text-white uppercase tracking-wider mb-2">{selectedRashi}</h2>
                                </div>
                            </div>

                            <div className="relative z-10">
                                {/* Mood / Intro Text */}
                                <p className="text-[#d97706] text-lg italic mb-6 font-serif leading-relaxed">
                                    {horoscopeData.mood}
                                </p>

                                {/* Detailed Prediction & Advice */}
                                <div className="text-[var(--text-main)] text-lg leading-relaxed font-serif space-y-4 text-justify">
                                    <p>{horoscopeData.detailedPrediction}</p>
                                    <p>{horoscopeData.generalAdvice}</p>
                                </div>
                            </div>
                        </div>

                        {/* 2. Positives & Cautions Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Positives */}
                            <div className="glass bg-emerald-900/5 p-6 rounded-2xl border border-emerald-500/50">
                                <h4 className="text-emerald-400 font-bold text-xl mb-4 flex items-center gap-3">
                                    <i className="fas fa-check-circle"></i> Positives
                                </h4>
                                <ul className="space-y-3">
                                    {horoscopeData.positives && horoscopeData.positives.map((p, i) => (
                                        <li key={i} className="text-stone-300 text-sm md:text-base flex items-start gap-3">
                                            <span className="text-emerald-500 mt-1.5 text-[8px]"><i className="fas fa-circle"></i></span> 
                                            <span className="leading-relaxed">{p}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Cautions */}
                            <div className="glass bg-red-900/5 p-6 rounded-2xl border border-red-500/50">
                                <h4 className="text-red-400 font-bold text-xl mb-4 flex items-center gap-3">
                                    <i className="fas fa-exclamation-triangle"></i> Cautions
                                </h4>
                                <ul className="space-y-3">
                                    {horoscopeData.cautions && horoscopeData.cautions.map((c, i) => (
                                        <li key={i} className="text-stone-300 text-sm md:text-base flex items-start gap-3">
                                            <span className="text-red-500 mt-1.5 text-[8px]"><i className="fas fa-circle"></i></span>
                                            <span className="leading-relaxed">{c}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>

                        {/* 3. Lucky Color & Remedy Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="glass p-6 rounded-2xl border border-[var(--glass-border)] flex flex-col justify-center items-center text-center relative overflow-hidden group">
                                <div className="absolute inset-0 bg-gradient-to-br from-[var(--lucky-color-hex)] to-transparent opacity-20 group-hover:opacity-30 transition-all"></div>
                                <h4 className="text-[var(--text-muted)] uppercase tracking-widest text-xs font-bold mb-2">Lucky Color</h4>
                                <div className="w-16 h-16 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] mb-3 border-4 border-white/10" style={{ backgroundColor: getLuckyColorHex(horoscopeData.luckyColor) }}></div>
                                <p className="text-2xl font-cinzel text-white capitalize">{horoscopeData.luckyColor}</p>
                            </div>

                            <div className="glass p-6 rounded-2xl border border-[var(--glass-border)] flex flex-col justify-center">
                                <h4 className="text-amber-500 font-bold text-lg mb-2 flex items-center gap-2">
                                    <i className="fas fa-hand-holding-heart"></i> Divine Remedy
                                </h4>
                                <p className="text-[var(--text-main)] italic text-sm leading-relaxed">
                                    "{horoscopeData.remedies}"
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-stone-500 mt-20">Select a Rashi to reveal the cosmic path.</div>
                )}
            </div>
        )}

        {/* BIRTH CHART */}
        {activeSection === AppSection.BIRTH_CHART && (
             <div className="max-w-4xl mx-auto glass p-8 rounded-3xl border border-[#d97706]/30">
                 <h3 className="text-2xl font-cinzel text-[#d97706] mb-6 text-center">Yearly Vedic Forecast</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                     <input type="text" placeholder="Full Name" value={chartName} onChange={e => setChartName(e.target.value)} className="bg-black/40 border border-[#d97706]/30 rounded-lg p-3 text-white focus:border-[#d97706] outline-none" />
                     <div className="relative">
                        <input type="text" placeholder="Place of Birth" value={chartLocation} onChange={handleLocationChange} className="w-full bg-black/40 border border-[#d97706]/30 rounded-lg p-3 text-white focus:border-[#d97706] outline-none" />
                        <button onClick={handleGPS} className="absolute right-3 top-3 text-[#d97706]"><i className="fas fa-crosshairs"></i></button>
                        {showCitySuggestions && (
                            <ul className="absolute z-50 w-full bg-[#1c1917] border border-[#d97706] rounded-lg mt-1 max-h-40 overflow-y-auto">
                                {filteredCities.map((c, i) => (
                                    <li key={i} onClick={() => selectCity(c)} className="p-2 hover:bg-[#d97706]/20 text-stone-300 cursor-pointer text-sm">{c}</li>
                                ))}
                            </ul>
                        )}
                     </div>
                     <input type="date" value={chartDOB} onChange={e => setChartDOB(e.target.value)} className="bg-black/40 border border-[#d97706]/30 rounded-lg p-3 text-white" />
                     <input type="time" value={chartTime} onChange={e => setChartTime(e.target.value)} className="bg-black/40 border border-[#d97706]/30 rounded-lg p-3 text-white" />
                 </div>
                 <button onClick={handleGenerateChart} disabled={premiumLoading} className="w-full bg-[#d97706] text-white font-bold py-3 rounded-lg hover:bg-[#b45309] transition-all flex justify-center items-center gap-2">
                     {premiumLoading ? <i className="fas fa-circle-notch animate-spin"></i> : <i className="fas fa-scroll"></i>} Generate Forecast
                 </button>
                 
                 {premiumForecast && typeof premiumForecast !== 'string' && (
                     <div className="mt-8 animate-fade-in space-y-6">
                         <div className="glass bg-black/20 p-6 rounded-xl">
                             <h4 className="text-amber-400 font-bold mb-4 border-b border-white/10 pb-2">Planetary Summary</h4>
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                 {premiumForecast.planetarySummary.map((p, i) => (
                                     <div key={i} className="text-center p-2 bg-white/5 rounded-lg">
                                         <div className="text-[#d97706] text-xs font-bold uppercase">{p.planet}</div>
                                         <div className="text-white text-sm">{p.rashi}</div>
                                         <div className="text-stone-500 text-[10px]">{p.degree}</div>
                                     </div>
                                 ))}
                             </div>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div className="glass bg-white/5 p-4 rounded-xl">
                                 <h5 className="text-emerald-400 font-bold mb-2">Career & Wealth</h5>
                                 <p className="text-sm text-stone-300">{premiumForecast.predictions.career}</p>
                                 <p className="text-sm text-stone-300 mt-2">{premiumForecast.predictions.wealth}</p>
                             </div>
                             <div className="glass bg-white/5 p-4 rounded-xl">
                                 <h5 className="text-pink-400 font-bold mb-2">Love & Health</h5>
                                 <p className="text-sm text-stone-300">{premiumForecast.predictions.love}</p>
                                 <p className="text-sm text-stone-300 mt-2">{premiumForecast.predictions.health}</p>
                             </div>
                         </div>
                         <div className="glass bg-amber-900/10 p-4 rounded-xl border border-amber-500/20">
                             <h5 className="text-amber-500 font-bold mb-2">Remedies</h5>
                             <ul className="list-disc list-inside text-sm text-stone-300">
                                 {premiumForecast.remedies.map((r, i) => <li key={i}>{r}</li>)}
                             </ul>
                         </div>
                     </div>
                 )}
             </div>
        )}

        {/* BLOG SECTION */}
        {activeSection === AppSection.BLOG && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                {blogPosts.map((post) => (
                    <div key={post.id} onClick={() => setSelectedBlogPost(post)} className="glass p-6 rounded-2xl cursor-pointer hover:bg-white/5 border border-white/5">
                        <span className="text-[#d97706] text-xs font-bold uppercase tracking-wider">{post.date}</span>
                        <h3 className="text-xl font-cinzel text-white mt-2 mb-3">{post.title}</h3>
                        <p className="text-stone-400 text-sm line-clamp-3">{post.excerpt}</p>
                        <div className="mt-4 flex items-center gap-2 text-stone-500 text-xs">
                            <i className="fas fa-feather-alt"></i> <span>{post.author}</span>
                        </div>
                    </div>
                ))}
            </div>
        )}
        
        {/* PANDITJI AI */}
        {activeSection === AppSection.PANDITJI && (
            <div className="max-w-2xl mx-auto pb-20">
                <AIPanditji userTier={userTier} />
            </div>
        )}

        {/* KUNDALI MILAN */}
        {activeSection === AppSection.KUNDALI_MILAN && (
             <div className="max-w-2xl mx-auto glass p-8 rounded-3xl border border-[#d97706]/30 text-center">
                 <h3 className="text-2xl font-cinzel text-white mb-2">Vedic Match Making</h3>
                 <p className="text-stone-400 text-sm mb-6">Ashta Koota Guna Milan</p>
                 <div className="grid grid-cols-2 gap-4 text-left">
                     <div>
                         <label className="text-xs text-stone-500 uppercase">Boy's Details</label>
                         <input type="date" value={boyDOB} onChange={e => setBoyDOB(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white mt-1" />
                         <input type="time" value={boyTime} onChange={e => setBoyTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white mt-1" />
                     </div>
                     <div>
                         <label className="text-xs text-stone-500 uppercase">Girl's Details</label>
                         <input type="date" value={girlDOB} onChange={e => setGirlDOB(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white mt-1" />
                         <input type="time" value={girlTime} onChange={e => setGirlTime(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white mt-1" />
                     </div>
                 </div>
                 <button className="mt-6 bg-pink-600 text-white px-8 py-2 rounded-full font-bold hover:bg-pink-500 transition-colors w-full">Check Compatibility</button>
             </div>
        )}

        {/* REMEDIES */}
        {activeSection === AppSection.REMEDIES && (
            <div className="max-w-2xl mx-auto glass p-8 rounded-3xl border border-[#d97706]/30">
                <h3 className="text-2xl font-cinzel text-[#d97706] mb-6 text-center">Instant Remedies</h3>
                <textarea 
                    value={remedyIssue}
                    onChange={(e) => setRemedyIssue(e.target.value)}
                    placeholder="Describe your problem (e.g., 'Financial instability', 'Nightmares', 'Lack of focus')..."
                    className="w-full bg-black/40 border border-[#d97706]/30 rounded-xl p-4 text-white focus:border-[#d97706] outline-none h-32"
                />
                <button onClick={() => fetchRemedy(remedyIssue)} disabled={remedyLoading} className="w-full mt-4 bg-[#d97706] text-white font-bold py-3 rounded-lg hover:bg-[#b45309] transition-all">
                    {remedyLoading ? 'Consulting the Sages...' : 'Get Remedy'}
                </button>
                {remedyResult && (
                    <div className="mt-6 glass bg-amber-900/10 p-6 rounded-xl border border-amber-500/20 animate-fade-in">
                        <i className="fas fa-spa text-amber-500 text-2xl mb-3"></i>
                        <p className="text-stone-300 font-serif leading-relaxed">{remedyResult}</p>
                    </div>
                )}
            </div>
        )}

        {/* ADMIN DOWNLOADS */}
        {activeSection === AppSection.DOWNLOADS && isAdmin && (
            <div className="max-w-4xl mx-auto pb-20">
                <div className="glass p-8 rounded-3xl border border-red-500/30">
                    <h3 className="text-2xl font-cinzel text-red-400 mb-6">Admin Control Panel</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                             <h4 className="text-stone-400 uppercase text-xs font-bold mb-4">Batch Generation</h4>
                             <div className="space-y-4">
                                 <div>
                                     <label className="text-xs text-stone-500 block mb-1">Target Date</label>
                                     <input type="date" value={downloadDate} onChange={e => setDownloadDate(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded p-2 text-white" />
                                 </div>
                                 <div className="flex gap-4">
                                     <button onClick={() => setBulkLang('en')} className={`flex-1 py-2 rounded border ${bulkLang === 'en' ? 'bg-red-900/40 border-red-500 text-white' : 'border-white/10 text-stone-500'}`}>English</button>
                                     <button onClick={() => setBulkLang('hi')} className={`flex-1 py-2 rounded border ${bulkLang === 'hi' ? 'bg-red-900/40 border-red-500 text-white' : 'border-white/10 text-stone-500'}`}>Hindi</button>
                                 </div>
                                 <div className="flex gap-2">
                                     <button onClick={() => handleBulkDownload('txt')} disabled={!!bulkProgress} className="flex-1 bg-white text-black font-bold py-2 rounded hover:bg-stone-200">
                                         {bulkProgress ? 'Processing...' : 'Generate TXT'}
                                     </button>
                                     <button onClick={() => handleBulkDownload('json')} disabled={!!bulkProgress} className="flex-1 bg-stone-700 text-white font-bold py-2 rounded hover:bg-stone-600">
                                         JSON
                                     </button>
                                 </div>
                                 {bulkProgress && (
                                     <div className="bg-stone-800 rounded-lg p-3">
                                         <div className="flex justify-between text-xs text-stone-400 mb-1">
                                             <span>{bulkProgress.status}</span>
                                             <span>{Math.round((bulkProgress.current / bulkProgress.total) * 100)}%</span>
                                         </div>
                                         <div className="w-full bg-stone-700 h-1.5 rounded-full overflow-hidden">
                                             <div className="bg-red-500 h-full transition-all duration-300" style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}></div>
                                         </div>
                                     </div>
                                 )}
                             </div>
                        </div>
                        <div>
                             <h4 className="text-stone-400 uppercase text-xs font-bold mb-4">Manual Upload & Verification</h4>
                             <div className="space-y-4">
                                 <div className="border-2 border-dashed border-stone-700 rounded-xl p-6 text-center hover:border-stone-500 transition-colors cursor-pointer relative">
                                     <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept=".txt,.json" />
                                     <i className="fas fa-cloud-upload-alt text-2xl text-stone-500 mb-2"></i>
                                     <p className="text-xs text-stone-400">Drop Manual Batch File Here<br/>(Format: ### Rashi ...)</p>
                                 </div>
                                 <button onClick={handleTestRepoConnection} className="w-full border border-stone-600 text-stone-400 py-2 rounded hover:bg-stone-800">Verify Cloud Connection</button>
                             </div>
                        </div>
                    </div>
                    <div className="mt-8 bg-black/40 rounded-xl p-4 font-mono text-xs text-stone-500 h-40 overflow-y-auto">
                        {adminLog.map((log, i) => <div key={i}>{log}</div>)}
                    </div>
                </div>
            </div>
        )}

      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <div className="md:hidden fixed bottom-0 left-0 w-full bg-[#1c1917] border-t border-[#d97706]/30 z-50 px-4 py-3 pb-safe">
        <div className="flex justify-between items-center overflow-x-auto gap-2 no-scrollbar">
            {navItems.map(item => (
                <button 
                    key={item.id} 
                    onClick={() => handleNavClick(item.id)} 
                    className={`flex flex-col items-center min-w-[60px] p-2 rounded-xl transition-all ${activeSection === item.id ? 'text-[#d97706]' : 'text-stone-500'}`}
                >
                    <i className={`fas ${item.icon} text-lg mb-1`}></i>
                    <span className="text-[9px] font-medium whitespace-nowrap">{item.label}</span>
                </button>
            ))}
        </div>
      </div>

      {/* BLOG POST MODAL */}
      {selectedBlogPost && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur p-4" onClick={() => setSelectedBlogPost(null)}>
              <div className="bg-[#1c1917] max-w-2xl w-full max-h-[80vh] overflow-y-auto rounded-3xl p-8 border border-[#d97706]/30 shadow-2xl" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setSelectedBlogPost(null)} className="float-right text-stone-500 hover:text-white"><i className="fas fa-times text-xl"></i></button>
                  <span className="text-[#d97706] text-xs font-bold uppercase tracking-wider">{selectedBlogPost.date}</span>
                  <h2 className="text-3xl font-cinzel text-white mt-2 mb-6">{selectedBlogPost.title}</h2>
                  <div className="prose prose-invert prose-stone max-w-none">
                      <p className="whitespace-pre-line leading-relaxed text-stone-300 font-serif">{selectedBlogPost.content}</p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-white/10 flex justify-between items-center">
                      <div className="text-sm text-stone-500">Author: <span className="text-white">{selectedBlogPost.author}</span></div>
                      <button className="text-[#d97706] hover:text-white transition-colors"><i className="fas fa-share-alt"></i> Share</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default App;
