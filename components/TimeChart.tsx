
import React, { useState, useEffect, useRef, useMemo } from 'react';

// --- ASTRONOMICAL CALCULATION HELPERS ---
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
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    const B = (360 / 365) * (dayOfYear - 81);
    const eot = 9.87 * Math.sin(toRadians(2 * B)) - 7.53 * Math.cos(toRadians(B)) - 1.5 * Math.sin(toRadians(B));
    
    const longitudeCorrection = (82.5 - 77.2) * 4; 
    const localNoonMinutes = 720 + longitudeCorrection - eot;

    const declination = 23.45 * Math.sin(toRadians((360 / 365) * (dayOfYear - 81)));
    const lat = 28.61;
    const cosW = -Math.tan(toRadians(lat)) * Math.tan(toRadians(declination));
    const w = toDegrees(Math.acos(cosW));
    const durationHalfMinutes = w * 4;

    return {
        sunrise: localNoonMinutes - durationHalfMinutes,
        sunset: localNoonMinutes + durationHalfMinutes,
        noon: localNoonMinutes,
        dayDuration: durationHalfMinutes * 2
    };
};

const getDailyMuhurats = (date: Date) => {
    const sun = getSunTimes(date);
    const dayIndex = date.getDay(); 

    const rahuSegments = [8, 2, 7, 5, 6, 4, 3]; 
    const segmentIndex = rahuSegments[dayIndex] - 1;
    
    const segmentDuration = sun.dayDuration / 8;
    const rahuStart = sun.sunrise + (segmentIndex * segmentDuration);
    const rahuEnd = rahuStart + segmentDuration;

    const abhijitStart = sun.noon - 24;
    const abhijitEnd = sun.noon + 24;

    return {
        ...sun,
        rahuStart,
        rahuEnd,
        abhijitStart,
        abhijitEnd
    };
};

interface TimeChartProps {
    date: string;
    extraData?: any;
    lang: 'en' | 'hi';
}

