
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { BlogPost } from "../types";

/** 
 * CONFIGURATION: 
 * GITHUB PAGES URL
 */
export const GLOBAL_STORAGE_BASE_URL = "https://prateekmalhotracontentcreator-coder.github.io/Celestial-AI"; 

export interface StructuredHoroscope {
  mood: string;
  positives: string[];
  cautions: string[];
  concerns?: string[]; // Alias for cautions
  remedies: string;
  luckyColor: string;
  detailedPrediction: string;
  generalAdvice: string;
  meta?: { source: 'cloud' | 'api' | 'fallback' | 'cloud-json' | 'manual-upload' }; 
}

export interface YearlyForecast {
  planetarySummary: { planet: string, rashi: string, degree: string, nakshatra: string }[];
  predictions: {
    health: string;
    wealth: string;
    love: string;
    career: string;
  };
  remedies: string[];
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- CACHE FOR BATCH FILES ---
const DAILY_BATCH_CACHE: Record<string, Record<string, StructuredHoroscope>> = {};

/**
 * Helper to get AI Client safely
 */
const getAIClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.warn("API Key is currently missing. Ensure one is selected via the UI.");
    }
    return new GoogleGenAI({ apiKey: apiKey || "" });
};

/**
 * FETCH BLOG POSTS FROM CLOUD
 */
