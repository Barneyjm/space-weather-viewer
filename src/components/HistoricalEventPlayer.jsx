import React, { useState, useEffect, useCallback, useRef } from 'react';
import MagnetosphereRenderer from './MagnetosphereRenderer';

// Import historical event data
import halloween2003 from '../data/historical_events/halloween2003.json';
import march1989 from '../data/historical_events/march1989.json';
import bastille2000 from '../data/historical_events/bastille2000.json';
import may2024 from '../data/historical_events/may2024.json';
import october2024 from '../data/historical_events/october2024.json';

const EVENTS = {
  halloween2003,
  march1989,
  bastille2000,
  may2024,
  october2024,
};

// Storm level colors
const STORM_COLORS = [
  '#22C55E', // G0 - Green (quiet)
  '#84CC16', // G1 - Lime
  '#EAB308', // G2 - Yellow
  '#F97316', // G3 - Orange
  '#EF4444', // G4 - Red
  '#DC2626', // G5 - Dark red
];

const STORM_LABELS = ['Quiet', 'G1 Minor', 'G2 Moderate', 'G3 Strong', 'G4 Severe', 'G5 Extreme'];

/**
 * HistoricalEventPlayer - Replay historical space weather events
 */
export default function HistoricalEventPlayer({ className = '' }) {
  const [selectedEvent, setSelectedEvent] = useState('halloween2003');
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [displayMode, setDisplayMode] = useState('density');
  const [showTimeline, setShowTimeline] = useState(true);

  const playbackRef = useRef(null);

  const eventData = EVENTS[selectedEvent];
  const frames = eventData?.data || [];
  const eventInfo = eventData?.event_info || {};
  const summary = eventData?.summary || {};

  const currentData = frames[currentFrame] || null;

  // Format timestamp for display
  const formatTimestamp = (ts) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  // Playback control
  useEffect(() => {
    if (isPlaying && frames.length > 0) {
      playbackRef.current = setInterval(() => {
        setCurrentFrame((prev) => {
          if (prev >= frames.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }

    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, frames.length]);

  // Reset frame when event changes
  useEffect(() => {
    setCurrentFrame(0);
    setIsPlaying(false);
  }, [selectedEvent]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleFrameChange = useCallback((e) => {
    setCurrentFrame(parseInt(e.target.value, 10));
  }, []);

  const handleSkip = useCallback((delta) => {
    setCurrentFrame((prev) => Math.max(0, Math.min(frames.length - 1, prev + delta)));
  }, [frames.length]);

  // Calculate timeline markers for significant events
  const getTimelineMarkers = () => {
    const markers = [];
    let prevStormLevel = 0;

    frames.forEach((frame, idx) => {
      const stormLevel = frame.geomagnetic?.storm_level || 0;
      // Mark when storm level increases
      if (stormLevel > prevStormLevel && stormLevel >= 3) {
        markers.push({
          index: idx,
          level: stormLevel,
          label: `G${stormLevel} Storm`,
        });
      }
      prevStormLevel = stormLevel;
    });

    // Mark minimum Dst
    if (summary.geomagnetic?.min_dst) {
      const minDstFrame = frames.findIndex(
        (f) => f.geomagnetic?.dst === summary.geomagnetic.min_dst
      );
      if (minDstFrame >= 0) {
        markers.push({
          index: minDstFrame,
          level: 5,
          label: `Min Dst: ${summary.geomagnetic.min_dst} nT`,
        });
      }
    }

    return markers;
  };

  const stormLevel = currentData?.geomagnetic?.storm_level || 0;

  return (
    <div className={`bg-slate-900 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">Historical Event Replay</h2>
            <p className="text-sm text-slate-400">{eventInfo.name || 'Unknown Event'}</p>
          </div>

          {/* Event selector */}
          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="bg-slate-700 text-white px-3 py-1.5 rounded border border-slate-600 text-sm"
          >
            {Object.entries(EVENTS).map(([key, data]) => (
              <option key={key} value={key}>
                {data.event_info?.name || key}
              </option>
            ))}
          </select>
        </div>

        {/* Event description */}
        {eventInfo.description && (
          <p className="text-xs text-slate-400 mt-2">{eventInfo.description}</p>
        )}
      </div>

      {/* Main content */}
      <div className="p-4">
        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          {['density', 'velocity', 'pressure'].map((mode) => (
            <button
              key={mode}
              onClick={() => setDisplayMode(mode)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                displayMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>

        {/* Visualization */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Canvas */}
          <div className="flex-1">
            <MagnetosphereRenderer
              width={600}
              height={400}
              mode={displayMode}
              data={currentData}
              timestamp={formatTimestamp(currentData?.timestamp)}
              className="w-full rounded"
            />
          </div>

          {/* Stats panel */}
          <div className="lg:w-64 space-y-4">
            {/* Storm level indicator */}
            <div className="bg-slate-800 rounded p-3">
              <div className="text-xs text-slate-400 mb-1">Storm Level</div>
              <div
                className="text-2xl font-bold"
                style={{ color: STORM_COLORS[stormLevel] }}
              >
                {STORM_LABELS[stormLevel]}
              </div>
            </div>

            {/* Current values */}
            <div className="bg-slate-800 rounded p-3 space-y-2">
              <div className="text-xs text-slate-400 mb-2">Current Conditions</div>

              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Solar Wind:</span>
                <span className="text-white text-sm font-mono">
                  {currentData?.solar_wind?.speed?.toFixed(0) || '---'} km/s
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Density:</span>
                <span className="text-white text-sm font-mono">
                  {currentData?.solar_wind?.density?.toFixed(1) || '---'} /cc
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">IMF Bz:</span>
                <span
                  className="text-sm font-mono"
                  style={{
                    color: (currentData?.imf?.bz || 0) < -10 ? '#EF4444' : '#FFFFFF',
                  }}
                >
                  {currentData?.imf?.bz?.toFixed(1) || '---'} nT
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Dst:</span>
                <span
                  className="text-sm font-mono"
                  style={{
                    color: (currentData?.geomagnetic?.dst || 0) < -100 ? '#EF4444' : '#FFFFFF',
                  }}
                >
                  {currentData?.geomagnetic?.dst?.toFixed(0) || '---'} nT
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Kp:</span>
                <span className="text-white text-sm font-mono">
                  {currentData?.geomagnetic?.kp?.toFixed(1) || '---'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Standoff:</span>
                <span className="text-white text-sm font-mono">
                  {currentData?.magnetosphere?.standoff_re?.toFixed(1) || '---'} Re
                </span>
              </div>
            </div>

            {/* Event summary */}
            <div className="bg-slate-800 rounded p-3 space-y-1">
              <div className="text-xs text-slate-400 mb-2">Event Peak Values</div>
              <div className="text-xs text-slate-300">
                Max Speed: {summary.solar_wind?.max_speed?.toFixed(0) || '---'} km/s
              </div>
              <div className="text-xs text-slate-300">
                Min Dst: {summary.geomagnetic?.min_dst?.toFixed(0) || '---'} nT
              </div>
              <div className="text-xs text-slate-300">
                Peak Flare: {eventInfo.peak_flare || '---'}
              </div>
            </div>
          </div>
        </div>

        {/* Timeline */}
        {showTimeline && (
          <div className="mt-4 bg-slate-800 rounded p-3">
            {/* Timeline bar showing storm intensity */}
            <div className="h-6 flex rounded overflow-hidden mb-2">
              {frames.map((frame, idx) => (
                <div
                  key={idx}
                  className="flex-1 cursor-pointer transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: STORM_COLORS[frame.geomagnetic?.storm_level || 0],
                    opacity: idx === currentFrame ? 1 : 0.6,
                  }}
                  onClick={() => setCurrentFrame(idx)}
                  title={formatTimestamp(frame.timestamp)}
                />
              ))}
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleSkip(-10)}
                className="text-slate-400 hover:text-white p-1"
                title="Back 10 frames"
              >
                ⏮
              </button>

              <button
                onClick={() => handleSkip(-1)}
                className="text-slate-400 hover:text-white p-1"
                title="Previous frame"
              >
                ◀
              </button>

              <button
                onClick={handlePlayPause}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1 rounded font-medium"
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>

              <button
                onClick={() => handleSkip(1)}
                className="text-slate-400 hover:text-white p-1"
                title="Next frame"
              >
                ▶
              </button>

              <button
                onClick={() => handleSkip(10)}
                className="text-slate-400 hover:text-white p-1"
                title="Forward 10 frames"
              >
                ⏭
              </button>

              {/* Speed control */}
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="bg-slate-700 text-white px-2 py-1 rounded text-sm"
              >
                <option value={0.5}>0.5x</option>
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>

              {/* Frame slider */}
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={currentFrame}
                onChange={handleFrameChange}
                className="flex-1"
              />

              <span className="text-slate-400 text-sm font-mono min-w-[80px]">
                {currentFrame + 1} / {frames.length}
              </span>
            </div>

            {/* Current timestamp */}
            <div className="text-center text-sm text-slate-400 mt-2">
              {formatTimestamp(currentData?.timestamp)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
