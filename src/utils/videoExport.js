// Video export utilities for Space Weather Viewer
// Supports WebM (MediaRecorder) and GIF (gif.js fallback)

const USE_API = import.meta.env.PROD;

/**
 * Detect if running on iOS Safari
 * iOS Safari lies about WebM support - it claims to support it but produces broken files
 */
function isIOSSafari() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS/.test(ua);
  return isIOS && isSafari;
}

/**
 * Check if MediaRecorder API is supported
 */
export function supportsMediaRecorder() {
  if (typeof MediaRecorder === 'undefined') return false;

  // Check for video recording support (WebM or MP4)
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4'
  ];

  return types.some(type => MediaRecorder.isTypeSupported(type));
}

/**
 * Get the best supported video mime type
 * iOS Safari lies about WebM support, so we force MP4 on iOS
 */
function getBestVideoMimeType() {
  // iOS Safari claims WebM support but produces broken files - force MP4
  if (isIOSSafari()) {
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) {
      return { mime: 'video/mp4;codecs=avc1', ext: 'mp4' };
    }
    if (MediaRecorder.isTypeSupported('video/mp4')) {
      return { mime: 'video/mp4', ext: 'mp4' };
    }
  }

  // Priority order: VP9 > VP8 > WebM > MP4 (H.264)
  const types = [
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' }
  ];

  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type.mime)) {
      return type;
    }
  }
  // Fallback
  return { mime: 'video/webm', ext: 'webm' };
}

/**
 * Get the actual file extension for the video format being used
 */
export function getVideoFileExtension() {
  return getBestVideoMimeType().ext;
}

/**
 * Get a display label for the video format (for UI)
 */
export function getVideoFormatLabel() {
  const ext = getBestVideoMimeType().ext;
  return ext === 'mp4' ? 'MP4' : 'WebM';
}

/**
 * Load an image for canvas use (CORS-safe via proxy in production)
 */
export function loadImageForCanvas(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

    // Use proxy in production for CORS-safe loading
    if (USE_API && url.includes('services.swpc.noaa.gov')) {
      img.src = `/api/image?url=${encodeURIComponent(url)}`;
    } else {
      img.src = url;
    }
  });
}

/**
 * Render a single frame with timestamp overlay to canvas
 */
export function renderFrameToCanvas(ctx, canvas, image, timestamp, sourceName = null) {
  const { width, height } = canvas;

  // Clear and fill background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  // Calculate aspect-fit dimensions
  const imgAspect = image.width / image.height;
  const canvasAspect = width / height;

  let drawWidth, drawHeight, drawX, drawY;

  if (imgAspect > canvasAspect) {
    drawWidth = width;
    drawHeight = width / imgAspect;
    drawX = 0;
    drawY = (height - drawHeight) / 2;
  } else {
    drawHeight = height;
    drawWidth = height * imgAspect;
    drawX = (width - drawWidth) / 2;
    drawY = 0;
  }

  // Draw image
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

  // Draw timestamp overlay at bottom center
  const text = timestamp;
  const fontSize = Math.max(14, Math.floor(height / 30));
  ctx.font = `${fontSize}px monospace`;

  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const padding = 8;
  const boxHeight = fontSize + padding * 2;
  const boxWidth = textWidth + padding * 2;
  const boxX = (width - boxWidth) / 2;
  const boxY = height - boxHeight - 10;

  // Semi-transparent background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
  ctx.fill();

  // Text
  ctx.fillStyle = '#22d3ee'; // cyan-400
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, boxY + boxHeight / 2);

  // Draw source name if provided (top left)
  if (sourceName) {
    const nameFontSize = Math.max(12, Math.floor(height / 35));
    ctx.font = `bold ${nameFontSize}px sans-serif`;
    const nameMetrics = ctx.measureText(sourceName);
    const namePadding = 6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, 10, nameMetrics.width + namePadding * 2, nameFontSize + namePadding * 2);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(sourceName, 10 + namePadding, 10 + namePadding);
  }
}

/**
 * Render a multi-view frame (grid layout) to canvas
 */