export const fetchGlobalBlogPosts = async (): Promise<BlogPost[] | null> => {
    const paths = ['/blog_posts.json', '/public/blog_posts.json'];
    for (const path of paths) {
        try {
            const url = `${GLOBAL_STORAGE_BASE_URL}${path}?t=${Date.now()}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                return Array.isArray(data) ? data : null;
            }
        } catch (e) { }
    }
    return null;
};

/**
 * CLEAN RAW TEXT
 * Removes RTF tags only. PRESERVES CONTENT.
 */
const cleanRawText = (text: string): string => {
    let clean = text;

    // 1. RTF & Format Cleaning
    if (clean.includes("{\\rtf") || clean.includes("\\ansi") || clean.includes("\\cb")) {
        clean = clean.replace(/\{\\rtf1[\s\S]*?(?=\#\#\#)/, ''); 
        clean = clean.replace(/\\'a0/gi, ' ');
        clean = clean.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        clean = clean.replace(/\\[a-z0-9-]+ ?/gi, '');
        clean = clean.replace(/[{}]/g, '');
        clean = clean.replace(/\\$/gm, '');
    }
    
    // NO aggressive cleaning. Trust the source file.

    return clean;
};

/**
 * SECTION HEADERS MAPPING (English & Hindi)
 */
const SECTION_MATCHERS = {
    mood: ['mood', 'mano dasha', 'manodasha', 'मूड', 'मनोदशा', 'चित्तवृत्ति', 'mindset', 'current mood', 'aaj ka mood'],
    positives: ['positives', 'positive', 'sakaraltmak', 'shubh', 'सकारात्मक', 'सकारात्मक पक्ष', 'शुभ', 'strong points', 'strengths', 'gun', 'positive points'],
    cautions: ['cautions', 'concerns', 'negatives', 'savdhani', 'savdhaniyan', 'chintaye', 'सावधानियां', 'नकारात्मक', 'नकारात्मक पक्ष', 'चिंताएं', 'weaknesses', 'challenges', 'negative points'],
    remedies: [
        'remedies', 'remedy', 'vedic remedy', 'vedic remedies', 'divine remedy', 
        'upay', 'nivaran', 'उपाय', 'निवारण', 'samadhan', 'समाधान', 'solution', 
        'sujhav', 'सुझाव', 'vedic upay', 'totke', 'totka', 'upaya', 'daan', 'pooja', 
        'mantra', 'remedy/upay', 'upay/remedy', 'vastu/remedies', 'vastu remedies', 
        'vastu', 'remedy/vastu', 'vastu tips', 'vastu dosh', 'vastu & remedies', 'upay aur samadhan',
        // Expanded variations with spaces and other separators
        'vastu / remedies', 'remedies / vastu', 'vastu-remedies', 'remedies-vastu', 
        'vastu  / remedies', 'vastu/ remedies', 'vastu /remedies',
        'feng shui', 'fengshui', 'feng-shui'
    ],
    luckyColor: [
        'lucky color', 'lucky colour', 'lucky hue', 'shubh rang', 'color', 'colour', 
        'शुभ रंग', 'रंग', 'bhagyashali rang', 'भाग्यशाली रंग', 'anukul rang', 'अनुकूल रंग',
        'lucky color/rang', 'rang/color', 'lucky colour (hin)'
    ],
    detailedPrediction: ['detailed prediction', 'prediction', 'rashifal', 'bhavishya', 'राशिफल', 'विस्तृत राशिफल', 'भविष्य', 'forecast', 'daily horoscope', 'aaj ka rashifal'],
    generalAdvice: ['general advice', 'advice', 'salah', 'sujhav', 'सलाह', 'सुझाव', 'सामान्य सलाह', 'margdarshan', 'guidance', 'cosmic advice', 'aaj ki salah']
};

/**
 * PARSER V5: FALLBACK-FIRST
 * Defaults to Detailed Prediction to ensure text capture.
 * Removes English defaults to prevent data masking.
 */
const parseTextHoroscope = (text: string): StructuredHoroscope => {
    const lines = text.split('\n');
    
    const data: any = {
        mood: "",
        positives: [],
        cautions: [],
        remedies: "",
        luckyColor: "",
        detailedPrediction: "",
        generalAdvice: ""
    };

    // CRITICAL FIX: Default to detailedPrediction. 
    // If no headers are found, all text goes into detailedPrediction.
    let currentSection: string | null = 'detailedPrediction';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue; 
        
        // 1. Detect Section Header
        let detectedSection: string | null = null;
        let contentPart = line;

        // EXPANDED BULLET PATTERN: Handles •, ●, ▪, -, *, #, and unicode bullets
        const bulletPattern = "^[\\*\\-#•●▪\u2022\u2023\u25E6\u2043\u2219\\s]*";

        // SPECIAL FIX: Force check for "Vastu/Remedies:" or "Upay:" if they appear at start of line
        // This overrides standard parsing if the regex is too strict
        const lowerLine = line.toLowerCase();
        if ((lowerLine.startsWith('vastu') || lowerLine.startsWith('remedies') || lowerLine.startsWith('upay')) && 
            (lowerLine.includes(':') || lowerLine.includes('-') || line.includes('**'))) {
             // It's likely a header.
             detectedSection = 'remedies';
             // Clean the header out
             contentPart = line.replace(/^(vastu|remedies|upay)[^:]*[:\-]/i, '').trim();
        } else {
             // Standard Regex Check
             for (const [key, matchers] of Object.entries(SECTION_MATCHERS)) {
                for (const matcher of matchers) {
                    // Escape special regex characters in the matcher string (like / or .)
                    const escapedMatcher = matcher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    
                    // Regex: Start of line (w/ bullets), matcher, end punctuation
                    const regex = new RegExp(`${bulletPattern}${escapedMatcher}[\\*\\s:\\-]*`, 'i');
                    
                    if (regex.test(line)) {
                        detectedSection = key;
                        // Remove the header from the line to get potential inline content
                        contentPart = line.replace(regex, '').trim();
                        break;
                    }
                }
                if (detectedSection) break;
            }
        }

        if (detectedSection) {
            currentSection = detectedSection;
            // If the remainder is basically empty, skip appending for now (next lines will be content)
            if (contentPart.replace(/[:\-\s]+/, '') === '') continue;
        }

        // 2. Parse Content
        if (currentSection) {
            // Clean content part (remove leading colons/dashes/bullets)
            // Use same robust bullet pattern for cleaning
            let cleanContent = contentPart.replace(new RegExp(`${bulletPattern}`), '').trim();
            // Remove wrapping quotes if present
            cleanContent = cleanContent.replace(/^["']+|["']+$/g, '');
            // Remove initial colons that might have survived
            cleanContent = cleanContent.replace(/^[:\s]+/, '');

            if (!cleanContent) continue;

            if (currentSection === 'positives' || currentSection === 'cautions') {
                // For list items, we still split by comma/pipe/bullet to create an array
                const items = cleanContent.split(/[,•|]/)
                    .map(s => s.trim().replace(/^[-*•\d\.]+\s*/, '').replace(/^["']+|["']+$/g, ''))
                    .filter(s => s.length > 1); 
                
                if (items.length > 0) {
                    if (data[currentSection].length === 0) {
                        data[currentSection] = items;
                    } else {
                        data[currentSection].push(...items);
                    }
                }
            } else {
                // For text blocks (Detailed Prediction, Mood, etc.)
                if (data[currentSection]) {
                    // Join with NEWLINE, not space. Preserves paragraph structure.
                    data[currentSection] += "\n" + cleanContent;
                } else {
                    data[currentSection] = cleanContent;
                }
            }
        }
    }

    // 3. Fallbacks
    const safeString = (val: any) => typeof val === 'string' ? val.trim() : "";

    // CRITICAL FIX: If parsing failed completely (still empty detailedPrediction), 
    // dump the entire original text into detailedPrediction.
    // This ensures we NEVER lose data even if headers are weird.
    if (!data.detailedPrediction && text.trim().length > 0) {
        data.detailedPrediction = text.trim();
    }
    
    // CRITICAL FIX: REMOVE ENGLISH DEFAULTS. 
    // Return raw empty strings/arrays if data is missing, so JSON reflects reality.
    return {
        mood: safeString(data.mood), 
        positives: data.positives,
        cautions: data.cautions,
        remedies: safeString(data.remedies),
        luckyColor: safeString(data.luckyColor),
        detailedPrediction: safeString(data.detailedPrediction),
        generalAdvice: safeString(data.generalAdvice),
        meta: { source: 'manual-upload' } 
    };
};

const RASHI_MAP: Record<string, string> = {
    'aries': 'Aries', 'taurus': 'Taurus', 'gemini': 'Gemini', 'cancer': 'Cancer', 
    'leo': 'Leo', 'virgo': 'Virgo', 'libra': 'Libra', 'scorpio': 'Scorpio', 
    'sagittarius': 'Sagittarius', 'capricorn': 'Capricorn', 'aquarius': 'Aquarius', 'pisces': 'Pisces',
    'mesh': 'Aries', 'vrishabh': 'Taurus', 'mithun': 'Gemini', 'kark': 'Cancer', 
    'simha': 'Leo', 'kanya': 'Virgo', 'tula': 'Libra', 'vrishchik': 'Scorpio', 
    'dhanu': 'Sagittarius', 'makar': 'Capricorn', 'kumbh': 'Aquarius', 'meen': 'Pisces',
    // Hindi Devanagari Mapping
    'मेष': 'Aries', 'वृषभ': 'Taurus', 'मिथुन': 'Gemini', 'कर्क': 'Cancer',
    'सिंह': 'Leo', 'कन्या': 'Virgo', 'तुला': 'Libra', 'वृश्चिक': 'Scorpio',
    'धनु': 'Sagittarius', 'मकर': 'Capricorn', 'कुंभ': 'Aquarius', 'मीन': 'Pisces'
};

const normalizeRashiName = (name: string) => {
    const clean = name
        .replace(/rashi|राशि/gi, '')
        .replace(/[()0-9#\-\*\.\\]/g, '') 
        .replace(/cb\d+/gi, '') 
        .trim()
        .toLowerCase();
        
    if (RASHI_MAP[clean]) return RASHI_MAP[clean];
    for (const key of Object.keys(RASHI_MAP)) {
        if (clean.includes(key)) return RASHI_MAP[key];
    }
    if (clean.length > 2) return clean.charAt(0).toUpperCase() + clean.slice(1);
    return null;
};

const parseDailyBatch = (text: string): Record<string, StructuredHoroscope> => {
    const cleanedText = cleanRawText(text);
    const result: Record<string, StructuredHoroscope> = {};
    const blocks = cleanedText.split('###'); 

    blocks.forEach(block => {
        const trimmed = block.trim();
        if (!trimmed) return;
        
        const lines = trimmed.split('\n');
        const rawName = lines[0].trim();
        const rashiName = normalizeRashiName(rawName);
        
        if (rashiName) {
            const content = lines.slice(1).join('\n');
            result[rashiName] = {
                ...parseTextHoroscope(content),
                meta: { source: 'manual-upload' } 
            };
        }
    });
    return result;
};

// --- MANUAL UPLOAD LOGIC ---
export const injectBatchData = (date: string, lang: string, text: string): string[] => {
    const batchKey = `${date}_${lang}`;
    console.log(`[Manual Upload] Processing for ${batchKey}`);
    
    const parsed = parseDailyBatch(text);
    const keys = Object.keys(parsed);
    
    if (keys.length > 0) {
        DAILY_BATCH_CACHE[batchKey] = parsed;
        try {
            localStorage.setItem(`manual_batch_${batchKey}`, JSON.stringify(parsed));
        } catch(e) { console.warn("Storage full", e); }
        console.log(`%c [Manual Upload] Injected ${keys.length} Rashis for ${batchKey}`, 'color: #d97706; font-weight: bold;');
    } else {
        console.warn('Manual Upload Failed: No Rashis detected. Ensure format starts with "### Aries"');
    }
    return keys;
};

export const fetchGlobalStaticData = async (rashi: string, lang: string, date: string): Promise<StructuredHoroscope | null> => {
    const batchKey = `${date}_${lang}`;

    // 1. Check In-Memory Cache first
    if (DAILY_BATCH_CACHE[batchKey] && DAILY_BATCH_CACHE[batchKey][normalizeRashiName(rashi) || rashi]) {
        return DAILY_BATCH_CACHE[batchKey][normalizeRashiName(rashi) || rashi];
    }

    // 2. Check Persistent Local Storage
    try {
        const stored = localStorage.getItem(`manual_batch_${batchKey}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            const norm = normalizeRashiName(rashi);
            // We trust the manual upload.
            if (norm && parsed[norm]) {
                const data = { ...parsed[norm], meta: { source: 'manual-upload' } };
                DAILY_BATCH_CACHE[batchKey] = parsed; // Rehydrate cache
                return data as StructuredHoroscope;
            }
        }
    } catch(e) {}

    // 3. Try Fetching Batch TXT File (Cloud)
    const batchFileName = `${date}_${lang}.txt`;
    const batchPaths = [`/horoscopes/${batchFileName}`, `/${batchFileName}`];

    for (const path of batchPaths) {
        try {
            const url = `${GLOBAL_STORAGE_BASE_URL}${path}?t=${Date.now()}`;
            const response = await fetch(url);
            if (response.ok) {
                const text = await response.text();
                const parsedBatch = parseDailyBatch(text);
                DAILY_BATCH_CACHE[batchKey] = parsedBatch;
                const norm = normalizeRashiName(rashi);
                return (norm ? parsedBatch[norm] : null) || null;
            }
        } catch(e) {}
    }

    // 4. Try Fetching Individual JSON File (Cloud)
    const baseName = `${date}_${rashi}_${lang}`;
    const candidates = [
        `/${baseName}.json`,
        `/${baseName}%20(1).json`,
        `/json/${baseName}.json`,
        `/horoscopes/${baseName}.json`
    ];

    for (const path of candidates) {
        try {
             const url = `${GLOBAL_STORAGE_BASE_URL}${path}?t=${Date.now()}`; 
             const response = await fetch(url);
             if (response.ok) {
                 const data = await response.json();
                 if (data.concerns && (!data.cautions || data.cautions.length === 0)) {
                     data.cautions = data.concerns;
                 }
                 return { ...data, meta: { source: 'cloud-json' } };
             }
        } catch (e) {}
    }

    return null;
};