const CosmicClock: React.FC<TimeChartProps> = ({ date, extraData, lang }) => {
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const t = {
      chartTitle: lang === 'hi' ? "Surya Urja Grid" : "Surya Urja Grid",
      abhijit: lang === 'hi' ? "Abhijit (Shubh)" : "Abhijit (Good)",
      rahu: lang === 'hi' ? "Rahu Kaal (Ashubh)" : "Rahu Kaal (Avoid)",
      timings: lang === 'hi' ? "Shubh Muhurat" : "Cosmic Timings",
      panchang: lang === 'hi' ? "Dainik Panchang" : "Daily Panchang",
      dayLen: lang === 'hi' ? "Din Maan" : "Day Duration",
      solarPower: lang === 'hi' ? "Solar Power" : "Solar Power",
      sunrise: lang === 'hi' ? "Suryoday" : "SUNRISE",
      sunset: lang === 'hi' ? "Suryast" : "SUNSET",
      loading: lang === 'hi' ? "Loading..." : "Loading...",
  };

  const panchang = useMemo(() => {
      const d = new Date(date);
      const times = getDailyMuhurats(d);
      return {
          dateStr: d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
          times
      };
  }, [date]);

  const [currentTimeMinutes, setCurrentTimeMinutes] = useState(0);
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const today = new Date().toISOString().split('T')[0];
      if (date === today) {
          setCurrentTimeMinutes(now.getHours() * 60 + now.getMinutes());
      } else {
          setCurrentTimeMinutes(-1);
      }
    };
    updateTime();
    const timer = setInterval(updateTime, 60000);
    return () => clearInterval(timer);
  }, [date]);

  const VIEW_START = 5 * 60; // 5:00 AM
  const VIEW_END = 20 * 60;  // 8:00 PM
  const TOTAL_MINS = VIEW_END - VIEW_START;

  const getX = (mins: number) => {
      const pct = ((mins - VIEW_START) / TOTAL_MINS) * 100;
      return Math.max(0, Math.min(100, pct));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const mins = VIEW_START + (pct * TOTAL_MINS);
      setHoverTime(mins);
  };

  const getSunIntensity = (mins: number) => {
      if (mins < panchang.times.sunrise || mins > panchang.times.sunset) return 0;
      const dayDuration = panchang.times.sunset - panchang.times.sunrise;
      const progress = (mins - panchang.times.sunrise) / dayDuration;
      return Math.sin(progress * Math.PI);
  };

  const BOTTOM_Y = 85;
  const TOP_Y = 25;
  const HEIGHT = BOTTOM_Y - TOP_Y;

  const getYForTime = (mins: number) => {
      const intensity = getSunIntensity(mins);
      return BOTTOM_Y - (intensity * HEIGHT);
  };

  const sunCurvePoints = [];
  for (let m = VIEW_START; m <= VIEW_END; m += 5) {
      const x = ((m - VIEW_START) / TOTAL_MINS) * 100;
      const y = getYForTime(m);
      sunCurvePoints.push(`${x},${y}`);
  }
  const areaPath = `M 0,${BOTTOM_Y} L ${sunCurvePoints.join(' L ')} L 100,${BOTTOM_Y} Z`;
  const linePath = `M ${sunCurvePoints[0].split(',')[0]},${sunCurvePoints[0].split(',')[1]} L ${sunCurvePoints.join(' L ')}`;

  const checkTime = hoverTime || (currentTimeMinutes > 0 ? currentTimeMinutes : 720); 
  
  const rahuRect = { 
      x: getX(panchang.times.rahuStart), 
      w: getX(panchang.times.rahuEnd) - getX(panchang.times.rahuStart) 
  };
  const abhijitRect = { 
      x: getX(panchang.times.abhijitStart), 
      w: getX(panchang.times.abhijitEnd) - getX(panchang.times.abhijitStart) 
  };

  const magX = hoverTime ? getX(hoverTime) : 0;
  const magY = hoverTime ? getYForTime(hoverTime) : 0;
  
  const hours = Array.from({length: 16}, (_, i) => i + 5);

  return (
     <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 font-sans">
        {/* LEFT: CHART */}
        <div className="lg:col-span-4 relative flex flex-col group">
            <div className="absolute inset-0 bg-gradient-to-b from-[#1c1917] to-[#0f0a05] rounded-[2rem] border border-[#d97706]/30 shadow-2xl"></div>
            
            <div className="relative z-10 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#5c4033]/20 gap-4">
                 <div>
                    <h3 className="text-xl font-cinzel text-amber-500 font-bold drop-shadow-md flex items-center gap-2">
                        <i className="fas fa-chart-line"></i> {t.chartTitle}
                    </h3>
                    <div className="flex gap-4 mt-2">
                         {/* LEGENDS */}
                         <div className="flex items-center gap-2">
                             <div className="w-3 h-3 bg-emerald-500/50 border border-emerald-400 rounded-sm"></div>
                             <span className="text-[10px] text-stone-400 uppercase font-bold">{t.abhijit}</span>
                         </div>
                         <div className="flex items-center gap-2">
                             <div className="w-3 h-3 bg-red-500/50 border border-red-400 rounded-sm"></div>
                             <span className="text-[10px] text-stone-400 uppercase font-bold">{t.rahu}</span>
                         </div>
                    </div>
                 </div>
                 <div className="text-right">
                     <p className="text-[10px] text-stone-500 font-mono">{formatTime(checkTime)}</p>
                     <p className="text-[10px] text-amber-500 font-bold">{Math.round(getSunIntensity(checkTime) * 100)}% {t.solarPower}</p>
                 </div>
            </div>

            <div className="relative h-[300px] w-full">
                {/* SVG CHART */}
                <div 
                    ref={containerRef}
                    className="absolute inset-0 cursor-crosshair overflow-hidden"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoverTime(null)}
                >
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                        {rahuRect.w > 0 && <rect x={rahuRect.x} y="0" width={rahuRect.w} height="100" fill="url(#rahuPattern)" opacity="0.3" />}
                        {abhijitRect.w > 0 && <rect x={abhijitRect.x} y="0" width={abhijitRect.w} height="100" fill="url(#abhijitPattern)" opacity="0.3" />}

                        <path d={areaPath} fill="url(#sunGradient)" className="opacity-40" />
                        <path d={linePath} fill="none" stroke="#d97706" strokeWidth="0.8" strokeLinecap="round" />
                        
                        <defs>
                            <linearGradient id="sunGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#d97706" stopOpacity="0.6"/>
                                <stop offset="100%" stopColor="#d97706" stopOpacity="0"/>
                            </linearGradient>
                            <pattern id="rahuPattern" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                <line x1="0" y1="0" x2="0" y2="3" stroke="#ef4444" strokeWidth="1" />
                            </pattern>
                            <pattern id="abhijitPattern" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                                <line x1="0" y1="0" x2="0" y2="3" stroke="#10b981" strokeWidth="1" />
                            </pattern>
                        </defs>

                        <line x1={getX(panchang.times.sunrise)} y1="0" x2={getX(panchang.times.sunrise)} y2="100" stroke="#fcd34d" strokeWidth="0.2" strokeDasharray="1,1" />
                        <line x1={getX(panchang.times.sunset)} y1="0" x2={getX(panchang.times.sunset)} y2="100" stroke="#fcd34d" strokeWidth="0.2" strokeDasharray="1,1" />

                        {currentTimeMinutes > 0 && (
                            <line x1={getX(currentTimeMinutes)} y1="0" x2={getX(currentTimeMinutes)} y2="100" stroke="#f59e0b" strokeWidth="0.4" strokeDasharray="2,2" />
                        )}
                        
                        {hoverTime && (
                            <g>
                                <line x1={magX} y1="0" x2={magX} y2="100" stroke="white" strokeWidth="0.2" opacity="0.5" />
                                <line x1="0" y1={magY} x2="100" y2={magY} stroke="white" strokeWidth="0.2" opacity="0.5" />
                                
                                <circle cx={magX} cy={magY} r="5" fill="none" stroke="white" strokeWidth="0.5" />
                                <circle cx={magX} cy={magY} r="1.5" fill="white" />
                            </g>
                        )}
                    </svg>
                </div>

                {/* HTML LABELS (FIXED STRETCHING) */}
                <div 
                    className="absolute top-2 pointer-events-none" 
                    style={{ left: `${getX(panchang.times.sunrise)}%` }}
                >
                    <span className="text-[10px] text-[#fcd34d] font-bold -translate-x-1/2 block opacity-80">{t.sunrise}</span>
                </div>

                <div 
                    className="absolute top-2 pointer-events-none" 
                    style={{ left: `${getX(panchang.times.sunset)}%` }}
                >
                    <span className="text-[10px] text-[#fcd34d] font-bold -translate-x-1/2 block opacity-80">{t.sunset}</span>
                </div>
            </div>
            
            <div className="relative z-10 h-12 bg-black/40 border-t border-[#d97706]/20 flex justify-between items-center px-4 rounded-b-[2rem]">
                 {hours.map((h, i) => (
                     <div key={h} className="flex flex-col items-center gap-1 group/time cursor-pointer">
                         <div className="w-[1px] h-2 bg-stone-600 group-hover/time:bg-amber-500 group-hover/time:h-3 transition-all"></div>
                         <span className={`text-[9px] font-mono ${i % 2 === 0 ? 'text-stone-400' : 'text-stone-600 hidden md:block'} group-hover/time:text-amber-400`}>
                             {h > 12 ? h-12 : h} {h >= 12 ? 'PM' : 'AM'}
                         </span>
                     </div>
                 ))}
                 
                 {currentTimeMinutes > 0 && (
                     <div 
                        className="absolute bottom-0 left-0 h-[2px] bg-amber-500 shadow-[0_0_10px_#f59e0b]" 
                        style={{ width: `${getX(currentTimeMinutes)}%` }}
                     ></div>
                 )}
            </div>
        </div>

        {/* RIGHT: INFO PANEL */}
        <div className="lg:col-span-2 flex flex-col gap-4">
             {/* CRITICAL TIMINGS BLOCK */}
             <div className="glass bg-[var(--bg-secondary)] p-6 rounded-3xl border-t-4 border-amber-500 flex-1 min-h-[160px]">
                  <h4 className="text-sm font-bold text-amber-500 font-cinzel mb-4 flex items-center gap-2">
                      <i className="fas fa-clock"></i> {t.timings}
                  </h4>
                  <div className="space-y-4">
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="text-xs text-stone-400">{t.abhijit}</span>
                          <span className="text-xs font-bold text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded">
                              {formatTime(panchang.times.abhijitStart)} - {formatTime(panchang.times.abhijitEnd)}
                          </span>
                      </div>
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                          <span className="text-xs text-stone-400">{t.rahu}</span>
                          <span className="text-xs font-bold text-red-400 bg-red-900/20 px-2 py-1 rounded">
                              {formatTime(panchang.times.rahuStart)} - {formatTime(panchang.times.rahuEnd)}
                          </span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-xs text-stone-400">{t.dayLen}</span>
                          <span className="text-xs font-bold text-amber-400">
                              {Math.floor(panchang.times.dayDuration / 60)}h {Math.round(panchang.times.dayDuration % 60)}m
                          </span>
                      </div>
                  </div>
             </div>

             {/* TABULAR PANCHANG DETAILS */}
             <div className="glass bg-[var(--bg-secondary)] flex-1 rounded-3xl p-6 relative overflow-hidden">
                  <h5 className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-4 border-b border-white/5 pb-2">{t.panchang}</h5>
                  
                  {extraData ? (
                      <table className="w-full text-xs text-left">
                          <tbody>
                              <tr className="border-b border-white/5">
                                  <td className="py-2 text-stone-500 uppercase text-[9px]">Tithi</td>
                                  <td className="py-2 text-white font-bold text-right">{extraData.tithi}</td>
                              </tr>
                              <tr className="border-b border-white/5">
                                  <td className="py-2 text-stone-500 uppercase text-[9px]">Nakshatra</td>
                                  <td className="py-2 text-white font-bold text-right">{extraData.nakshatra}</td>
                              </tr>
                              <tr className="border-b border-white/5">
                                  <td className="py-2 text-stone-500 uppercase text-[9px]">Yoga</td>
                                  <td className="py-2 text-amber-500 font-bold text-right">{extraData.yoga}</td>
                              </tr>
                              <tr className="border-b border-white/5">
                                  <td className="py-2 text-stone-500 uppercase text-[9px]">Karana</td>
                                  <td className="py-2 text-white font-bold text-right">{extraData.karana}</td>
                              </tr>
                              <tr>
                                  <td className="py-2 text-stone-500 uppercase text-[9px]">Moon Sign</td>
                                  <td className="py-2 text-white font-bold text-right">{extraData.moonRashi}</td>
                              </tr>
                          </tbody>
                      </table>
                  ) : (
                      <div className="text-center text-stone-500 py-8">{t.loading}</div>
                  )}
             </div>
        </div>
     </div>
  );
};

export default CosmicClock;
