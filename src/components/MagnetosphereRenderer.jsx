import React, { useRef, useEffect, useCallback } from 'react';

/**
 * MagnetosphereRenderer - Canvas-based magnetosphere visualization
 *
 * Renders a 2D cross-section of Earth's magnetosphere similar to
 * NOAA's Geospace model output. Shows density, velocity, or pressure
 * distributions based on solar wind parameters.
 */

// Color scales for different parameters
const COLOR_SCALES = {
  density: {
    name: 'Density',
    unit: 'cm⁻³',
    // Blue to red scale
    colors: [
      { value: 0, color: [0, 0, 80] },      // Dark blue - very low
      { value: 2, color: [0, 50, 150] },    // Blue - low
      { value: 5, color: [0, 150, 200] },   // Cyan - moderate
      { value: 10, color: [50, 200, 50] },  // Green - normal
      { value: 20, color: [200, 200, 0] },  // Yellow - elevated
      { value: 40, color: [255, 150, 0] },  // Orange - high
      { value: 80, color: [255, 50, 0] },   // Red - very high
      { value: 150, color: [150, 0, 50] },  // Dark red - extreme
    ],
    range: [0, 100],
  },
  velocity: {
    name: 'Velocity',
    unit: 'km/s',
    // Purple to red scale
    colors: [
      { value: 200, color: [30, 0, 60] },     // Dark purple - slow
      { value: 300, color: [60, 0, 120] },    // Purple
      { value: 400, color: [100, 50, 150] },  // Light purple - normal
      { value: 500, color: [50, 150, 50] },   // Green
      { value: 600, color: [150, 200, 0] },   // Yellow-green
      { value: 800, color: [255, 200, 0] },   // Yellow - fast
      { value: 1000, color: [255, 100, 0] },  // Orange - very fast
      { value: 1500, color: [200, 0, 0] },    // Red - extreme
    ],
    range: [200, 1200],
  },
  pressure: {
    name: 'Pressure',
    unit: 'nPa',
    // Green to red scale
    colors: [
      { value: 0, color: [0, 50, 0] },       // Dark green - very low
      { value: 1, color: [0, 100, 50] },     // Green - low
      { value: 2, color: [50, 150, 50] },    // Light green - normal
      { value: 5, color: [150, 200, 0] },    // Yellow-green
      { value: 10, color: [255, 200, 0] },   // Yellow - elevated
      { value: 20, color: [255, 100, 0] },   // Orange - high
      { value: 50, color: [200, 0, 0] },     // Red - very high
      { value: 100, color: [100, 0, 50] },   // Dark red - extreme
    ],
    range: [0, 50],
  },
};

// Interpolate color from scale
function getColorForValue(value, scale) {
  const colors = scale.colors;

  if (value <= colors[0].value) {
    return colors[0].color;
  }
  if (value >= colors[colors.length - 1].value) {
    return colors[colors.length - 1].color;
  }

  for (let i = 0; i < colors.length - 1; i++) {
    if (value >= colors[i].value && value < colors[i + 1].value) {
      const t = (value - colors[i].value) / (colors[i + 1].value - colors[i].value);
      return [
        Math.round(colors[i].color[0] + t * (colors[i + 1].color[0] - colors[i].color[0])),
        Math.round(colors[i].color[1] + t * (colors[i + 1].color[1] - colors[i].color[1])),
        Math.round(colors[i].color[2] + t * (colors[i + 1].color[2] - colors[i].color[2])),
      ];
    }
  }

  return colors[colors.length - 1].color;
}

/**
 * Calculate magnetopause boundary points using Shue et al. model
 * r = r0 * (2 / (1 + cos(theta)))^alpha
 */
function getMagnetopauseBoundary(standoffDistance, numPoints = 100) {
  const points = [];
  const r0 = standoffDistance;
  const alpha = 0.58; // Flaring parameter

  for (let i = 0; i <= numPoints; i++) {
    // Angle from -150 to 150 degrees (not full circle - tail extends)
    const theta = (i / numPoints) * Math.PI * 1.67 - Math.PI * 0.83;
    const r = r0 * Math.pow(2 / (1 + Math.cos(theta)), alpha);

    // Negate X so sunward side (magnetopause nose) faces left toward Sun
    points.push({
      x: -r * Math.cos(theta),
      y: r * Math.sin(theta),
    });
  }

  return points;
}

/**
 * Calculate bow shock boundary (upstream of magnetopause)
 */
