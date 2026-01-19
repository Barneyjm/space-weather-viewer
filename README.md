# Space Weather Viewer

A real-time visualization app for NOAA Space Weather Prediction Center data. View solar imagery, magnetosphere models, radio absorption forecasts, and aurora predictions with synchronized animations.

**Live Demo:** [space-weather-viewer.vercel.app](https://space-weather-viewer.vercel.app) *(deploy your own)*

![Space Weather Viewer](https://services.swpc.noaa.gov/images/animations/suvi/primary/304/latest.png)

## Features

- **15 Data Sources** across 5 categories: Solar, Solar Wind, Magnetosphere, Ionosphere, Aurora
- **Single & Multi-View Modes**: View one source at a time or customize which sources to display synchronized by timestamp
- **Animation Controls**: Play/pause, speed control (0.5x-4x), frame-by-frame navigation
- **Time Range Selection**: View last 3, 6, 12, or 24 hours of data
- **Timezone Toggle**: Switch between UTC and local time
- **Edge Caching**: Vercel serverless functions cache NOAA data to reduce server load

## Data Sources

All data comes from NOAA's Space Weather Prediction Center:

### Solar Imagery
- **SUVI 304nm** - Solar chromosphere showing prominences and flares
- **SUVI 195nm** - Million-degree corona and coronal holes
- **SUVI 171nm** - Quiet corona and magnetic loop structures
- **SUVI 131nm** - Hottest plasma for flare detection
- **LASCO C2/C3** - Coronagraphs for tracking CMEs
- **SDO Magnetogram** - Solar magnetic field intensity

### Solar Wind
- **ENLIL** - 3D heliospheric solar wind model

### Magnetosphere
- **Plasma Density** - Particle concentration near Earth
- **Plasma Velocity** - Solar wind speed around Earth
- **Plasma Pressure** - Dynamic pressure on magnetosphere

### Ionosphere
- **D-RAP Global** - HF radio absorption worldwide
- **D-RAP North Pole** - Arctic radio absorption

### Aurora
- **Aurora North** - Northern Lights forecast
- **Aurora South** - Southern Lights forecast

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
- **Data Source**: [services.swpc.noaa.gov](https://services.swpc.noaa.gov/images/animations/)
