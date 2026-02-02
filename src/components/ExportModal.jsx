import { useState, useEffect } from 'react';
import { X, Download, Film, Image, AlertCircle } from 'lucide-react';
import { RESOLUTION_PRESETS } from '../utils/videoExport';

/**
 * Export Modal Component
 * Allows users to configure and trigger video/GIF export
 */
export function ExportModal({
  isOpen,
  onClose,
  // Export hook state/functions
  isExporting,
  progress,
  status,
  error,
  supportsWebM,
  videoFormatLabel = 'WebM', // Actual format: 'WebM' or 'MP4'
  onExport,
  onCancel,
  onClearError,
  // Frame info
  frameCount,
  currentSpeed
}) {
  const [format, setFormat] = useState(supportsWebM ? 'webm' : 'gif');
  const [resolution, setResolution] = useState('720p');

  // Update default format when browser support changes
  useEffect(() => {
    if (!supportsWebM && format === 'webm') {
      setFormat('gif');
    }
  }, [supportsWebM, format]);

  if (!isOpen) return null;

  const estimatedDuration = (frameCount * currentSpeed / 1000).toFixed(1);
  const resConfig = RESOLUTION_PRESETS[resolution];

  const handleExport = () => {
    onExport({
      format,
      resolution,
      frameDelay: currentSpeed
    });
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && !isExporting) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-slate-800 rounded-2xl border border-white/10 w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold">Export Animation</h2>
          </div>
          {!isExporting && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{error}</p>
                <button
                  onClick={onClearError}
                  className="text-xs text-red-400 hover:text-red-300 mt-1"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Frame info */}
          <div className="bg-slate-700/50 rounded-lg p-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-slate-400">Frames:</span>
                <span className="ml-2 text-white font-medium">{frameCount}</span>
              </div>
              <div>
                <span className="text-slate-400">Duration:</span>
                <span className="ml-2 text-white font-medium">~{estimatedDuration}s</span>
              </div>
            </div>
          </div>

          {/* Format selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat('webm')}
                disabled={!supportsWebM || isExporting}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                  format === 'webm'
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : supportsWebM
                      ? 'bg-slate-700/50 border-white/10 text-slate-300 hover:border-white/20'
                      : 'bg-slate-800/50 border-white/5 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Film className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">{videoFormatLabel}</div>
                  <div className="text-xs opacity-70">Best quality</div>
                </div>
              </button>
              <button
                onClick={() => setFormat('gif')}
                disabled={isExporting}
                className={`flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                  format === 'gif'
                    ? 'bg-cyan-600 border-cyan-500 text-white'
                    : 'bg-slate-700/50 border-white/10 text-slate-300 hover:border-white/20'
                }`}
              >
                <Image className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">GIF</div>
                  <div className="text-xs opacity-70">Universal</div>
                </div>
              </button>
            </div>
            {!supportsWebM && (
              <p className="text-xs text-amber-400 mt-2">
                Video recording not supported in this browser. Using GIF instead.
              </p>
            )}
          </div>

          {/* Resolution selector */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Resolution</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(RESOLUTION_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  onClick={() => setResolution(key)}
                  disabled={isExporting}
                  className={`p-2 rounded-lg border text-sm transition-all ${
                    resolution === key
                      ? 'bg-cyan-600 border-cyan-500 text-white'
                      : 'bg-slate-700/50 border-white/10 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <div className="font-medium">{key}</div>
                  <div className="text-xs opacity-70">{preset.width}x{preset.height}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Export progress */}
          {isExporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">{status}</span>
                <span className="text-cyan-400 font-medium">{progress}%</span>
              </div>
              <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex gap-2">
          {isExporting ? (
            <button
              onClick={onCancel}
              className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleExport}
                disabled={frameCount === 0}
                className="flex-1 py-2 px-4 bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-400 hover:to-purple-400 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export {format === 'webm' ? videoFormatLabel : 'GIF'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
