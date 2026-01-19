// Vercel serverless function to proxy and cache NOAA images
// Cached at edge for 1 hour, stale-while-revalidate for 24 hours

const ALLOWED_HOSTS = [
  'services.swpc.noaa.gov'
];

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const parsedUrl = new URL(url);

    // Security: only allow NOAA URLs
    if (!ALLOWED_HOSTS.includes(parsedUrl.host)) {
      return res.status(403).json({ error: 'Host not allowed' });
    }

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = await response.arrayBuffer();

    // Set cache headers
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', contentType);

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error proxying image:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
