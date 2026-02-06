
import React from 'react';

interface LandingPageProps {
  onEnter: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen bg-[#0f0a05] text-white font-sans overflow-x-hidden relative">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 animate-pulse"></div>
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#1c1917] via-transparent to-[#0f0a05] opacity-80 pointer-events-none"></div>

      {/* NAV */}
      <nav className="relative z-10 flex justify-between items-center p-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <i className="fas fa-sun text-4xl text-[#d97706] animate-spin-slow"></i>
          <h1 className="text-2xl font-cinzel font-bold text-white tracking-wider">CelestialAI</h1>
        </div>
        <button 
          onClick={onEnter}
          className="bg-transparent border border-[#d97706] text-[#d97706] px-6 py-2 rounded-full font-bold hover:bg-[#d97706] hover:text-white transition-all uppercase text-xs tracking-widest"
        >
          Login
        </button>
      </nav>

      {/* HERO SECTION */}
      <header className="relative z-10 flex flex-col items-center justify-center text-center px-4 pt-20 pb-32">
        <div className="inline-block mb-4 px-4 py-1 rounded-full bg-[#d97706]/20 border border-[#d97706]/50 text-[#d97706] text-xs font-bold uppercase tracking-widest">
          The Future of Vedic Wisdom
        </div>
        <h1 className="text-5xl md:text-7xl font-cinzel font-bold text-white mb-6 leading-tight">
          Unlock Your <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-red-500">Cosmic Destiny</span>
        </h1>
        <p className="text-stone-400 text-lg md:text-xl max-w-2xl mb-10 font-serif italic">
          Experience the convergence of ancient Vedic astrology and advanced Artificial Intelligence. 
          Daily predictions, personalized remedies, and a divine AI Panditji at your fingertips.
        </p>
        <button 
          onClick={onEnter}
          className="group relative px-8 py-4 bg-[#d97706] text-white font-bold rounded-full text-lg shadow-[0_0_30px_rgba(217,119,6,0.4)] hover:shadow-[0_0_50px_rgba(217,119,6,0.6)] transition-all overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-3">
            Enter Cosmic Portal <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-amber-600 to-red-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </button>
      </header>

      {/* FEATURES SCROLL */}
      <section className="relative z-10 bg-[#1c1917]/50 backdrop-blur-md border-y border-[#d97706]/20 py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-[#d97706]/50 transition-colors group">
            <div className="w-14 h-14 bg-[#d97706]/20 rounded-2xl flex items-center justify-center text-[#d97706] text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i className="fas fa-star"></i>
            </div>
            <h3 className="text-xl font-cinzel font-bold text-white mb-3">Daily Precision</h3>
            <p className="text-stone-400 text-sm leading-relaxed">
              Start every day with precise planetary alignments, lucky colors, and specific cautions tailored to your Rashi.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-[#d97706]/50 transition-colors group">
            <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center text-purple-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i className="fas fa-user-astronaut"></i>
            </div>
            <h3 className="text-xl font-cinzel font-bold text-white mb-3">AI Panditji</h3>
            <p className="text-stone-400 text-sm leading-relaxed">
              Talk to our advanced AI Panditji in real-time. Ask questions about your career, health, or relationships via voice or text.
            </p>
          </div>

          <div className="p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-[#d97706]/50 transition-colors group">
            <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i className="fas fa-leaf"></i>
            </div>
            <h3 className="text-xl font-cinzel font-bold text-white mb-3">Vedic Remedies</h3>
            <p className="text-stone-400 text-sm leading-relaxed">
              Discover powerful ancient remedies, gemstones, and mantras to alleviate doshas and enhance your life path.
            </p>
          </div>

        </div>
      </section>

      {/* TRUST/FOOTER */}
      <footer className="relative z-10 py-12 text-center">
        <div className="flex justify-center items-center gap-8 text-stone-600 text-2xl mb-8 opacity-50">
           <i className="fas fa-om"></i>
           <i className="fas fa-infinity"></i>
           <i className="fas fa-moon"></i>
           <i className="fas fa-sun"></i>
        </div>
        <p className="text-stone-500 text-xs uppercase tracking-widest">
          © 2025 CelestialAI. Empowered by Google Gemini.
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
