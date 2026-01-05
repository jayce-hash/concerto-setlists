exports.handler = async (event) => {
  try {
    let artist = (event.queryStringParameters?.artist || "").trim();
    let title  = (event.queryStringParameters?.title || "").trim();

    if (!artist || !title) {
      return json(400, { error: "Missing artist or title" });
    }

    // 🔥 Normalize strings for Song.link
    artist = normalize(artist);
    title  = normalize(title);

    const q = `${title} ${artist}`;

    // Search
    const searchUrl = `https://api.song.link/v1-alpha.1/search?q=${encodeURIComponent(q)}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (!searchRes.ok || !searchData?.links?.length) {
      return json(200, { spotifyUrl: null, appleUrl: null });
    }

    const entityUrl = searchData.links[0].url;

    // Resolve
    const resolveUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(entityUrl)}`;
    const resolveRes = await fetch(resolveUrl);
    const resolveData = await resolveRes.json();

    const platforms = resolveData?.linksByPlatform || {};

    return json(200, {
      spotifyUrl: platforms?.spotify?.url || null,
      appleUrl: platforms?.appleMusic?.url || null
    });

  } catch (err) {
    return json(500, { error: "Songlink failed", details: String(err) });
  }
};

function normalize(str){
  return str
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\([^)]*\)/g, '')   // remove (Backstreet’s Back)
    .replace(/[^a-z0-9\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

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
