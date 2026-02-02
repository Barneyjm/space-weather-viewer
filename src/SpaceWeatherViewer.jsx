import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, RefreshCw, ChevronDown, ChevronUp, Zap, Globe, Sun, Wind, AlertCircle, Gauge, Waves, Grid3X3, Maximize2, Clock, Radio, Orbit, Activity, Eye, Compass, Check, Download } from 'lucide-react';
import { useVideoExport } from './hooks/useVideoExport';
import { ExportModal } from './components/ExportModal';
import HistoricalEventPlayer from './components/HistoricalEventPlayer';

// Image cache to avoid re-fetching frames we already have
const imageCache = new Map();

// Cache directory listings to avoid repeated fetches
const directoryCache = new Map();
const DIRECTORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Check if we're deployed (use API routes) or local (direct NOAA requests)
const USE_API = import.meta.env.PROD;

// Source categories for organization
const SOURCE_CATEGORIES = {
  solar: { name: 'Solar Imagery', icon: Sun },
  solarwind: { name: 'Solar Wind', icon: Wind },
  magnetosphere: { name: 'Magnetosphere', icon: Globe },
  ionosphere: { name: 'Ionosphere', icon: Radio },
  aurora: { name: 'Aurora', icon: Waves }
};

const ANIMATION_SOURCES = {
  // === SOLAR IMAGERY ===
  suvi_304: {
    name: 'SUVI 304nm',
    shortName: 'SUVI 304',
    category: 'solar',
    description: 'Solar chromosphere - prominences and flares',
    explainer: 'Shows the Sun\'s chromosphere at 304 Angstroms (He II). This dramatic orange view reveals solar prominences, flares, and coronal rain. Best for seeing material erupting from the Sun\'s surface.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/304/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/304/latest.png',
    pattern: 'suvi',
    icon: Sun,
    color: 'from-orange-500 to-red-500',
    borderColor: 'border-orange-500/50'
  },
  suvi_195: {
    name: 'SUVI 195nm',
    shortName: 'SUVI 195',
    category: 'solar',
    description: 'Solar corona - million degree plasma',
    explainer: 'Shows the Sun\'s corona at 195 Angstroms (Fe XII). Reveals the million-degree outer atmosphere, coronal holes (dark areas), and active regions. Coronal holes are sources of fast solar wind.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/195/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/195/latest.png',
    pattern: 'suvi',
    icon: Sun,
    color: 'from-green-500 to-emerald-500',
    borderColor: 'border-green-500/50'
  },
  suvi_171: {
    name: 'SUVI 171nm',
    shortName: 'SUVI 171',
    category: 'solar',
    description: 'Quiet corona and coronal loops',
    explainer: 'Shows the Sun at 171 Angstroms (Fe IX). Highlights the quiet corona and magnetic loop structures connecting active regions. Useful for tracking the overall structure of the Sun\'s magnetic field.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/171/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/171/latest.png',
    pattern: 'suvi',
    icon: Sun,
    color: 'from-yellow-500 to-amber-500',
    borderColor: 'border-yellow-500/50'
  },
  suvi_131: {
    name: 'SUVI 131nm',
    shortName: 'SUVI 131',
    category: 'solar',
    description: 'Hottest plasma - flare detection',
    explainer: 'Shows extreme temperatures at 131 Angstroms (Fe XX/XXIII). Only the hottest plasma (10+ million degrees) glows at this wavelength, making it ideal for detecting and tracking solar flares.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/131/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/131/latest.png',
    pattern: 'suvi',
    icon: Sun,
    color: 'from-teal-500 to-cyan-500',
    borderColor: 'border-teal-500/50'
  },
  lasco_c3: {
    name: 'LASCO C3',
    shortName: 'LASCO C3',
    category: 'solar',
    description: 'Wide-field coronagraph - CME tracking',
    explainer: 'Coronagraph that blocks the Sun to reveal coronal mass ejections (CMEs) traveling into space. C3 has a wide field showing material out to 30 solar radii. Watch for bright expanding clouds heading toward Earth.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/lasco-c3/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/lasco-c3/latest.jpg',
    pattern: 'lasco',
    icon: Eye,
    color: 'from-slate-400 to-slate-500',
    borderColor: 'border-slate-400/50'
  },
  lasco_c2: {
    name: 'LASCO C2',
    shortName: 'LASCO C2',
    category: 'solar',
    description: 'Inner coronagraph - CME onset',
    explainer: 'Inner coronagraph showing the corona from 2-6 solar radii. Better detail for seeing CME onset and structure near the Sun. Complements C3 for tracking eruptions from start to interplanetary space.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/lasco-c2/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/lasco-c2/latest.jpg',
    pattern: 'lasco',
    icon: Eye,
    color: 'from-slate-500 to-slate-600',
    borderColor: 'border-slate-500/50'
  },
  sdo_hmii: {
    name: 'SDO Magnetogram',
    shortName: 'SDO HMI',
    category: 'solar',
    description: 'Solar magnetic field intensity',
    explainer: 'Shows the Sun\'s magnetic field - white and black areas are opposite polarities. Sunspots, active regions, and the magnetic complexity that can produce flares are all visible here.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/sdo-hmii/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/sdo-hmii/latest.jpg',
    pattern: 'sdo',
    icon: Compass,
    color: 'from-gray-400 to-gray-600',
    borderColor: 'border-gray-400/50'
  },

  // === SOLAR WIND ===
  enlil: {
    name: 'ENLIL Solar Wind',
    shortName: 'ENLIL',
    category: 'solarwind',
    description: 'Heliospheric solar wind model',
    explainer: 'A 3D model of the solar wind flowing through the inner solar system. Shows how CMEs and solar wind streams propagate from the Sun to Earth. The spiral pattern is caused by the Sun\'s rotation.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/enlil/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/enlil/latest.jpg',
    pattern: 'enlil',
    icon: Orbit,
    color: 'from-blue-600 to-indigo-600',
    borderColor: 'border-blue-600/50'
  },

  // === MAGNETOSPHERE ===
  density: {
    name: 'Plasma Density',
    shortName: 'Density',
    category: 'magnetosphere',
    description: 'Geospace particle concentration',
    explainer: 'Shows the concentration of charged particles (ions and electrons) in near-Earth space. Higher density (brighter colors) indicates more particles from the solar wind interacting with Earth\'s magnetic field.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/latest.png',
    pattern: 'geospace',
    icon: Globe,
    color: 'from-blue-500 to-cyan-500',
    borderColor: 'border-blue-500/50'
  },
  velocity: {
    name: 'Plasma Velocity',
    shortName: 'Velocity',
    category: 'magnetosphere',
    description: 'Solar wind speed around Earth',
    explainer: 'Displays the speed and direction of solar wind plasma flowing around Earth. Typical solar wind moves at 400 km/s, but can exceed 800 km/s during storms, compressing the magnetosphere.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/latest.png',
    pattern: 'geospace',
    icon: Wind,
    color: 'from-emerald-500 to-teal-500',
    borderColor: 'border-emerald-500/50'
  },
  pressure: {
    name: 'Plasma Pressure',
    shortName: 'Pressure',
    category: 'magnetosphere',
    description: 'Dynamic pressure on magnetosphere',
    explainer: 'Shows the force exerted by solar wind on Earth\'s magnetic field. High pressure pushes the magnetosphere closer to Earth, potentially exposing satellites to harmful radiation.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/latest.png',
    pattern: 'geospace',
    icon: Gauge,
    color: 'from-orange-500 to-red-500',
    borderColor: 'border-orange-500/50'
  },

  // === IONOSPHERE ===
  drap_global: {
    name: 'D-RAP Global',
    shortName: 'D-RAP',
    category: 'ionosphere',
    description: 'HF radio absorption - global view',
    explainer: 'D-Region Absorption Prediction shows where high-frequency radio signals are being absorbed by the ionosphere. Red areas indicate radio blackouts affecting aviation and emergency communications.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/d-rap/global/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/d-rap/global/latest.png',
    pattern: 'drap',
    icon: Radio,
    color: 'from-red-500 to-rose-500',
    borderColor: 'border-red-500/50'
  },
  drap_north: {
    name: 'D-RAP North Pole',
    shortName: 'D-RAP N',
    category: 'ionosphere',
    description: 'HF radio absorption - Arctic',
    explainer: 'Radio absorption prediction for the Arctic region. Polar routes are particularly affected by solar particle events, which can cause complete HF radio blackout on transpolar flights.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/d-rap/north-pole/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/d-rap/north-pole/latest.png',
    pattern: 'drap',
    icon: Radio,
    color: 'from-rose-500 to-pink-500',
    borderColor: 'border-rose-500/50'
  },

  // === AURORA ===
  ovation_north: {
    name: 'Aurora North',
    shortName: 'Aurora N',
    category: 'aurora',
    description: 'Northern Lights forecast',
    explainer: 'Predicts where the Northern Lights (Aurora Borealis) will be visible. Brighter areas indicate higher probability. The aurora oval expands southward during geomagnetic storms.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/latest.jpg',
    pattern: 'ovation',
    icon: Waves,
    color: 'from-purple-500 to-pink-500',
    borderColor: 'border-purple-500/50'
  },
  ovation_south: {
    name: 'Aurora South',
    shortName: 'Aurora S',
    category: 'aurora',
    description: 'Southern Lights forecast',
    explainer: 'Predicts where the Southern Lights (Aurora Australis) will be visible. Best viewed from Antarctica, southern New Zealand, and Tasmania during active periods.',
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/',
    latestUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/latest.jpg',
    pattern: 'ovation',
    icon: Waves,
    color: 'from-violet-500 to-fuchsia-500',
    borderColor: 'border-violet-500/50'
  }
};

