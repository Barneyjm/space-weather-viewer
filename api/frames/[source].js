// Vercel serverless function to fetch and cache NOAA frame listings
// Cached at edge for 5 minutes, stale-while-revalidate for 10 minutes

const SOURCES = {
  density: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/',
    type: 'geospace'
  },
  velocity: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/',
    type: 'geospace'
  },
  pressure: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/',
    type: 'geospace'
  },
  ovation_north: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/',
    type: 'ovation'
  },
  ovation_south: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/',
    type: 'ovation'
  }
};

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

function parseAuroraTimestamp(filename) {
  const match = filename.match(/aurora_[NS]_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})\.jpg$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute)));
}

export default async function handler(req, res) {
  const { source } = req.query;
  const hoursBack = parseInt(req.query.hours) || 6;

  if (!SOURCES[source]) {
    return res.status(400).json({ error: 'Invalid source' });
  }

  const config = SOURCES[source];
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  try {
    const response = await fetch(config.baseUrl);
    if (!response.ok) {
      return res.status(502).json({ error: 'Failed to fetch from NOAA' });
    }

    const html = await response.text();
    const linkRegex = /<a\s+href="([^"]+\.(png|jpg))"/gi;
    const frames = [];
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const filename = match[1];
      if (filename.includes('latest')) continue;

      let frameTime;
      if (config.type === 'geospace') {
        frameTime = parseGeospaceTimestamp(filename);
      } else {
        frameTime = parseAuroraTimestamp(filename);
      }

      if (frameTime && frameTime >= cutoffTime) {
        frames.push({
          url: `${config.baseUrl}${filename}`,
          timestamp: frameTime.getTime(),
          filename
        });
      }
    }

    frames.sort((a, b) => a.timestamp - b.timestamp);

    // Set cache headers (also set in vercel.json but good to have here too)
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

    return res.status(200).json({
      source,
      baseUrl: config.baseUrl,
      latestUrl: `${config.baseUrl}latest.${config.type === 'geospace' ? 'png' : 'jpg'}`,
      frames,
      fetchedAt: Date.now()
    });
  } catch (error) {
    console.error('Error fetching frames:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
