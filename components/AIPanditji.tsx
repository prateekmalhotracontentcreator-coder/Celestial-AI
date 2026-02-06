
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      const val = dataInt16[i * numChannels + channel] / 32768.0;
      channelData[i] = Math.max(-1, Math.min(1, val));
    }
  }
  return buffer;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

interface PanditjiProps {
    userTier: 'guest' | 'premium' | 'admin';
}

const AIPanditji: React.FC<PanditjiProps> = ({ userTier }) => {
  const isLocked = userTier === 'guest';

  const [isActive, setIsActive] = useState(false);
  const [status, setStatus] = useState('Press "Start Voice Call" to Begin');
  const [transcription, setTranscription] = useState('');
  const [inputText, setInputText] = useState('');
  const [isProcessingText, setIsProcessingText] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);

  // Connection Reset/Cleanup
  const stopSession = useCallback(() => {
    if (sessionRef.current) {
       try {
           sessionRef.current.close();
       } catch (e) {
           console.warn("Session close error", e);
       }
       sessionRef.current = null;
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
    setIsActive(false);
    setIsSpeaking(false);
    setStatus('Call Ended');
  }, []);

  const startSession = async () => {
    if (isLocked) {
        alert("This is a Premium feature. Please enter the Access Code in your Profile.");
        return;
    }

    setStatus('Connecting to Divine Frequency...');
    
    if (!process.env.API_KEY) {
        setStatus('Error: API Key Missing');
        return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      await audioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            setStatus('Panditji is Listening...');
            setIsActive(true);
            
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              // Ensure we don't send data if session is closed or not ready
              if (!sessionRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                let s = Math.max(-1, Math.min(1, inputData[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              // Direct send if session exists
              try {
                 sessionRef.current.sendRealtimeInput({ media: pcmBlob });
              } catch(err) {
                 console.warn("Send failed", err);
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              setTranscription(prev => prev + message.serverContent!.outputTranscription!.text);
            }
            
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              setIsSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.onended = () => setIsSpeaking(false);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => {
                  try { s.stop(); } catch(e) {}
              });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error('Session error:', e);
            setStatus('Connection Interrupted. Please Retry.');
            setIsActive(false);
          },
          onclose: () => {
            console.log('Session closed');
            setIsActive(false);
            setIsSpeaking(false);
            setStatus('Session Ended');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          systemInstruction: 'You are Panditji, a wise Vedic Sage. Speak with profound kindness, using terms like "Yajman" or "Blessed soul". Provide cosmic guidance based on Vastu, Jyotish (Astrology), and Vedic values. Keep responses warm and spiritually elevating.'
        }
      });
      
      sessionRef.current = await sessionPromise;
      
    } catch (err) {
      console.error(err);
      setStatus('Microphone Access Denied or API Error');
      setIsActive(false);
    }
  };

  const handleSendText = async () => {
      if (isLocked) {
          alert("This is a Premium feature. Please enter the Access Code in your Profile.");
          return;
      }
      if (!inputText.trim()) return;
      setIsProcessingText(true);
      
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: `Act as Panditji, a Vedic Sage. Answer this briefly and wisely: ${inputText}`
          });
          
          const text = response.text;
          if (text) {
             setTranscription(prev => prev + "\nPanditji: " + text + "\n");
          }
      } catch (e) {
          console.error(e);
      } finally {
          setIsProcessingText(false);
          setInputText('');
      }
  };

  if (isLocked) {
      return (
          <div className="flex flex-col items-center justify-center p-8 space-y-6 w-full max-w-lg mx-auto">
              <div className="w-32 h-32 rounded-full flex items-center justify-center border-4 border-stone-800 bg-black/40 text-stone-600 mb-4">
                  <i className="fas fa-lock text-5xl"></i>
              </div>
              <h3 className="text-2xl font-cinzel text-stone-400">Premium Feature</h3>
              <p className="text-center text-stone-500 text-sm px-8">
                  The AI Panditji requires profound energy. Unlock this feature by entering the Cosmic Access Code (Premium) in your profile.
              </p>
          </div>
      );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6 w-full">
      <div className={`relative w-40 h-40 flex items-center justify-center`}>
          {/* Pulsing Aura when Active */}
          {isActive && (
              <div className="absolute inset-0 bg-amber-500 rounded-full animate-ping opacity-20"></div>
          )}
          {isSpeaking && (
              <div className="absolute inset-[-20px] border-4 border-amber-400 rounded-full animate-pulse opacity-40"></div>
          )}
          
          <div className={`w-32 h-32 rounded-full flex items-center justify-center border-4 z-10 bg-[var(--card-bg)] transition-all duration-300 ${isActive ? 'border-amber-500 shadow-[0_0_30px_#f59e0b]' : 'border-stone-700'}`}>
             <i className={`fas fa-om text-5xl ${isActive ? 'text-amber-500' : 'text-stone-500'} ${isSpeaking ? 'animate-pulse' : ''}`}></i>
          </div>
      </div>
      
      <div className="text-center">
        <h3 className="text-2xl font-cinzel text-[var(--text-main)]">Divine AI Panditji {userTier === 'admin' && <span className="text-[10px] text-red-500 ml-2">(Admin Mode)</span>}</h3>
        <p className={`text-xs mt-2 italic uppercase tracking-widest ${status.includes('Error') || status.includes('Denied') ? 'text-red-400' : 'text-amber-400'}`}>
            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${isActive ? 'bg-green-500 animate-pulse' : 'bg-stone-500'}`}></span>
            {status}
        </p>
      </div>

      <div className="w-full glass-gold p-6 rounded-[2rem] min-h-[150px] overflow-y-auto max-h-[300px] border-amber-500/30">
        <p className="text-sm text-[var(--text-main)] leading-relaxed whitespace-pre-wrap font-serif">
          {transcription || "Pranam. I am Panditji. I am ready to listen to your queries about Doshas, Muhurats, or Life Path."}
        </p>
      </div>
      
      {/* TEXT INPUT FOR NON-VOICE INTERACTION */}
      <div className="w-full relative group">
          <input 
            type="text" 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Type your question if you cannot speak..."
            className="w-full bg-[var(--input-bg)] border border-[var(--glass-border)] rounded-full py-4 pl-6 pr-14 text-[var(--text-main)] placeholder-gray-500 focus:outline-none focus:border-amber-500 transition-all"
          />
          <button 
             onClick={handleSendText}
             disabled={isProcessingText}
             className="absolute right-2 top-2 w-10 h-10 bg-amber-600 rounded-full flex items-center justify-center text-white hover:bg-amber-500 transition-colors shadow-lg"
          >
             {isProcessingText ? <i className="fas fa-spinner animate-spin"></i> : <i className="fas fa-paper-plane"></i>}
          </button>
      </div>

      <div className="flex gap-4">
        <button 
            onClick={isActive ? stopSession : startSession}
            className={`px-8 py-4 rounded-full font-bold transition-all shadow-xl tracking-widest uppercase text-xs flex items-center gap-3 transform hover:scale-105 ${isActive ? 'bg-red-900/40 text-red-400 border border-red-500 hover:bg-red-900/60' : 'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:shadow-amber-500/20'}`}
        >
            <i className={`fas ${isActive ? 'fa-phone-slash' : 'fa-microphone'}`}></i>
            {isActive ? 'End Consultation' : 'Start Voice Call'}
        </button>
      </div>
    </div>
  );
};

export default AIPanditji;
