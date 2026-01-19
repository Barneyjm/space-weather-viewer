import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, RefreshCw, ChevronDown, Zap, Globe, Sun, Wind, AlertCircle, Gauge, Waves } from 'lucide-react';

const ANIMATION_SOURCES = {
  density: {
    name: 'Plasma Density',
    description: 'Geospace Magnetosphere - Particle Density',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/latest.png',
    icon: Globe,
    color: 'from-blue-500 to-cyan-500'
  },
  velocity: {
    name: 'Plasma Velocity',
    description: 'Geospace Magnetosphere - Solar Wind Velocity',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/latest.png',
    icon: Wind,
    color: 'from-emerald-500 to-teal-500'
  },
  pressure: {
    name: 'Plasma Pressure',
    description: 'Geospace Magnetosphere - Dynamic Pressure',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/latest.png',
    icon: Gauge,
    color: 'from-orange-500 to-red-500'
  },
  ovation_north: {
    name: 'Aurora North',
    description: 'OVATION Aurora Forecast - Northern Hemisphere',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg',
    icon: Waves,
    color: 'from-purple-500 to-pink-500'
  },
  ovation_south: {
    name: 'Aurora South',
    description: 'OVATION Aurora Forecast - Southern Hemisphere',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/latest.jpg',
    icon: Waves,
    color: 'from-violet-500 to-fuchsia-500'
  }
};