export const verifyConnection = async (date: string): Promise<string[]> => {
    const results: string[] = [];
    results.push(`Target Base: ${GLOBAL_STORAGE_BASE_URL}`);
    const timestamp = Date.now();
    
    const batchPaths = [`/horoscopes/${date}_en.txt`, `/${date}_en.txt`];
    let batchFound = false;
    for (const path of batchPaths) {
         const url = `${GLOBAL_STORAGE_BASE_URL}${path}?t=${timestamp}`;
         try {
             const res = await fetch(url, {method: 'HEAD'});
             if (res.ok) { results.push(`✅ Batch TXT found: ${path}`); batchFound = true; break; }
         } catch (e) { }
    }
    if(!batchFound) results.push("ℹ️ No Batch TXT found.");

    return results;
}

export const getDailyHoroscope = async (
    rashi: string, 
    lang: 'en' | 'hi', 
    date: string, 
    allowApiFallback: boolean = false, 
    throwError: boolean = false
): Promise<StructuredHoroscope | string> => {
    const staticData = await fetchGlobalStaticData(rashi, lang, date);
    if (staticData) return staticData;

    if (allowApiFallback) {
        try {
            const ai = getAIClient();
            const prompt = `Generate a daily horoscope for ${rashi} for date ${date}. Language: ${lang === 'hi' ? 'Hindi' : 'English'}. Output STRICT JSON format with keys: mood, positives (array), cautions (array), remedies, luckyColor, detailedPrediction, generalAdvice.`;
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json',
                    maxOutputTokens: 8192, // PREVENT TRUNCATION
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            mood: { type: Type.STRING },
                            positives: { type: Type.ARRAY, items: { type: Type.STRING } },
                            cautions: { type: Type.ARRAY, items: { type: Type.STRING } },
                            remedies: { type: Type.STRING },
                            luckyColor: { type: Type.STRING },
                            detailedPrediction: { type: Type.STRING },
                            generalAdvice: { type: Type.STRING },
                        }
                    }
                }
            });
            let text = response.text;
            if (text) {
                text = text.trim().replace(/^```json\s*/, '').replace(/```\s*$/, '');
                const json = JSON.parse(text) as StructuredHoroscope;
                json.meta = { source: 'api' };
                return json;
            }
        } catch (e) { 
            console.error("API Fallback failed", e); 
            if (throwError) throw e;
        }
    }
    return "Data unavailable. Please try again later.";
};