function getBowShockBoundary(standoffDistance, numPoints = 80) {
  const points = [];
  const r0 = standoffDistance * 1.3; // Bow shock is ~1.3x magnetopause

  for (let i = 0; i <= numPoints; i++) {
    const theta = (i / numPoints) * Math.PI * 1.4 - Math.PI * 0.7;
    const r = r0 * Math.pow(2 / (1 + 0.8 * Math.cos(theta)), 0.7);

    // Negate X so bow shock faces left toward Sun
    points.push({
      x: -r * Math.cos(theta),
      y: r * Math.sin(theta),
    });
  }

  return points;
}

/**
 * Generate magnetosphere field values for visualization
 */
function generateFieldValues(width, height, params, mode) {
  const { standoffRe, solarWind } = params;
  const centerX = width * 0.55;
  const centerY = height * 0.5;
  const scale = Math.min(width, height) / 30; // Earth radii to pixels

  const values = new Float32Array(width * height);

  // Base values from solar wind
  const baseSpeed = solarWind?.speed || 400;
  const baseDensity = solarWind?.density || 5;
  const basePressure = solarWind?.pressure || 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Convert to Earth radii coordinates
      // Note: negative X is sunward (toward left side of screen)
      const xRe = (x - centerX) / scale;
      const yRe = (y - centerY) / scale;
      const r = Math.sqrt(xRe * xRe + yRe * yRe);
      // Use -xRe so theta=0 points sunward (left)
      const theta = Math.atan2(yRe, -xRe);

      let value = 0;

      // Inside Earth (r < 1 Re)
      if (r < 1) {
        values[y * width + x] = -1; // Flag for Earth
        continue;
      }

      // Calculate magnetopause distance at this angle
      const mpDist = standoffRe * Math.pow(2 / (1 + Math.cos(theta)), 0.58);

      // Solar wind region (outside magnetopause, or in the tail region on the right)
      if (r > mpDist || xRe > standoffRe * 0.5) {
        if (mode === 'velocity') {
          // Velocity decreases as it flows around magnetosphere
          const flowFactor = Math.max(0.3, 1 - Math.abs(yRe) / 15);
          value = baseSpeed * flowFactor;
        } else if (mode === 'density') {
          // Density increases at bow shock, then varies
          const compressionFactor = (r < mpDist * 1.3) ? 2.5 : 1.0;
          value = baseDensity * compressionFactor * (1 + Math.random() * 0.2);
        } else {
          // Pressure
          value = basePressure * (1 + Math.random() * 0.3);
        }
      } else {
        // Inside magnetosphere
        const magnetosphereDepth = (mpDist - r) / mpDist;

        if (mode === 'velocity') {
          // Convection patterns inside magnetosphere
          value = 50 + 150 * (1 - magnetosphereDepth) + Math.abs(yRe) * 20;
        } else if (mode === 'density') {
          // Lower density inside, higher near boundaries
          value = 0.5 + (1 - magnetosphereDepth) * baseDensity * 0.5;
          // Ring current enhancement
          if (r > 3 && r < 6 && Math.abs(yRe) < 2) {
            value += 5;
          }
        } else {
          // Pressure - magnetic pressure dominates inside
          value = 0.5 + magnetosphereDepth * 2;
        }
      }

      values[y * width + x] = value;
    }
  }

  return values;
}

/**
 * Main renderer component
 */
