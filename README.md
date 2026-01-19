# Space Weather Viewer

A real-time visualization app for NOAA Space Weather Prediction Center data. View plasma density, velocity, pressure, and aurora forecasts with synchronized animations.

**Live Demo:** [space-weather-viewer.vercel.app](https://space-weather-viewer.vercel.app) *(deploy your own)*

![Space Weather Viewer](https://services.swpc.noaa.gov/images/animations/geospace/density/latest.png)

## Features

- **5 Data Sources**: Plasma density, velocity, pressure, and aurora forecasts (north & south)
- **Single & Multi-View Modes**: View one source at a time or all 5 synchronized by timestamp
- **Animation Controls**: Play/pause, speed control (0.5x-4x), frame-by-frame navigation
- **Time Range Selection**: View last 3, 6, 12, or 24 hours of data
- **Timezone Toggle**: Switch between UTC and local time
- **Edge Caching**: Vercel serverless functions cache NOAA data to reduce server load

## Data Sources

All data comes from NOAA's Space Weather Prediction Center:

- **Geospace Model** - Simulates Earth's magnetosphere using real-time solar wind data from the DSCOVR satellite
  - Density: Particle concentration
  - Velocity: Solar wind speed
  - Pressure: Dynamic pressure
- **OVATION Aurora Forecast** - Predicted aurora activity for northern and southern hemispheres

## Tech Stack

- React 18 + Vite
- Tailwind CSS
- Lucide React icons
- Vercel serverless functions (for caching)

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Deployment

Deploy to Vercel for automatic edge caching:

```bash
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

## API Routes (Vercel)

- `/api/frames/[source]` - Returns cached frame list (5 min TTL)
- `/api/image?url=...` - Proxies and caches NOAA images (1 hour TTL)

## License

MIT License - see [LICENSE](LICENSE)

## Links

- **GitHub**: [github.com/Barneyjm/space-weather-viewer](https://github.com/Barneyjm/space-weather-viewer)
- **NOAA SWPC**: [swpc.noaa.gov](https://www.swpc.noaa.gov/)
- **Data Source**: [services.swpc.noaa.gov](https://services.swpc.noaa.gov/images/animations/geospace/)