export const getRemedyAdvice = async (issue: string): Promise<string> => {
    try {
        const ai = getAIClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Act as a Vedic Astrologer. Remedy for: "${issue}". Under 100 words.`
        });
        return response.text || "Meditate on your breath.";
    } catch (e) { return "Service temporarily unavailable."; }
};

export const getVastuDetails = async (type: 'Vastu' | 'Feng Shui', room: string): Promise<string> => {
    try {
        const ai = getAIClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Provide 3 practical and spiritual ${type} tips for the ${room} to improve energy flow. Concise bullet points.`
        });
        return response.text || "Ensure the area is clean and clutter-free for positive energy.";
    } catch (e) { return "Unable to fetch wisdom."; }
};

export const generateTextToSpeech = async (text: string): Promise<string | null> => {
    try {
        const ai = getAIClient();
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
            },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
    } catch (e) { return null; }
};

export const generateHoroscopeVideo = async (rashi: string, mood: string, date: string): Promise<string | null> => {
    try {
        const ai = getAIClient();
        let operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: `Mystical cinematic 1080p background for zodiac ${rashi}. Mood: ${mood}. Cosmic, Golden Particles. No text.`,
            config: { numberOfVideos: 1, resolution: '1080p', aspectRatio: '9:16' }
        });
        while (!operation.done) {
            await wait(5000);
            operation = await ai.operations.getVideosOperation({operation: operation});
        }
        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (videoUri) {
            const res = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
            const blob = await res.blob();
            return URL.createObjectURL(blob);
        }
    } catch (e) { }
    return null;
};