export default function MagnetosphereRenderer({
  width = 600,
  height = 400,
  mode = 'density', // 'density', 'velocity', or 'pressure'
  data = null, // { solar_wind, imf, geomagnetic, magnetosphere }
  timestamp = null,
  showLabels = true,
  showColorBar = true,
  className = '',
}) {
  const canvasRef = useRef(null);

  // Default parameters if no data provided
  const params = {
    standoffRe: data?.magnetosphere?.standoff_re || 10,
    solarWind: data?.solar_wind || { speed: 400, density: 5, pressure: 2 },
    imf: data?.imf || { bz: 0 },
    geomagnetic: data?.geomagnetic || { dst: 0, kp: 2 },
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const scale = COLOR_SCALES[mode];

    // Clear canvas
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, width, height);

    const centerX = width * 0.55;
    const centerY = height * 0.5;
    const reScale = Math.min(width, height) / 30;

    // Generate field values
    const values = generateFieldValues(width, height, params, mode);

    // Create image data
    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      const idx = i * 4;

      if (value === -1) {
        // Earth - blue marble
        pixels[idx] = 30;
        pixels[idx + 1] = 80;
        pixels[idx + 2] = 150;
        pixels[idx + 3] = 255;
      } else {
        const color = getColorForValue(value, scale);
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
        pixels[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw Earth with gradient
    const earthRadius = reScale;
    const earthGradient = ctx.createRadialGradient(
      centerX - earthRadius * 0.3, centerY - earthRadius * 0.3, 0,
      centerX, centerY, earthRadius
    );
    earthGradient.addColorStop(0, '#6B93D6');
    earthGradient.addColorStop(0.5, '#4A7BC8');
    earthGradient.addColorStop(1, '#1E3A5F');

    ctx.beginPath();
    ctx.arc(centerX, centerY, earthRadius, 0, Math.PI * 2);
    ctx.fillStyle = earthGradient;
    ctx.fill();
    ctx.strokeStyle = '#8AB4F8';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw magnetopause boundary
    const mpPoints = getMagnetopauseBoundary(params.standoffRe);
    ctx.beginPath();
    ctx.moveTo(centerX + mpPoints[0].x * reScale, centerY + mpPoints[0].y * reScale);
    for (const p of mpPoints) {
      ctx.lineTo(centerX + p.x * reScale, centerY + p.y * reScale);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw bow shock
    const bsPoints = getBowShockBoundary(params.standoffRe);
    ctx.beginPath();
    ctx.moveTo(centerX + bsPoints[0].x * reScale, centerY + bsPoints[0].y * reScale);
    for (const p of bsPoints) {
      ctx.lineTo(centerX + p.x * reScale, centerY + p.y * reScale);
    }
    ctx.strokeStyle = 'rgba(255, 255, 100, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw sun direction arrow
    ctx.beginPath();
    ctx.moveTo(20, centerY);
    ctx.lineTo(50, centerY);
    ctx.lineTo(45, centerY - 5);
    ctx.moveTo(50, centerY);
    ctx.lineTo(45, centerY + 5);
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Sun symbol
    ctx.beginPath();
    ctx.arc(12, centerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#FFD700';
    ctx.fill();

    // Labels
    if (showLabels) {
      ctx.font = '12px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';

      // Title
      ctx.font = 'bold 14px monospace';
      ctx.fillText(`Magnetosphere ${scale.name}`, width / 2, 20);

      // Timestamp
      if (timestamp) {
        ctx.font = '11px monospace';
        ctx.fillText(timestamp, width / 2, height - 10);
      }

      // Earth label
      ctx.font = '10px monospace';
      ctx.fillText('Earth', centerX, centerY + earthRadius + 15);

      // Standoff distance
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.textAlign = 'left';
      ctx.fillText(`Standoff: ${params.standoffRe.toFixed(1)} Re`, 10, 20);

      // Solar wind info
      if (params.solarWind) {
        ctx.fillText(`V: ${params.solarWind.speed?.toFixed(0) || '---'} km/s`, 10, 35);
        ctx.fillText(`n: ${params.solarWind.density?.toFixed(1) || '---'} /cc`, 10, 50);
      }

      // Geomagnetic info
      if (params.geomagnetic) {
        ctx.textAlign = 'right';
        ctx.fillText(`Dst: ${params.geomagnetic.dst?.toFixed(0) || '---'} nT`, width - 10, 20);
        ctx.fillText(`Kp: ${params.geomagnetic.kp?.toFixed(1) || '---'}`, width - 10, 35);
      }
    }

    // Color bar
    if (showColorBar) {
      const barX = width - 30;
      const barY = 60;
      const barHeight = height - 120;
      const barWidth = 15;

      // Draw color gradient
      for (let i = 0; i < barHeight; i++) {
        const value = scale.range[1] - (i / barHeight) * (scale.range[1] - scale.range[0]);
        const color = getColorForValue(value, scale);
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillRect(barX, barY + i, barWidth, 1);
      }

      // Border
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      // Labels
      ctx.font = '9px monospace';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText(`${scale.range[1]}`, barX + barWidth + 3, barY + 8);
      ctx.fillText(`${scale.range[0]}`, barX + barWidth + 3, barY + barHeight);
      ctx.fillText(scale.unit, barX + barWidth + 3, barY + barHeight / 2);
    }

  }, [width, height, mode, params, timestamp, showLabels, showColorBar]);

  useEffect(() => {
    render();
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ background: '#000' }}
    />
  );
}
