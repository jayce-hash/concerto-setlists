exports.handler = async (event) => {
  try {
    const artist = (event.queryStringParameters?.artist || "").trim();
    const title = (event.queryStringParameters?.title || "").trim();

    if (!artist || !title) {
      return json(400, { error: "Missing artist or title" });
    }

    // 1) Use song.link search endpoint (no API key required)
    const searchUrl = `https://api.song.link/v1-alpha.1/search?q=${encodeURIComponent(`${title} ${artist}`)}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchRes.ok || !searchData?.links?.length) {
      return json(200, { spotifyUrl: null, appleUrl: null });
    }

    // 2) Take best match
    const entity = searchData.links[0];

    // 3) Resolve to platform links
    const resolveUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(entity.url)}`;
    const resolveRes = await fetch(resolveUrl);
    const resolveData = await resolveRes.json();

    const platforms = resolveData?.linksByPlatform || {};

    return json(200, {
      spotifyUrl: platforms?.spotify?.url || null,
      appleUrl: platforms?.appleMusic?.url || null
    });

  } catch (err) {
    return json(500, { error: "Song.link failed", details: String(err) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}