export function renderMultiViewFrame(ctx, canvas, timelineEntry, sources, sourceConfigs) {
  const { width, height } = canvas;
  const activeSourceKeys = Object.keys(timelineEntry.frames);
  const sourceCount = activeSourceKeys.length;

  if (sourceCount === 0) return;

  // Clear and fill background
  ctx.fillStyle = '#1e293b'; // slate-800
  ctx.fillRect(0, 0, width, height);

  // Calculate grid layout
  let cols, rows;
  if (sourceCount <= 2) {
    cols = sourceCount;
    rows = 1;
  } else if (sourceCount <= 4) {
    cols = 2;
    rows = 2;
  } else if (sourceCount <= 6) {
    cols = 3;
    rows = 2;
  } else {
    cols = 4;
    rows = Math.ceil(sourceCount / 4);
  }

  // Reserve space for timestamp at top
  const timestampHeight = Math.max(30, Math.floor(height / 15));
  const gridHeight = height - timestampHeight - 20;
  const gridY = timestampHeight + 10;

  const cellWidth = (width - 20) / cols;
  const cellHeight = gridHeight / rows;
  const padding = 4;

  // Draw timestamp header
  const fontSize = Math.max(16, Math.floor(height / 25));
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = '#22d3ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(timelineEntry.label, width / 2, timestampHeight / 2 + 5);

  // Draw each source
  activeSourceKeys.forEach((key, index) => {
    const frame = timelineEntry.frames[key];
    const config = sourceConfigs[key];
    if (!frame || !frame.image) return;

    const col = index % cols;
    const row = Math.floor(index / cols);

    const cellX = 10 + col * cellWidth + padding;
    const cellY = gridY + row * cellHeight + padding;
    const innerWidth = cellWidth - padding * 2;
    const innerHeight = cellHeight - padding * 2;

    // Draw cell background
    ctx.fillStyle = '#000';
    ctx.fillRect(cellX, cellY, innerWidth, innerHeight);

    // Calculate aspect-fit for image
    const img = frame.image;
    const imgAspect = img.width / img.height;
    const cellAspect = innerWidth / innerHeight;

    let drawWidth, drawHeight, drawX, drawY;

    if (imgAspect > cellAspect) {
      drawWidth = innerWidth;
      drawHeight = innerWidth / imgAspect;
      drawX = cellX;
      drawY = cellY + (innerHeight - drawHeight) / 2;
    } else {
      drawHeight = innerHeight;
      drawWidth = innerHeight * imgAspect;
      drawX = cellX + (innerWidth - drawWidth) / 2;
      drawY = cellY;
    }

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

    // Draw source label
    if (config) {
      const labelFontSize = Math.max(10, Math.floor(innerHeight / 15));
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      const labelPadding = 4;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(cellX, cellY, ctx.measureText(config.shortName).width + labelPadding * 2, labelFontSize + labelPadding * 2);

      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(config.shortName, cellX + labelPadding, cellY + labelPadding);
    }
  });
}

/**
 * Export frames to video using MediaRecorder (WebM on desktop, MP4 on iOS)
 */
