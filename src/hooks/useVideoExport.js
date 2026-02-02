import { useState, useCallback, useRef } from 'react';
import {
  loadImageForCanvas,
  exportToWebM,
  exportToGIF,
  supportsMediaRecorder,
  downloadBlob,
  RESOLUTION_PRESETS,
  getVideoFileExtension,
  getVideoFormatLabel
} from '../utils/videoExport';

/**
 * Hook for handling video export functionality
 */
export function useVideoExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);

  const cancelledRef = useRef(false);

  /**
   * Start export for single-view mode
   */
  const startSingleViewExport = useCallback(async (config) => {
    const {
      frames, // loadedFrames array
      format, // 'webm' or 'gif'
      resolution, // '480p', '720p', '1080p'
      frameDelay, // in ms (from speed setting)
      sourceName, // source short name
      sourceKey // source key for filename
    } = config;

    if (!frames || frames.length === 0) {
      setError('No frames available to export');
      return;
    }

    cancelledRef.current = false;
    setIsExporting(true);
    setProgress(0);
    setStatus('Loading images...');
    setError(null);

    try {
      const resConfig = RESOLUTION_PRESETS[resolution] || RESOLUTION_PRESETS['720p'];

      // Load all images for canvas
      const loadedFrames = [];
      for (let i = 0; i < frames.length; i++) {
        if (cancelledRef.current) {
          setStatus('Cancelled');
          setIsExporting(false);
          return;
        }

        try {
          const image = await loadImageForCanvas(frames[i].url);
          loadedFrames.push({
            image,
            timestamp: frames[i].label,
            sourceName,
            multiView: false
          });
        } catch (err) {
          console.warn(`Failed to load frame ${i}:`, err);
        }

        setProgress(Math.round((i + 1) / frames.length * 50));
        setStatus(`Loading images... ${i + 1}/${frames.length}`);
      }

      if (loadedFrames.length === 0) {
        throw new Error('Failed to load any images');
      }

      if (cancelledRef.current) {
        setStatus('Cancelled');
        setIsExporting(false);
        return;
      }

      setStatus(`Encoding ${format.toUpperCase()}...`);

      const exportConfig = {
        width: resConfig.width,
        height: resConfig.height,
        frameDelay
      };

      const onProgress = (current, total, stage = 'Encoding') => {
        setProgress(50 + Math.round((current / total) * 50));
        setStatus(`${stage}... ${current}/${total}`);
      };

      let blob;
      if (format === 'webm') {
        blob = await exportToWebM(loadedFrames, exportConfig, onProgress);
      } else {
        blob = await exportToGIF(loadedFrames, exportConfig, onProgress);
      }

      if (cancelledRef.current) {
        setStatus('Cancelled');
        setIsExporting(false);
        return;
      }

      // Generate filename (use actual extension for video - might be mp4 on iOS instead of webm)
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const ext = format === 'webm' ? getVideoFileExtension() : 'gif';
      const filename = `space-weather-${sourceKey}-${timestamp}.${ext}`;

      downloadBlob(blob, filename);

      setProgress(100);
      setStatus('Download complete!');
      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
        setStatus('');
      }, 2000);

    } catch (err) {
      console.error('Export error:', err);
      setError(err.message || 'Export failed');
      setIsExporting(false);
    }
  }, []);

  /**
   * Start export for multi-view mode
   */
  const startMultiViewExport = useCallback(async (config) => {
    const {
      timeline, // unifiedTimeline array
      sources, // selectedMultiSources array
      sourceConfigs, // ANIMATION_SOURCES object
      format,
      resolution,
      frameDelay
    } = config;

    if (!timeline || timeline.length === 0) {
      setError('No timeline data available to export');
      return;
    }

    cancelledRef.current = false;
    setIsExporting(true);
    setProgress(0);
    setStatus('Loading images...');
    setError(null);

    try {
      const resConfig = RESOLUTION_PRESETS[resolution] || RESOLUTION_PRESETS['720p'];

      // Load all images for all sources in timeline
      const loadedTimeline = [];
      let totalImages = 0;
      let loadedImages = 0;

      // Count total images
      timeline.forEach(entry => {
        totalImages += Object.keys(entry.frames).length;
      });

      for (let i = 0; i < timeline.length; i++) {
        if (cancelledRef.current) {
          setStatus('Cancelled');
          setIsExporting(false);
          return;
        }

        const entry = timeline[i];
        const loadedEntry = {
          timestamp: entry.timestamp,
          label: entry.label,
          frames: {}
        };

        // Load images for each source in this timeline entry
        for (const [key, frame] of Object.entries(entry.frames)) {
          try {
            const image = await loadImageForCanvas(frame.url);
            loadedEntry.frames[key] = {
              ...frame,
              image
            };
          } catch (err) {
            console.warn(`Failed to load frame for ${key}:`, err);
          }
          loadedImages++;
          setProgress(Math.round(loadedImages / totalImages * 50));
          setStatus(`Loading images... ${loadedImages}/${totalImages}`);
        }

        loadedTimeline.push({
          entry: loadedEntry,
          sources,
          sourceConfigs,
          multiView: true
        });
      }

      if (loadedTimeline.length === 0) {
        throw new Error('Failed to load any timeline entries');
      }

      if (cancelledRef.current) {
        setStatus('Cancelled');
        setIsExporting(false);
        return;
      }

      setStatus(`Encoding ${format.toUpperCase()}...`);

      const exportConfig = {
        width: resConfig.width,
        height: resConfig.height,
        frameDelay
      };

      const onProgress = (current, total, stage = 'Encoding') => {
        setProgress(50 + Math.round((current / total) * 50));
        setStatus(`${stage}... ${current}/${total}`);
      };

      let blob;
      if (format === 'webm') {
        blob = await exportToWebM(loadedTimeline, exportConfig, onProgress);
      } else {
        blob = await exportToGIF(loadedTimeline, exportConfig, onProgress);
      }

      if (cancelledRef.current) {
        setStatus('Cancelled');
        setIsExporting(false);
        return;
      }

      // Generate filename (use actual extension for video - might be mp4 on iOS instead of webm)
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      const ext = format === 'webm' ? getVideoFileExtension() : 'gif';
      const filename = `space-weather-multiview-${timestamp}.${ext}`;

      downloadBlob(blob, filename);

      setProgress(100);
      setStatus('Download complete!');
      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
        setStatus('');
      }, 2000);

    } catch (err) {
      console.error('Export error:', err);
      setError(err.message || 'Export failed');
      setIsExporting(false);
    }
  }, []);

  /**
   * Cancel ongoing export
   */
  const cancelExport = useCallback(() => {
    cancelledRef.current = true;
    setStatus('Cancelling...');
  }, []);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isExporting,
    progress,
    status,
    error,
    startSingleViewExport,
    startMultiViewExport,
    cancelExport,
    clearError,
    supportsMediaRecorder: supportsMediaRecorder(),
    videoFormatLabel: getVideoFormatLabel()
  };
}
