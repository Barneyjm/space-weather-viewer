import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, RefreshCw, ChevronDown, Zap, Globe, Sun, Wind, AlertCircle, Gauge, Waves, Grid3X3, Maximize2, Clock } from 'lucide-react';

// Image cache to avoid re-fetching frames we already have
const imageCache = new Map();

// Cache directory listings to avoid repeated fetches
const directoryCache = new Map();
const DIRECTORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Check if we're deployed (use API routes) or local (direct NOAA requests)
const USE_API = import.meta.env.PROD;

const ANIMATION_SOURCES = {
  density: {
    name: 'Plasma Density',
    shortName: 'Density',
    description: 'Geospace Magnetosphere - Particle Density',
    explainer: 'Shows the concentration of charged particles (ions and electrons) in near-Earth space. Higher density (brighter colors) indicates more particles from the solar wind interacting with Earth\'s magnetic field. Density increases during solar storms and can affect satellite operations.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/latest.png',
    icon: Globe,
    color: 'from-blue-500 to-cyan-500',
    borderColor: 'border-blue-500/50'
  },
  velocity: {
    name: 'Plasma Velocity',
    shortName: 'Velocity',
    description: 'Geospace Magnetosphere - Solar Wind Velocity',
    explainer: 'Displays the speed and direction of solar wind plasma flowing around Earth. Typical solar wind moves at 400 km/s, but can exceed 800 km/s during storms. Faster solar wind compresses Earth\'s magnetosphere and can trigger geomagnetic storms and auroras.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/latest.png',
    icon: Wind,
    color: 'from-emerald-500 to-teal-500',
    borderColor: 'border-emerald-500/50'
  },
  pressure: {
    name: 'Plasma Pressure',
    shortName: 'Pressure',
    description: 'Geospace Magnetosphere - Dynamic Pressure',
    explainer: 'Shows the force exerted by solar wind on Earth\'s magnetic field, combining density and velocity effects. High pressure (bright colors) pushes the magnetosphere closer to Earth, potentially exposing satellites to harmful radiation and intensifying aurora activity.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/latest.png',
    icon: Gauge,
    color: 'from-orange-500 to-red-500',
    borderColor: 'border-orange-500/50'
  },
  ovation_north: {
    name: 'Aurora North',
    shortName: 'Aurora N',
    description: 'OVATION Aurora Forecast - Northern Hemisphere',
    explainer: 'Predicts where the Northern Lights (Aurora Borealis) will be visible. Brighter areas indicate higher probability of aurora activity. The aurora oval expands southward during geomagnetic storms, making the lights visible from lower latitudes.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg',
    icon: Waves,
    color: 'from-purple-500 to-pink-500',
    borderColor: 'border-purple-500/50'
  },
  ovation_south: {
    name: 'Aurora South',
    shortName: 'Aurora S',
    description: 'OVATION Aurora Forecast - Southern Hemisphere',
    explainer: 'Predicts where the Southern Lights (Aurora Australis) will be visible. The southern aurora mirrors northern activity but is often harder to observe due to less populated landmass at high southern latitudes. Best viewed from Antarctica, southern New Zealand, and Tasmania.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/latest.jpg',
    icon: Waves,
    color: 'from-violet-500 to-fuchsia-500',
    borderColor: 'border-violet-500/50'
  }
};

// Parse timestamp from geospace filename
function parseGeospaceTimestamp(filename) {
  const match = filename.match(/_(\d{8}T\d{4})\.png$/);
  if (!match) return null;

  const ts = match[1];
  const year = parseInt(ts.slice(0, 4));
  const month = parseInt(ts.slice(4, 6)) - 1;
  const day = parseInt(ts.slice(6, 8));
  const hour = parseInt(ts.slice(9, 11));
  const minute = parseInt(ts.slice(11, 13));

  return new Date(Date.UTC(year, month, day, hour, minute));
}

// Parse timestamp from aurora filename
function parseAuroraTimestamp(filename) {
  const match = filename.match(/aurora_[NS]_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.jpg$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)));
}

// Get user's timezone abbreviation
function getLocalTimezoneAbbr() {
  return new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop();
}

