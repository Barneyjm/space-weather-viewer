// Vercel serverless function to fetch and cache NOAA frame listings
// Cached at edge for 5 minutes, stale-while-revalidate for 10 minutes

const SOURCES = {
  // === SOLAR IMAGERY ===
  suvi_304: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/304/',
    pattern: 'suvi',
    ext: 'png'
  },
  suvi_195: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/195/',
    pattern: 'suvi',
    ext: 'png'
  },
  suvi_171: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/171/',
    pattern: 'suvi',
    ext: 'png'
  },
  suvi_131: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/suvi/primary/131/',
    pattern: 'suvi',
    ext: 'png'
  },
  lasco_c3: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/lasco-c3/',
    pattern: 'lasco',
    ext: 'jpg'
  },
  lasco_c2: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/lasco-c2/',
    pattern: 'lasco',
    ext: 'jpg'
  },
  sdo_hmii: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/sdo-hmii/',
    pattern: 'sdo',
    ext: 'jpg'
  },

  // === SOLAR WIND ===
  enlil: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/enlil/',
    pattern: 'enlil',
    ext: 'jpg'
  },

  // === MAGNETOSPHERE ===
  density: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/density/',
    pattern: 'geospace',
    ext: 'png'
  },
  velocity: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/velocity/',
    pattern: 'geospace',
    ext: 'png'
  },
  pressure: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/geospace/pressure/',
    pattern: 'geospace',
    ext: 'png'
  },

  // === IONOSPHERE ===
  drap_global: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/d-rap/global/',
    pattern: 'drap',
    ext: 'png'
  },
  drap_north: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/d-rap/north-pole/',
    pattern: 'drap',
    ext: 'png'
  },

  // === AURORA ===
  ovation_north: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/north/',
    pattern: 'ovation',
    ext: 'jpg'
  },
  ovation_south: {
    baseUrl: 'https://services.swpc.noaa.gov/images/animations/ovation/south/',
    pattern: 'ovation',
    ext: 'jpg'
  }
};

// Parse timestamp from filename based on pattern type
function parseTimestamp(filename, pattern) {
  switch (pattern) {
    case 'geospace': {
      // magnetosphere_cut_planes_density_20260119T1830.png
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
      // aurora_N_2026-01-19_1200.jpg
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
      // suvi-l2-ci304_s20260118T213200Z_....png
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
      // 20260118_2154_c3_512.jpg
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
      // 20260118_213200_512_HMII.jpg
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
      // enlil_*_20260118T213200.jpg
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
      // d-rap_global_20260119125900.png
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

      const frameTime = parseTimestamp(filename, config.pattern);

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
      latestUrl: `${config.baseUrl}latest.${config.ext}`,
      frames,
      fetchedAt: Date.now()
    });
  } catch (error) {
    console.error('Error fetching frames:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
