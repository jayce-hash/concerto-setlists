exports.handler = async (event) => {
  try {
    const artist = (event.queryStringParameters?.artist || "").trim();
    const title  = (event.queryStringParameters?.title || "").trim();

    if (!artist || !title) {
      return json(400, { error: "Missing artist or title" });
    }

    const api = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(api);

    if (!res.ok) {
      return json(200, { lyricsUrl: null });
    }

    const data = await res.json();
    if (!data?.lyrics) {
      return json(200, { lyricsUrl: null });
    }

    const lyricsUrl = `https://www.google.com/search?q=${encodeURIComponent(`${title} ${artist} lyrics`)}`;
    return json(200, { lyricsUrl });

  } catch (err) {
    return json(500, { error: "Lyrics lookup failed", details: String(err) });
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