// Preset channel groupings for multi-view
const MULTIVIEW_PRESETS = {
  overview: {
    name: 'Overview',
    description: 'One from each category',
    sources: ['suvi_304', 'lasco_c3', 'enlil', 'density', 'drap_global', 'ovation_north']
  },
  solar: {
    name: 'Solar Observer',
    description: 'Watch the Sun',
    sources: ['suvi_304', 'suvi_195', 'suvi_171', 'lasco_c2', 'lasco_c3', 'sdo_hmii']
  },
  storm: {
    name: 'Storm Watch',
    description: 'Track space weather events',
    sources: ['enlil', 'density', 'pressure', 'ovation_north']
  },
  radio: {
    name: 'HF Radio',
    description: 'Radio propagation conditions',
    sources: ['drap_global', 'drap_north', 'ovation_north', 'ovation_south']
  },
  earth: {
    name: 'Earth Effects',
    description: 'Impacts at Earth',
    sources: ['density', 'velocity', 'pressure', 'drap_global', 'ovation_north']
  },
  minimal: {
    name: 'Minimal',
    description: 'Quick overview',
    sources: ['suvi_304', 'enlil', 'ovation_north']
  }
};

// Default sources for multi-view
const DEFAULT_MULTIVIEW_SOURCES = MULTIVIEW_PRESETS.overview.sources;

