// Vercel serverless function to proxy and cache NOAA images
// Edge cache: 1 hour, stale-while-revalidate: 24 hours
// Browser cache: 10 minutes (images update frequently)

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

    // Cache headers:
    // - max-age=600: Browser caches for 10 minutes
    // - s-maxage=3600: Vercel edge caches for 1 hour
    // - stale-while-revalidate=86400: Serve stale while revalidating for 24 hours
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', contentType);

    // CORS header for canvas pixel access (running difference feature)
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Help browsers identify the resource for caching
    res.setHeader('Vary', 'Accept-Encoding');

    return res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error proxying image:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