// Generate potential frame URLs for geospace (they use timestamps)
function generateGeospaceUrls(baseUrl, hoursBack = 6, intervalMinutes = 15) {
  const frames = [];
  const now = new Date();
  const isGeospace = baseUrl.includes('geospace');
  const isOvation = baseUrl.includes('ovation');
  const ext = isGeospace ? 'png' : 'jpg';
  
  const totalFrames = Math.floor((hoursBack * 60) / intervalMinutes);
  
  for (let i = totalFrames; i >= 0; i--) {
    const frameTime = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
    const minutes = Math.floor(frameTime.getUTCMinutes() / intervalMinutes) * intervalMinutes;
    frameTime.setUTCMinutes(minutes, 0, 0);
    
    const year = frameTime.getUTCFullYear();
    const month = String(frameTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(frameTime.getUTCDate()).padStart(2, '0');
    const hour = String(frameTime.getUTCHours()).padStart(2, '0');
    const min = String(frameTime.getUTCMinutes()).padStart(2, '0');
    
    let filename;
    if (isGeospace) {
      // Geospace format: geospace-density-YYYYMMDD_HHMM.png (guessing)
      // or just: YYYYMMDD_HHMM.png
      // Let's try multiple patterns
      filename = `${year}${month}${day}_${hour}${min}.${ext}`;
    } else if (isOvation) {
      const hemisphere = baseUrl.includes('north') ? 'N' : 'S';
      filename = `aurora_${hemisphere}_${year}${month}${day}_${hour}${min}.${ext}`;
    }
    
    frames.push({
      url: `${baseUrl}${filename}`,
      time: frameTime,
      label: frameTime.toLocaleString()
    });
  }
  
  return frames;
}

export default function SpaceWeatherViewer() {
  const [selectedSource, setSelectedSource] = useState('density');
  const [loadedFrames, setLoadedFrames] = useState([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoursBack, setHoursBack] = useState(6);
  const [useLatestOnly, setUseLatestOnly] = useState(false);
  const [latestImageUrl, setLatestImageUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const intervalRef = useRef(null);

  const loadFrames = useCallback(async (source) => {
    setLoading(true);
    setLoadProgress(0);
    setLoadedFrames([]);
    setCurrentFrame(0);
    setIsPlaying(false);
    setErrorMsg(null);
    setLatestImageUrl(null);
    
    const sourceConfig = ANIMATION_SOURCES[source];
    
    // First, verify the latest image works
    const latestWorks = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = sourceConfig.latestUrl + '?t=' + Date.now();
    });
    
    if (!latestWorks) {
      setErrorMsg('Could not load images from NOAA. The service may be temporarily unavailable.');
      setLoading(false);
      return;
    }
    
    setLatestImageUrl(sourceConfig.latestUrl);
    
    // Try to load timestamped frames
    const generatedFrames = generateGeospaceUrls(sourceConfig.baseUrl, hoursBack, 15);
    const validFrames = [];
    let loaded = 0;
    
    const loadPromises = generatedFrames.map((frame, index) => {
      return new Promise((resolve) => {
        const img = new Image();
        const timeout = setTimeout(() => {
          loaded++;
          setLoadProgress(Math.round((loaded / generatedFrames.length) * 100));
          resolve(false);
        }, 3000);
        
        img.onload = () => {
          clearTimeout(timeout);
          validFrames[index] = frame;
          loaded++;
          setLoadProgress(Math.round((loaded / generatedFrames.length) * 100));
          resolve(true);
        };
        img.onerror = () => {
          clearTimeout(timeout);
          loaded++;
          setLoadProgress(Math.round((loaded / generatedFrames.length) * 100));
          resolve(false);
        };
        img.src = frame.url;
      });
    });
    
    await Promise.all(loadPromises);
    
    const successfulFrames = validFrames.filter(f => f !== undefined);
    
    if (successfulFrames.length < 3) {
      // Fall back to latest-only mode with auto-refresh
      setUseLatestOnly(true);
      setLoadedFrames([]);
    } else {
      setUseLatestOnly(false);
      setLoadedFrames(successfulFrames);
      setIsPlaying(true);
    }
    
    setLoading(false);
  }, [hoursBack]);

  useEffect(() => {
    loadFrames(selectedSource);
  }, [selectedSource, loadFrames]);

  // Animation loop
  useEffect(() => {
    if (isPlaying && loadedFrames.length > 0 && !useLatestOnly) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % loadedFrames.length);
      }, speed);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, loadedFrames.length, speed, useLatestOnly]);

  // Auto-refresh for latest-only mode
  useEffect(() => {
    if (useLatestOnly && latestImageUrl) {
      const refreshInterval = setInterval(() => {
        setLatestImageUrl(ANIMATION_SOURCES[selectedSource].latestUrl + '?t=' + Date.now());
      }, 60000); // Refresh every minute
      return () => clearInterval(refreshInterval);
    }
  }, [useLatestOnly, latestImageUrl, selectedSource]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const prevFrame = () => {
    setIsPlaying(false);
    setCurrentFrame(prev => (prev - 1 + loadedFrames.length) % loadedFrames.length);
  };
  const nextFrame = () => {
    setIsPlaying(false);
    setCurrentFrame(prev => (prev + 1) % loadedFrames.length);
  };
  const refresh = () => loadFrames(selectedSource);

  const SourceIcon = ANIMATION_SOURCES[selectedSource].icon;
  const currentFrameData = loadedFrames[currentFrame];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Sun className="w-8 h-8 text-yellow-400 animate-pulse" />
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Space Weather Viewer
            </h1>
            <Globe className="w-8 h-8 text-cyan-400" />
          </div>
          <p className="text-slate-400 text-sm">NOAA Space Weather Prediction Center • Geospace Model</p>
        </header>

        {/* Source Selector */}
        <div className="relative mb-4">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r ${ANIMATION_SOURCES[selectedSource].color} bg-opacity-20 border border-white/10 hover:border-white/20 transition-all`}
          >
            <div className="flex items-center gap-3">
              <SourceIcon className="w-6 h-6" />
              <div className="text-left">
                <div className="font-semibold">{ANIMATION_SOURCES[selectedSource].name}</div>
                <div className="text-xs text-white/70">{ANIMATION_SOURCES[selectedSource].description}</div>
              </div>
            </div>
            <ChevronDown className={`w-5 h-5 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </button>
          
          {showDropdown && (
            <div className="absolute z-10 w-full mt-2 rounded-xl bg-slate-800 border border-white/10 overflow-hidden shadow-xl max-h-80 overflow-y-auto">
              {Object.entries(ANIMATION_SOURCES).map(([key, source]) => {
                const Icon = source.icon;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedSource(key);
                      setShowDropdown(false);
                    }}
                    className={`w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors ${key === selectedSource ? 'bg-white/10' : ''}`}
                  >
                    <Icon className="w-5 h-5" />
                    <div className="text-left">
                      <div className="font-medium">{source.name}</div>
                      <div className="text-xs text-slate-400">{source.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Time Range Selector */}
        <div className="flex gap-2 mb-4">
          {[3, 6, 12, 24].map(hours => (
            <button
              key={hours}
              onClick={() => setHoursBack(hours)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                hoursBack === hours 
                  ? 'bg-cyan-600 text-white' 
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {hours}h
            </button>
          ))}
        </div>

        {/* Main Viewer */}
        <div className="bg-slate-800/50 rounded-2xl border border-white/10 overflow-hidden backdrop-blur">
          <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '400px' }}>
            {loading ? (
              <div className="flex flex-col items-center gap-4 p-8">
                <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin" />
                <p className="text-slate-400">Loading space weather data...</p>
                <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
                    style={{ width: `${loadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500">{loadProgress}%</p>
              </div>
            ) : errorMsg ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center">
                <AlertCircle className="w-12 h-12 text-yellow-500" />
                <p className="text-slate-300">{errorMsg}</p>
                <button
                  onClick={refresh}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </button>
              </div>
            ) : useLatestOnly && latestImageUrl ? (
              <div className="relative w-full">
                <img
                  src={latestImageUrl}
                  alt={`${ANIMATION_SOURCES[selectedSource].name} - Latest`}
                  className="w-full h-auto object-contain"
                />
                <div className="absolute top-2 right-2 bg-green-600/80 backdrop-blur rounded-full px-3 py-1 text-xs flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                  Live (updates every 60s)
                </div>
              </div>
            ) : currentFrameData ? (
              <div className="relative w-full">
                <img
                  src={currentFrameData.url}
                  alt={`${ANIMATION_SOURCES[selectedSource].name} - ${currentFrameData.label}`}
                  className="w-full h-auto object-contain"
                />
                <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-center">
                  {currentFrameData.label} UTC
                </div>
              </div>
            ) : latestImageUrl ? (
              <div className="relative w-full">
                <img
                  src={latestImageUrl}
                  alt={`${ANIMATION_SOURCES[selectedSource].name} - Latest`}
                  className="w-full h-auto object-contain"
                />
              </div>
            ) : null}
          </div>

          {/* Controls - only show for animation mode */}
          {!loading && !errorMsg && !useLatestOnly && loadedFrames.length > 0 && (
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={prevFrame}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    title="Previous frame"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 transition-all shadow-lg"
                  >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={nextFrame}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    title="Next frame"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                  <button
                    onClick={refresh}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors ml-2"
                    title="Refresh data"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">Speed:</span>
                  <select
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="bg-slate-700 border border-white/10 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value={600}>0.5x</option>
                    <option value={300}>1x</option>
                    <option value={150}>2x</option>
                    <option value={75}>4x</option>
                  </select>
                </div>
              </div>

              <div className="relative">
                <input
                  type="range"
                  min={0}
                  max={loadedFrames.length - 1}
                  value={currentFrame}
                  onChange={(e) => {
                    setCurrentFrame(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between mt-2 text-xs text-slate-400">
                  <span>Frame {currentFrame + 1} of {loadedFrames.length}</span>
                  <span className="flex items-center gap-1">
                    {isPlaying ? (
                      <>
                        <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        Playing
                      </>
                    ) : 'Paused'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Live mode info */}
          {!loading && !errorMsg && useLatestOnly && (
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  Showing latest image (animation frames unavailable)
                </p>
                <button
                  onClick={refresh}
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-sm"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="mt-4 p-4 bg-slate-800/30 rounded-xl border border-white/5">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-slate-400">
              <p className="mb-1"><strong className="text-slate-300">Geospace Model:</strong> Simulates Earth's magnetosphere using real-time solar wind data from the DSCOVR satellite.</p>
              <p><strong className="text-slate-300">Parameters:</strong> Density shows particle concentration, Velocity shows plasma flow speed, Pressure shows dynamic force.</p>
            </div>
          </div>
        </div>

        <footer className="mt-4 text-center text-xs text-slate-500">
          Data: NOAA SWPC • services.swpc.noaa.gov/images/animations/geospace/
        </footer>
      </div>
    </div>
  );
}