// Parse URL query parameters for channel selection
function getInitialStateFromURL() {
  const params = new URLSearchParams(window.location.search);
  const channel = params.get('channel');
  const channels = params.get('channels');

  if (channels) {
    // Multi-view mode with multiple channels
    const channelList = channels.split(',').filter(c => ANIMATION_SOURCES[c]);
    if (channelList.length > 0) {
      return { multiView: true, sources: channelList };
    }
  } else if (channel && ANIMATION_SOURCES[channel]) {
    // Single view mode
    return { multiView: false, source: channel };
  }

  return null;
}

// Update URL with current channel selection (without page reload)
function updateURLWithChannels(multiView, selectedSource, selectedMultiSources) {
  const params = new URLSearchParams();

  if (multiView) {
    params.set('channels', selectedMultiSources.join(','));
  } else {
    params.set('channel', selectedSource);
  }

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newURL);
}

// Filename parsers for each pattern type
function parseTimestamp(filename, pattern) {
  switch (pattern) {
    case 'geospace': {
      const match = filename.match(/_(\d{8}T\d{4})\.png$/);
      if (!match) return null;
      const ts = match[1];
      return new Date(Date.UTC(
        parseInt(ts.slice(0, 4)),
        parseInt(ts.slice(4, 6)) - 1,
        parseInt(ts.slice(6, 8)),
        parseInt(ts.slice(9, 11)),
        parseInt(ts.slice(11, 13))
      ));
    }
    case 'ovation': {
      const match = filename.match(/aurora_[NS]_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.jpg$/);
      if (!match) return null;
      return new Date(Date.UTC(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5])
      ));
    }
    case 'suvi': {
      const match = filename.match(/s(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/);
      if (!match) return null;
      return new Date(Date.UTC(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6])
      ));
    }
    case 'lasco': {
      const match = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})_c[23]/);
      if (!match) return null;
      return new Date(Date.UTC(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5])
      ));
    }
    case 'sdo': {
      const match = filename.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_512/);
      if (!match) return null;
      return new Date(Date.UTC(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6])
      ));
    }
    case 'enlil': {
      const match = filename.match(/_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.jpg$/);
      if (!match) return null;
      return new Date(Date.UTC(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6])
      ));
    }
    case 'drap': {
      const match = filename.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (!match) return null;
      return new Date(Date.UTC(
        parseInt(match[1]),
        parseInt(match[2]) - 1,
        parseInt(match[3]),
        parseInt(match[4]),
        parseInt(match[5]),
        parseInt(match[6])
      ));
    }
    default:
      return null;
  }
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
    const pattern = sourceConfig.pattern;
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

      const frameTime = parseTimestamp(filename, pattern);

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
function findClosestFrame(frames, targetTimestamp, maxDiffMs = 15 * 60 * 1000) {
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

  return minDiff <= maxDiffMs ? closest : null;
}