export async function exportToWebM(frames, config, onProgress) {
  const { width, height, frameDelay } = config;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Create stream from canvas
  const stream = canvas.captureStream(0); // 0 = manual frame control
  const { mime: mimeType } = getBestVideoMimeType();

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5000000 // 5 Mbps
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  return new Promise((resolve, reject) => {
    recorder.onerror = reject;

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    // Use timeslice to get data in chunks for better compatibility
    recorder.start(100); // Request data every 100ms

    let frameIndex = 0;

    // Helper for promise-based delay
    const delay = (ms) => new Promise(r => setTimeout(r, ms));

    const renderNextFrame = async () => {
      if (frameIndex >= frames.length) {
        // Wait for the last frame to be fully encoded before stopping.
        // This ensures proper container finalization.
        await delay(200);

        if (recorder.state === 'recording') {
          recorder.requestData();
          // Give time for the data to be collected before stopping.
          await delay(200);
          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
        return;
      }

      const frame = frames[frameIndex];

      try {
        if (frame.multiView) {
          // Multi-view frame
          renderMultiViewFrame(ctx, canvas, frame.entry, frame.sources, frame.sourceConfigs);
        } else {
          // Single-view frame
          renderFrameToCanvas(ctx, canvas, frame.image, frame.timestamp, frame.sourceName);
        }

        // Request a new frame from the stream
        const track = stream.getVideoTracks()[0];
        if (track.requestFrame) {
          track.requestFrame();
        }

        frameIndex++;
        onProgress(frameIndex, frames.length);

        // Wait for frame duration then render next
        await delay(frameDelay);
        renderNextFrame();
      } catch (err) {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
        reject(err);
      }
    };

    renderNextFrame();
  });
}

/**
 * Export frames to GIF using gif.js (dynamically loaded)
 */
export async function exportToGIF(frames, config, onProgress) {
  const { width, height, frameDelay } = config;

  // Dynamically import gif.js and get worker blob URL in parallel
  const [GIF, workerUrl] = await Promise.all([
    loadGifJs(),
    getGifWorkerBlobUrl()
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  return new Promise((resolve, reject) => {
    let isResolved = false;
    let timeoutId = null;

    // Timeout after 2 minutes of encoding (workers may have failed silently)
    const ENCODING_TIMEOUT = 120000;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      workerScript: workerUrl
    });

    gif.on('finished', (blob) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve(blob);
    });

    gif.on('error', (err) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      reject(err);
    });

    // Track encoding progress (fires during render phase)
    gif.on('progress', (p) => {
      // p is 0-1, map to percentage of the encoding phase
      onProgress(frames.length, frames.length, `Encoding GIF (${Math.round(p * 100)}%)`);
    });

    // Render all frames
    frames.forEach((frame, index) => {
      try {
        if (frame.multiView) {
          renderMultiViewFrame(ctx, canvas, frame.entry, frame.sources, frame.sourceConfigs);
        } else {
          renderFrameToCanvas(ctx, canvas, frame.image, frame.timestamp, frame.sourceName);
        }

        gif.addFrame(ctx, { copy: true, delay: frameDelay });
        onProgress(index + 1, frames.length, 'Adding frames');
      } catch (err) {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(err);
        }
      }
    });

    onProgress(frames.length, frames.length, 'Encoding GIF (0%)');

    // Set timeout to detect hung workers
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        gif.abort();
        reject(new Error('GIF encoding timed out. This may be due to worker loading issues on mobile browsers. Try WebM format instead.'));
      }
    }, ENCODING_TIMEOUT);

    gif.render();
  });
}

/**
 * Load gif.js library dynamically with timeout
 */
async function loadGifJs() {
  if (window.GIF) return window.GIF;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.js';

    // Timeout after 10 seconds
    const timeoutId = setTimeout(() => {
      reject(new Error('Failed to load GIF library (timeout). Check your network connection.'));
    }, 10000);

    script.onload = () => {
      clearTimeout(timeoutId);
      if (window.GIF) {
        resolve(window.GIF);
      } else {
        reject(new Error('GIF library loaded but not available. Try refreshing the page.'));
      }
    };

    script.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Failed to load GIF library. Check your network connection or try WebM format.'));
    };

    document.head.appendChild(script);
  });
}

/**
 * Cached blob URL for gif.js worker (to avoid re-fetching)
 */
let gifWorkerBlobUrl = null;

/**
 * Get gif.js worker URL - creates a blob URL to avoid cross-origin issues on mobile
 */
async function getGifWorkerBlobUrl() {
  if (gifWorkerBlobUrl) return gifWorkerBlobUrl;

  try {
    const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
    if (!response.ok) throw new Error('Failed to fetch worker');
    const workerCode = await response.text();
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    gifWorkerBlobUrl = URL.createObjectURL(blob);
    return gifWorkerBlobUrl;
  } catch (err) {
    // Fallback to CDN URL (might work on desktop)
    console.warn('Could not create blob URL for GIF worker, falling back to CDN:', err);
    return 'https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js';
  }
}

/**
 * Resolution presets
 */
export const RESOLUTION_PRESETS = {
  '480p': { width: 854, height: 480, label: '480p (SD)' },
  '720p': { width: 1280, height: 720, label: '720p (HD)' },
  '1080p': { width: 1920, height: 1080, label: '1080p (Full HD)' }
};

/**
 * Download a blob as a file
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