export const checkGlobalVideoUrl = async (rashi: string, lang: string, date: string): Promise<string | null> => {
    const fileName = `${date}_${rashi}_${lang}.webm`;
    const url = `${GLOBAL_STORAGE_BASE_URL}/videos/${fileName}`;
    try {
        const res = await fetch(url, { method: 'HEAD' });
        if (res.ok) return url;
        const flatUrl = `${GLOBAL_STORAGE_BASE_URL}/${fileName}`;
        const res2 = await fetch(flatUrl, { method: 'HEAD' });
        if (res2.ok) return flatUrl;
    } catch (e) { }
    return null;
};

export const getYearlyForecast = async (name: string, dob: string, time: string, location: string): Promise<YearlyForecast | string> => {
    try {
        const ai = getAIClient();
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview', 
            contents: `Yearly Vedic Horoscope for ${name} (DOB: ${dob}, Place: ${location}). Output JSON: planetarySummary (array), predictions (health, wealth, love, career), remedies (array).`,
            config: { 
                maxOutputTokens: 8192,
                responseMimeType: 'application/json', 
                responseSchema: { type: Type.OBJECT, properties: { planetarySummary: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { planet: {type: Type.STRING}, rashi: {type: Type.STRING}, degree: {type: Type.STRING}, nakshatra: {type: Type.STRING} } } }, predictions: { type: Type.OBJECT, properties: { health: {type: Type.STRING}, wealth: {type: Type.STRING}, love: {type: Type.STRING}, career: {type: Type.STRING} } }, remedies: { type: Type.ARRAY, items: {type: Type.STRING} } } } }
        });
        return response.text ? JSON.parse(response.text) : "Error";
    } catch (e) { return "Could not generate forecast."; }
};