// Preload a single image with caching
async function preloadImage(url, timeout = 8000) {
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

// Get initial state from URL (computed once at module load for SSR safety)
const initialURLState = typeof window !== 'undefined' ? getInitialStateFromURL() : null;

export default function SpaceWeatherViewer() {
  const [multiView, setMultiView] = useState(initialURLState?.multiView ?? false);
  const [historicalMode, setHistoricalMode] = useState(false);
  const [useLocalTime, setUseLocalTime] = useState(true);
  const [selectedSource, setSelectedSource] = useState(initialURLState?.source ?? 'suvi_304');
  const [selectedMultiSources, setSelectedMultiSources] = useState(initialURLState?.sources ?? DEFAULT_MULTIVIEW_SOURCES);
  const [showSourceSelector, setShowSourceSelector] = useState(false);
  const [loadedFrames, setLoadedFrames] = useState([]);
  const [allSourceFrames, setAllSourceFrames] = useState({});
  const [unifiedTimeline, setUnifiedTimeline] = useState([]);
  const [sourceLoadStatus, setSourceLoadStatus] = useState({}); // 'loading' | 'ready' | 'error'
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(75); // 4x speed default
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [hoursBack, setHoursBack] = useState(6);
  const [useLatestOnly, setUseLatestOnly] = useState(false);
  const [latestImageUrl, setLatestImageUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const intervalRef = useRef(null);

  // Video export hook
  const {
    isExporting,
    progress: exportProgress,
    status: exportStatus,
    error: exportError,
    startSingleViewExport,
    startMultiViewExport,
    cancelExport,
    clearError: clearExportError,
    supportsMediaRecorder,
    videoFormatLabel
  } = useVideoExport();

  // Update URL when channel selection changes
  useEffect(() => {
    updateURLWithChannels(multiView, selectedSource, selectedMultiSources);
  }, [multiView, selectedSource, selectedMultiSources]);

  // Toggle source in multi-view selection
  const toggleMultiSource = (key) => {
    setSelectedMultiSources(prev => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev; // Keep at least one
        return prev.filter(k => k !== key);
      }
      return [...prev, key];
    });
  };

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
    if (!sourceConfig) {
      setErrorMsg('Invalid source selected');
      setLoading(false);
      return;
    }

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

  // Build timeline from loaded sources
  const buildTimelineFromFrames = useCallback((allFrames, sources) => {
    const allTimestamps = new Set();
    Object.values(allFrames).forEach(frames => {
      frames.forEach(f => allTimestamps.add(f.timestamp));
    });

    if (allTimestamps.size === 0) return [];

    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
    let sampledTimestamps = sortedTimestamps;
    if (sortedTimestamps.length > 100) {
      const step = Math.ceil(sortedTimestamps.length / 100);
      sampledTimestamps = sortedTimestamps.filter((_, i) => i % step === 0);
    }

    const timeline = sampledTimestamps.map(ts => ({
      timestamp: ts,
      label: formatTimestamp(new Date(ts)),
      frames: {}
    }));

    for (const key of sources) {
      const frames = allFrames[key];
      if (!frames) continue;
      for (const timepoint of timeline) {
        const closest = findClosestFrame(frames, timepoint.timestamp);
        if (closest) {
          timepoint.frames[key] = closest;
        }
      }
    }

    return timeline.filter(t => Object.keys(t.frames).length >= 1);
  }, []);

  // Load frames for multi-view mode - progressive loading
  const loadMultiSources = useCallback(async (sources) => {
    // Initialize state - show grid immediately with loading placeholders
    const initialStatus = {};
    sources.forEach(key => { initialStatus[key] = 'loading'; });
    setSourceLoadStatus(initialStatus);
    setAllSourceFrames({});
    setUnifiedTimeline([]);
    setCurrentFrame(0);
    setIsPlaying(false);
    setErrorMsg(null);
    setLoading(false); // Don't block UI - show grid with placeholders
    setLoadProgress(0);
    setLoadingStatus('Loading sources...');

    const accumulatedFrames = {};

    // Load sources one by one, updating UI progressively
    for (let i = 0; i < sources.length; i++) {
      const key = sources[i];
      const config = ANIMATION_SOURCES[key];
      if (!config) continue;

      setLoadingStatus(`Loading ${config.shortName}...`);
      setLoadProgress(Math.round(((i + 0.5) / sources.length) * 100));

      try {
        const frames = await fetchFrameList(key, hoursBack);

        if (frames.length > 0) {
          accumulatedFrames[key] = frames;

          // Preload the most recent frame for this source immediately
          const latestFrame = frames[frames.length - 1];
          await preloadImage(latestFrame.url);

          // Update state with this source ready
          setSourceLoadStatus(prev => ({ ...prev, [key]: 'ready' }));
          setAllSourceFrames({ ...accumulatedFrames });

          // Rebuild timeline with all loaded sources
          const newTimeline = buildTimelineFromFrames(accumulatedFrames, sources);
          if (newTimeline.length > 0) {
            setUnifiedTimeline(newTimeline);
            // Jump to latest frame when first source loads
            if (Object.keys(accumulatedFrames).length === 1) {
              setCurrentFrame(newTimeline.length - 1);
            }
          }
        } else {
          setSourceLoadStatus(prev => ({ ...prev, [key]: 'error' }));
        }
      } catch (err) {
        console.error(`Failed to load ${key}:`, err);
        setSourceLoadStatus(prev => ({ ...prev, [key]: 'error' }));
      }

      setLoadProgress(Math.round(((i + 1) / sources.length) * 100));
    }

    // After all sources loaded, preload remaining frames in background
    const allUrls = [];
    Object.values(accumulatedFrames).forEach(frames => {
      frames.forEach(f => {
        if (!imageCache.has(f.url)) {
          allUrls.push(f.url);
        }
      });
    });

    if (allUrls.length > 0) {
      setLoadingStatus('Caching frames...');
      // Preload in background without blocking
      preloadImagesInBatches(allUrls, () => {}, 5, 50);
    }

    setLoadingStatus('');

    // Start playing if we have frames
    const finalTimeline = buildTimelineFromFrames(accumulatedFrames, sources);
    if (finalTimeline.length >= 3) {
      setIsPlaying(true);
    } else if (Object.keys(accumulatedFrames).length === 0) {
      setErrorMsg('Could not load any frames from NOAA.');
    }
  }, [hoursBack, buildTimelineFromFrames]);

  // Effect to load based on mode
  useEffect(() => {
    if (multiView) {
      loadMultiSources(selectedMultiSources);
    } else {
      loadSingleSource(selectedSource);
    }
  }, [multiView, selectedSource, selectedMultiSources, loadSingleSource, loadMultiSources]);

  // Reload when hours change
  useEffect(() => {
    if (multiView) {
      loadMultiSources(selectedMultiSources);
    } else {
      loadSingleSource(selectedSource);
    }
  }, [hoursBack]);

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
      loadMultiSources(selectedMultiSources);
    } else {
      loadSingleSource(selectedSource);
    }
  };

  const currentSourceConfig = ANIMATION_SOURCES[selectedSource];
  const SourceIcon = currentSourceConfig?.icon || Sun;
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
    if (!config) return null;
    const Icon = config.icon;
    const loadStatus = sourceLoadStatus[sourceKey];

    return (
      <div className={`relative bg-black rounded-lg overflow-hidden border-2 ${config.borderColor}`}>
        {showLabel && (
          <div className={`absolute top-0 left-0 right-0 bg-gradient-to-r ${config.color} px-2 py-1 flex items-center gap-1.5 z-10`}>
            <Icon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{config.shortName}</span>
            {loadStatus === 'loading' && (
              <RefreshCw className="w-3 h-3 animate-spin ml-auto opacity-70" />
            )}
          </div>
        )}
        {loadStatus === 'loading' ? (
          <div className="aspect-video flex flex-col items-center justify-center text-slate-400 text-xs gap-2 bg-slate-900/50">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400/50" />
            <span>Loading...</span>
          </div>
        ) : frame ? (
          <img
            src={frame.url}
            alt={config.name}
            className="w-full h-auto object-contain"
          />
        ) : loadStatus === 'error' ? (
          <div className="aspect-video flex items-center justify-center text-red-400 text-xs">
            Failed to load
          </div>
        ) : (
          <div className="aspect-video flex items-center justify-center text-slate-500 text-xs">
            No data
          </div>
        )}
      </div>
    );
  };

  // Group sources by category
  const sourcesByCategory = Object.entries(ANIMATION_SOURCES).reduce((acc, [key, source]) => {
    const cat = source.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push({ key, ...source });
    return acc;
  }, {});

  // Handle export
  const handleExport = (exportConfig) => {
    if (multiView) {
      startMultiViewExport({
        timeline: unifiedTimeline,
        sources: selectedMultiSources,
        sourceConfigs: ANIMATION_SOURCES,
        format: exportConfig.format,
        resolution: exportConfig.resolution,
        frameDelay: exportConfig.frameDelay
      });
    } else {
      startSingleViewExport({
        frames: loadedFrames,
        format: exportConfig.format,
        resolution: exportConfig.resolution,
        frameDelay: exportConfig.frameDelay,
        sourceName: currentSourceConfig?.shortName,
        sourceKey: selectedSource
      });
    }
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
          <p className="text-slate-400 text-sm">NOAA Space Weather Prediction Center • Real-time Data</p>
        </header>

        {/* View Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setMultiView(false); setHistoricalMode(false); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              !multiView && !historicalMode
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Maximize2 className="w-4 h-4" />
            Single View
          </button>
          <button
            onClick={() => { setMultiView(true); setHistoricalMode(false); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              multiView && !historicalMode
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Grid3X3 className="w-4 h-4" />
            Multi View
          </button>
          <button
            onClick={() => setHistoricalMode(true)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              historicalMode
                ? 'bg-amber-600 text-white'
                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            Historical
          </button>
        </div>

        {/* Historical Event Player */}
        {historicalMode && (
          <HistoricalEventPlayer className="mb-4" />
        )}

        {/* Source Selector - Single View */}
        {!multiView && !historicalMode && (
          <div className="relative mb-4">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r ${currentSourceConfig?.color || 'from-slate-500 to-slate-600'} bg-opacity-20 border border-white/10 hover:border-white/20 transition-all`}
            >
              <div className="flex items-center gap-3">
                <SourceIcon className="w-6 h-6" />
                <div className="text-left">
                  <div className="font-semibold">{currentSourceConfig?.name || 'Select Source'}</div>
                  <div className="text-xs text-white/70">{currentSourceConfig?.description || ''}</div>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDropdown && (
              <div className="absolute z-20 w-full mt-2 rounded-xl bg-slate-800 border border-white/10 overflow-hidden shadow-xl max-h-96 overflow-y-auto">
                {Object.entries(sourcesByCategory).map(([catKey, sources]) => (
                  <div key={catKey}>
                    <div className="px-4 py-2 bg-slate-900/50 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      {(() => {
                        const CatIcon = SOURCE_CATEGORIES[catKey]?.icon || Sun;
                        return <CatIcon className="w-3.5 h-3.5" />;
                      })()}
                      {SOURCE_CATEGORIES[catKey]?.name || catKey}
                    </div>
                    {sources.map(source => {
                      const Icon = source.icon;
                      return (
                        <button
                          key={source.key}
                          onClick={() => {
                            setSelectedSource(source.key);
                            setShowDropdown(false);
                          }}
                          className={`w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors ${source.key === selectedSource ? 'bg-white/10' : ''}`}
                        >
                          <Icon className="w-5 h-5" />
                          <div className="text-left flex-1">
                            <div className="font-medium text-sm">{source.name}</div>
                            <div className="text-xs text-slate-400">{source.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Source Selector - Multi View */}
        {multiView && !historicalMode && (
          <div className="mb-4">
            <button
              onClick={() => setShowSourceSelector(!showSourceSelector)}
              className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-700/50 border border-white/10 hover:border-white/20 transition-all"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                <span className="font-medium">Select Sources ({selectedMultiSources.length} selected)</span>
              </div>
              {showSourceSelector ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showSourceSelector && (
              <div className="mt-2 p-4 rounded-xl bg-slate-800/50 border border-white/10">
                {/* Preset buttons */}
                <div className="mb-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Quick Presets</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(MULTIVIEW_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedMultiSources([...preset.sources])}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700/70 text-slate-300 hover:bg-slate-600 hover:text-white transition-all"
                        title={preset.description}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                </div>

                {Object.entries(sourcesByCategory).map(([catKey, sources]) => (
                  <div key={catKey} className="mb-4 last:mb-0">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                      {(() => {
                        const CatIcon = SOURCE_CATEGORIES[catKey]?.icon || Sun;
                        return <CatIcon className="w-3.5 h-3.5" />;
                      })()}
                      {SOURCE_CATEGORIES[catKey]?.name || catKey}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {sources.map(source => {
                        const isSelected = selectedMultiSources.includes(source.key);
                        const Icon = source.icon;
                        return (
                          <button
                            key={source.key}
                            onClick={() => toggleMultiSource(source.key)}
                            className={`flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-all ${
                              isSelected
                                ? `bg-gradient-to-r ${source.color} text-white`
                                : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {isSelected ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                            <span className="truncate">{source.shortName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => {
                    setShowSourceSelector(false);
                    loadMultiSources(selectedMultiSources);
                  }}
                  className="mt-4 w-full py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-medium transition-colors"
                >
                  Apply Selection
                </button>
              </div>
            )}
          </div>
        )}

        {/* Live Data Content - Hidden when in Historical mode */}
        {!historicalMode && (<>
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
              {/* Progress indicator while loading */}
              {loadingStatus && (
                <div className="flex items-center justify-center gap-3 mb-4 bg-black/40 rounded-lg py-2 px-4">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="text-sm text-slate-400">{loadingStatus}</span>
                  <div className="w-24 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${loadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Timestamp display */}
              {currentFrameData && !loadingStatus && (
                <div className="text-center mb-4 bg-black/40 rounded-lg py-2">
                  <span className="text-lg font-mono text-cyan-400">{displayTimestamp(currentFrameData)}</span>
                </div>
              )}

              <div className={`grid gap-3 ${
                selectedMultiSources.length <= 2 ? 'grid-cols-1 md:grid-cols-2' :
                selectedMultiSources.length <= 4 ? 'grid-cols-2' :
                selectedMultiSources.length <= 6 ? 'grid-cols-2 lg:grid-cols-3' :
                'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              }`}>
                {selectedMultiSources.map(key => (
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
            <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '400px' }}>
              <div className="relative w-full">
                <img
                  src={latestImageUrl}
                  alt={`${currentSourceConfig?.name || 'Source'} - Latest`}
                  className="w-full h-auto object-contain"
                />
                <div className="absolute top-2 right-2 bg-green-600/80 backdrop-blur rounded-full px-3 py-1 text-xs flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse" />
                  Live (updates every 60s)
                </div>
              </div>
            </div>
          ) : currentFrameData ? (
            <div className="relative bg-black flex items-center justify-center" style={{ minHeight: '400px' }}>
              <div className="relative w-full">
                <img
                  src={currentFrameData.url}
                  alt={`${currentSourceConfig?.name || 'Source'} - ${displayTimestamp(currentFrameData)}`}
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
                alt={`${currentSourceConfig?.name || 'Source'} - Latest`}
                className="w-full h-auto object-contain"
              />
            </div>
          ) : null}

          {/* Controls */}
          {!loading && !errorMsg && frameCount > 0 && !useLatestOnly && (
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={prevFrame} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" title="Previous frame">
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button onClick={togglePlay} className="p-3 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 transition-all shadow-lg">
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  </button>
                  <button onClick={nextFrame} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors" title="Next frame">
                    <SkipForward className="w-5 h-5" />
                  </button>
                  <button onClick={refresh} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors ml-2" title="Refresh data">
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
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    title="Export animation"
                  >
                    <Download className="w-5 h-5" />
                  </button>
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
            <div className="text-xs text-slate-400">
              <p className="text-slate-300 font-medium mb-2">Selected Sources</p>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {selectedMultiSources.map(key => {
                  const source = ANIMATION_SOURCES[key];
                  if (!source) return null;
                  const Icon = source.icon;
                  return (
                    <div key={key} className={`p-2 rounded-lg bg-gradient-to-r ${source.color} bg-opacity-10 border border-white/5`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="w-3.5 h-3.5" />
                        <span className="text-slate-300 font-medium">{source.name}</span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">{source.explainer}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : currentSourceConfig && (
            <div className="flex items-start gap-3">
              <SourceIcon className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-400">
                <p className="text-slate-300 font-medium mb-1">{currentSourceConfig.name}</p>
                <p className="leading-relaxed">{currentSourceConfig.explainer}</p>
              </div>
            </div>
          )}
        </div>
        </>)}

        <footer className="mt-4 text-center text-xs text-slate-500">
          <span>Data: <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors">NOAA SWPC</a></span>
          <span className="mx-2">•</span>
          <a href="https://github.com/Barneyjm/space-weather-viewer" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors">GitHub</a>
        </footer>
      </div>

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        isExporting={isExporting}
        progress={exportProgress}
        status={exportStatus}
        error={exportError}
        supportsWebM={supportsMediaRecorder}
        videoFormatLabel={videoFormatLabel}
        onExport={handleExport}
        onCancel={cancelExport}
        onClearError={clearExportError}
        frameCount={frameCount}
        currentSpeed={speed}
      />
    </div>
  );
}