// Format timestamp for display
function formatTimestamp(date, useLocalTime = false) {
  if (useLocalTime) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) + ' ' + getLocalTimezoneAbbr();
  }
  return date.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }) + ' UTC';
}

// Fetch frames using API (production) or direct NOAA requests (development)
async function fetchFrameList(sourceKey, hoursBack = 6) {
  const sourceConfig = ANIMATION_SOURCES[sourceKey];
  if (!sourceConfig) return [];

  try {
    // Use cached API in production for better performance
    if (USE_API) {
      const cacheKey = `${sourceKey}-${hoursBack}`;
      const cached = directoryCache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < DIRECTORY_CACHE_TTL) {
        return cached.frames;
      }

      const response = await fetch(`/api/frames/${sourceKey}?hours=${hoursBack}`);
      if (!response.ok) return [];

      const data = await response.json();
      const frames = data.frames.map(f => ({
        url: f.url,
        time: new Date(f.timestamp),
        timestamp: f.timestamp,
        label: formatTimestamp(new Date(f.timestamp))
      }));

      directoryCache.set(cacheKey, { frames, timestamp: Date.now() });
      return frames;
    }

    // Direct NOAA requests in development
    const baseUrl = sourceConfig.baseUrl;
    const isGeospace = baseUrl.includes('geospace');
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const cacheKey = baseUrl;
    const cached = directoryCache.get(cacheKey);
    let html;

    if (cached && Date.now() - cached.timestamp < DIRECTORY_CACHE_TTL) {
      html = cached.html;
    } else {
      const response = await fetch(baseUrl);
      if (!response.ok) return [];
      html = await response.text();
      directoryCache.set(cacheKey, { html, timestamp: Date.now() });
    }

    const linkRegex = /<a\s+href="([^"]+\.(png|jpg))"/gi;
    const frames = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const filename = match[1];
      if (filename.includes('latest')) continue;

      let frameTime;
      if (isGeospace) {
        frameTime = parseGeospaceTimestamp(filename);
      } else {
        frameTime = parseAuroraTimestamp(filename);
      }

      if (frameTime && frameTime >= cutoffTime) {
        frames.push({
          url: `${baseUrl}${filename}`,
          time: frameTime,
          timestamp: frameTime.getTime(),
          label: formatTimestamp(frameTime)
        });
      }
    }

    frames.sort((a, b) => a.time - b.time);
    return frames;
  } catch (error) {
    console.error('Failed to fetch frame list:', error);
    return [];
  }
}

// Find closest frame to a given timestamp
function findClosestFrame(frames, targetTimestamp, maxDiffMs = 10 * 60 * 1000) {
  if (!frames || frames.length === 0) return null;

  let closest = null;
  let minDiff = Infinity;

  for (const frame of frames) {
    const diff = Math.abs(frame.timestamp - targetTimestamp);
    if (diff < minDiff) {
      minDiff = diff;
      closest = frame;
    }
  }

  // Only return if within maxDiff (default 10 minutes)
  return minDiff <= maxDiffMs ? closest : null;
}

// Preload a single image with caching
async function preloadImage(url, timeout = 5000) {
  if (imageCache.has(url)) return true;

  return new Promise((resolve) => {
    const img = new Image();
    const timeoutId = setTimeout(() => resolve(false), timeout);

    img.onload = () => {
      clearTimeout(timeoutId);
      imageCache.set(url, true);
      resolve(true);
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      resolve(false);
    };
    img.src = url;
  });
}

// Preload images in batches
async function preloadImagesInBatches(urls, onProgress, batchSize = 5, batchDelay = 100) {
  let loaded = 0;
  const results = [];

  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(url => preloadImage(url)));
    results.push(...batchResults);
    loaded += batch.length;
    onProgress(loaded, urls.length);

    if (i + batchSize < urls.length) {
      await new Promise(r => setTimeout(r, batchDelay));
    }
  }

  return results;
}

