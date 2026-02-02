import { useEffect, useRef, useState } from 'react';

/**
 * Running Difference Component
 * Displays the pixel difference between current and previous frame
 * Highlights motion and changes in solar imagery
 */
export function RunningDifference({ currentUrl, previousUrl, alt, className }) {
  const canvasRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const loadImage = (url) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${url}`));
        img.src = url;
      });
    };

    const computeDifference = async () => {
      setIsProcessing(true);
      setError(null);

      try {
        // Load current image
        const currentImg = await loadImage(currentUrl);

        // Set canvas size to match image
        canvas.width = currentImg.width;
        canvas.height = currentImg.height;

        // If no previous URL, just show current image with message
        if (!previousUrl || previousUrl === currentUrl) {
          ctx.drawImage(currentImg, 0, 0);
          // Overlay "First frame" indicator
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(0, canvas.height - 30, canvas.width, 30);
          ctx.fillStyle = '#22d3ee';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('First frame - no difference available', canvas.width / 2, canvas.height - 10);
          setIsProcessing(false);
          return;
        }

        // Load previous image
        const prevImg = await loadImage(previousUrl);

        // Draw current image and get pixel data
        ctx.drawImage(currentImg, 0, 0);
        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Draw previous image and get pixel data
        ctx.drawImage(prevImg, 0, 0);
        const prevData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Compute difference
        const diffData = ctx.createImageData(canvas.width, canvas.height);
        const curr = currentData.data;
        const prev = prevData.data;
        const diff = diffData.data;

        for (let i = 0; i < curr.length; i += 4) {
          // Compute difference for each channel
          const rDiff = curr[i] - prev[i];
          const gDiff = curr[i + 1] - prev[i + 1];
          const bDiff = curr[i + 2] - prev[i + 2];

          // Average luminance difference
          const avgDiff = (rDiff + gDiff + bDiff) / 3;

          // Color coding: positive (brighter) = orange/yellow, negative (dimmer) = blue
          // Scale by 2 for better visibility
          const scaled = Math.min(255, Math.abs(avgDiff) * 2);

          if (avgDiff > 0) {
            // Brightening - show as warm colors (orange/yellow)
            diff[i] = Math.min(255, 128 + scaled);     // R
            diff[i + 1] = Math.min(255, 64 + scaled * 0.5); // G
            diff[i + 2] = 0;                            // B
          } else if (avgDiff < 0) {
            // Dimming - show as cool colors (blue/cyan)
            diff[i] = 0;                                // R
            diff[i + 1] = Math.min(255, 64 + scaled * 0.5); // G
            diff[i + 2] = Math.min(255, 128 + scaled); // B
          } else {
            // No change - dark gray
            diff[i] = 32;
            diff[i + 1] = 32;
            diff[i + 2] = 32;
          }
          diff[i + 3] = 255; // Alpha
        }

        // Draw the difference image
        ctx.putImageData(diffData, 0, 0);

        // Add legend
        const legendHeight = 24;
        const legendY = canvas.height - legendHeight - 8;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(8, legendY, 200, legendHeight);

        // Orange square for brightening
        ctx.fillStyle = '#ff8800';
        ctx.fillRect(12, legendY + 4, 16, 16);
        ctx.fillStyle = '#fff';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Brighter', 32, legendY + 16);

        // Blue square for dimming
        ctx.fillStyle = '#0088ff';
        ctx.fillRect(100, legendY + 4, 16, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText('Dimmer', 120, legendY + 16);

        setIsProcessing(false);
      } catch (err) {
        console.error('Error computing difference:', err);
        setError(err.message);
        setIsProcessing(false);
      }
    };

    computeDifference();
  }, [currentUrl, previousUrl]);

  return (
    <div className={`relative ${className || ''}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-auto"
        style={{ imageRendering: 'pixelated' }}
      />
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-cyan-400 text-sm">Computing difference...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="text-red-400 text-sm">Error: {error}</div>
        </div>
      )}
    </div>
  );
}