export default function SpaceWeatherViewer() {
  const [multiView, setMultiView] = useState(false);
  const [useLocalTime, setUseLocalTime] = useState(true); // Default to local time
  const [selectedSource, setSelectedSource] = useState('density');
  const [loadedFrames, setLoadedFrames] = useState([]);
  const [allSourceFrames, setAllSourceFrames] = useState({});
  const [unifiedTimeline, setUnifiedTimeline] = useState([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoursBack, setHoursBack] = useState(6);
  const [useLatestOnly, setUseLatestOnly] = useState(false);
  const [latestImageUrl, setLatestImageUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const intervalRef = useRef(null);

  // Load frames for single-view mode
  const loadSingleSource = useCallback(async (source) => {
    setLoading(true);
    setLoadProgress(0);
    setLoadingStatus('Checking connection...');
    setLoadedFrames([]);
    setCurrentFrame(0);
    setIsPlaying(false);
    setErrorMsg(null);
    setLatestImageUrl(null);

    const sourceConfig = ANIMATION_SOURCES[source];

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
    setLoadingStatus('Fetching frame list...');
    setLoadProgress(10);

    const frames = await fetchFrameList(source, hoursBack);
    setLoadProgress(30);

    if (frames.length === 0) {
      setUseLatestOnly(true);
      setLoadedFrames([]);
      setLoading(false);
      return;
    }

    setLoadingStatus(`Loading ${frames.length} frames...`);
    const urls = frames.map(f => f.url);

    await preloadImagesInBatches(urls, (loaded, total) => {
      setLoadProgress(30 + Math.round((loaded / total) * 70));
    });

    const validFrames = frames.filter(f => imageCache.has(f.url));

    if (validFrames.length < 3) {
      setUseLatestOnly(true);
      setLoadedFrames([]);
    } else {
      setUseLatestOnly(false);
      setLoadedFrames(validFrames);
      setIsPlaying(true);
    }

    setLoading(false);
  }, [hoursBack]);

  // Load frames for multi-view mode
  const loadAllSources = useCallback(async () => {
    setLoading(true);
    setLoadProgress(0);
    setLoadingStatus('Fetching all data sources...');
    setAllSourceFrames({});
    setUnifiedTimeline([]);
    setCurrentFrame(0);
    setIsPlaying(false);
    setErrorMsg(null);

    const sourceKeys = Object.keys(ANIMATION_SOURCES);
    const allFrames = {};
    const allTimestamps = new Set();

    // Fetch all frame lists
    for (let i = 0; i < sourceKeys.length; i++) {
      const key = sourceKeys[i];
      const config = ANIMATION_SOURCES[key];
      setLoadingStatus(`Fetching ${config.shortName}...`);
      setLoadProgress(Math.round((i / sourceKeys.length) * 30));

      const frames = await fetchFrameList(key, hoursBack);
      allFrames[key] = frames;

      // Collect all timestamps (use geospace as primary timeline since they're more consistent)
      if (key.startsWith('density') || key.startsWith('velocity') || key.startsWith('pressure')) {
        frames.forEach(f => allTimestamps.add(f.timestamp));
      }
    }

    // If no geospace frames, use aurora timestamps
    if (allTimestamps.size === 0) {
      Object.values(allFrames).forEach(frames => {
        frames.forEach(f => allTimestamps.add(f.timestamp));
      });
    }

    if (allTimestamps.size === 0) {
      setErrorMsg('Could not load any frames from NOAA.');
      setLoading(false);
      return;
    }

    // Sort timestamps to create unified timeline
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

    // Build unified timeline with frames from each source
    setLoadingStatus('Building timeline...');
    setLoadProgress(35);

    const timeline = sortedTimestamps.map(ts => ({
      timestamp: ts,
      label: formatTimestamp(new Date(ts)),
      frames: {}
    }));

    // For each timestamp, find closest frame from each source
    for (const key of sourceKeys) {
      const frames = allFrames[key];
      for (const timepoint of timeline) {
        const closest = findClosestFrame(frames, timepoint.timestamp);
        if (closest) {
          timepoint.frames[key] = closest;
        }
      }
    }

    // Filter timeline to only include points where we have at least 2 sources
    const validTimeline = timeline.filter(t => Object.keys(t.frames).length >= 2);

    if (validTimeline.length < 3) {
      setErrorMsg('Not enough synchronized frames available.');
      setLoading(false);
      return;
    }

    // Preload all images
    setLoadingStatus('Preloading images...');
    const allUrls = [];
    validTimeline.forEach(t => {
      Object.values(t.frames).forEach(f => {
        if (!imageCache.has(f.url)) {
          allUrls.push(f.url);
        }
      });
    });

    if (allUrls.length > 0) {
      await preloadImagesInBatches(allUrls, (loaded, total) => {
        setLoadProgress(35 + Math.round((loaded / total) * 65));
        setLoadingStatus(`Loading images... ${loaded}/${total}`);
      });
    }

    setAllSourceFrames(allFrames);
    setUnifiedTimeline(validTimeline);
    setIsPlaying(true);
    setLoading(false);
  }, [hoursBack]);

  // Effect to load based on mode
  useEffect(() => {
    if (multiView) {
      loadAllSources();
    } else {
      loadSingleSource(selectedSource);
    }
  }, [multiView, selectedSource, loadSingleSource, loadAllSources, hoursBack]);

  // Animation loop
  useEffect(() => {
    const frameCount = multiView ? unifiedTimeline.length : loadedFrames.length;

    if (isPlaying && frameCount > 0 && !useLatestOnly) {
      intervalRef.current = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % frameCount);
      }, speed);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, loadedFrames.length, unifiedTimeline.length, speed, useLatestOnly, multiView]);

  // Auto-refresh for latest-only mode
  useEffect(() => {
    if (useLatestOnly && latestImageUrl && !multiView) {
      const refreshInterval = setInterval(() => {
        setLatestImageUrl(ANIMATION_SOURCES[selectedSource].latestUrl + '?t=' + Date.now());
      }, 60000);
      return () => clearInterval(refreshInterval);
    }
  }, [useLatestOnly, latestImageUrl, selectedSource, multiView]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const frameCount = multiView ? unifiedTimeline.length : loadedFrames.length;

  const prevFrame = () => {
    setIsPlaying(false);
    setCurrentFrame(prev => (prev - 1 + frameCount) % frameCount);
  };
  const nextFrame = () => {
    setIsPlaying(false);
    setCurrentFrame(prev => (prev + 1) % frameCount);
  };
  const refresh = () => {
    if (multiView) {
      loadAllSources();
    } else {
      loadSingleSource(selectedSource);
    }
  };

  const SourceIcon = ANIMATION_SOURCES[selectedSource].icon;
  const currentFrameData = multiView ? unifiedTimeline[currentFrame] : loadedFrames[currentFrame];

  // Format timestamp for current frame based on timezone preference
  const displayTimestamp = (frameData) => {
    if (!frameData) return '';
    const date = frameData.time || new Date(frameData.timestamp);
    return formatTimestamp(date, useLocalTime);
  };

  // Render single viewer panel
  const renderSingleViewer = (sourceKey, frame, showLabel = true) => {
    const config = ANIMATION_SOURCES[sourceKey];
    const Icon = config.icon;

    return (
      <div className={`relative bg-black rounded-lg overflow-hidden border-2 ${config.borderColor}`}>
        {showLabel && (
          <div className={`absolute top-0 left-0 right-0 bg-gradient-to-r ${config.color} px-2 py-1 flex items-center gap-1.5 z-10`}>
            <Icon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{config.shortName}</span>
          </div>
        )}
        {frame ? (
          <img
            src={frame.url}
            alt={`${config.name}`}
            className="w-full h-auto object-contain"
          />
        ) : (
          <div className="aspect-video flex items-center justify-center text-slate-500 text-xs">
            No data
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-4">
      <div className={multiView ? "max-w-7xl mx-auto" : "max-w-4xl mx-auto"}>
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

        {/* View Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMultiView(false)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              !multiView
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Maximize2 className="w-4 h-4" />
            Single View
          </button>
          <button
            onClick={() => setMultiView(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              multiView
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
            Multi View (Synced)
          </button>
        </div>

        {/* Source Selector - only show in single view */}
        {!multiView && (
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
        )}

        {/* Time Range & Timezone Selector */}
        <div className="flex gap-2 mb-4">
          <div className="flex gap-2 flex-1">
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
          <button
            onClick={() => setUseLocalTime(!useLocalTime)}
            className="flex items-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-all"
            title={`Switch to ${useLocalTime ? 'UTC' : 'local'} time`}
          >
            <Clock className="w-4 h-4" />
            {useLocalTime ? getLocalTimezoneAbbr() : 'UTC'}
          </button>
        </div>

        {/* Main Viewer */}
        <div className="bg-slate-800/50 rounded-2xl border border-white/10 overflow-hidden backdrop-blur">
          {loading ? (
            <div className="flex flex-col items-center gap-4 p-8" style={{ minHeight: '400px' }}>
              <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin" />
              <p className="text-slate-400">{loadingStatus || 'Loading space weather data...'}</p>
              <div className="w-48 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-500">{loadProgress}%</p>
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center gap-4 p-8 text-center" style={{ minHeight: '400px' }}>
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
          ) : multiView ? (
            /* Multi-View Grid */
            <div className="p-4">
              {/* Current timestamp display */}
              {currentFrameData && (
                <div className="text-center mb-4 bg-black/40 rounded-lg py-2">
                  <span className="text-lg font-mono text-cyan-400">{displayTimestamp(currentFrameData)}</span>
                </div>
              )}

              {/* 2x3 Grid of viewers */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.keys(ANIMATION_SOURCES).map(key => (
                  <div key={key}>
                    {renderSingleViewer(
                      key,
                      currentFrameData?.frames?.[key],
                      true
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : useLatestOnly && latestImageUrl ? (
            /* Single View - Latest Only */
            <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '400px' }}>
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
            </div>
          ) : currentFrameData ? (
            /* Single View - Animation */
            <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '400px' }}>
              <div className="relative w-full">
                <img
                  src={currentFrameData.url}
                  alt={`${ANIMATION_SOURCES[selectedSource].name} - ${displayTimestamp(currentFrameData)}`}
                  className="w-full h-auto object-contain"
                />
                <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-center">
                  {displayTimestamp(currentFrameData)}
                </div>
              </div>
            </div>
          ) : latestImageUrl ? (
            <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '400px' }}>
              <img
                src={latestImageUrl}
                alt={`${ANIMATION_SOURCES[selectedSource].name} - Latest`}
                className="w-full h-auto object-contain"
              />
            </div>
          ) : null}

          {/* Controls */}
          {!loading && !errorMsg && frameCount > 0 && !useLatestOnly && (
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
                  max={frameCount - 1}
                  value={currentFrame}
                  onChange={(e) => {
                    setCurrentFrame(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between mt-2 text-xs text-slate-400">
                  <span>Frame {currentFrame + 1} of {frameCount}</span>
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
          {!loading && !errorMsg && useLatestOnly && !multiView && (
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
          {multiView ? (
            <div className="text-xs text-slate-400 space-y-2">
              <p className="text-slate-300 font-medium mb-2">About These Forecasts</p>
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(ANIMATION_SOURCES).map(([key, source]) => {
                  const Icon = source.icon;
                  return (
                    <div key={key} className={`p-2 rounded-lg bg-gradient-to-r ${source.color} bg-opacity-10 border border-white/5`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5" />
                        <span className="text-slate-300 font-medium">{source.name}</span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed">{source.explainer}</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-slate-500">Data from NOAA's DSCOVR satellite and OVATION model, updated every few minutes.</p>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              {(() => {
                const Icon = ANIMATION_SOURCES[selectedSource].icon;
                return <Icon className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />;
              })()}
              <div className="text-xs text-slate-400">
                <p className="text-slate-300 font-medium mb-1">{ANIMATION_SOURCES[selectedSource].name}</p>
                <p className="leading-relaxed">{ANIMATION_SOURCES[selectedSource].explainer}</p>
                <p className="mt-2 text-slate-500">Data from NOAA Space Weather Prediction Center, updated every few minutes.</p>
              </div>
            </div>
          )}
        </div>

        <footer className="mt-4 text-center text-xs text-slate-500">
          <span>Data: <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors">NOAA SWPC</a></span>
          <span className="mx-2">•</span>
          <a href="https://github.com/Barneyjm/space-weather-viewer" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors">GitHub</a>
        </footer>
      </div>
    </div>
  );
}
