export async function handler(event) {
  try {
    const url = (event.queryStringParameters?.url || "").trim();
    if (!url) return json(400, { error: "Missing url" });

    const api = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(url)}`;
    const res = await fetch(api);
    const data = await res.json();

    if (!res.ok) return json(500, { error: "song.link failed", details: data });

    // Pull Apple Music + Spotify if available
    const linksByPlatform = data?.linksByPlatform || {};
    const spotifyUrl = linksByPlatform?.spotify?.url || url;
    const appleUrl = linksByPlatform?.appleMusic?.url || null;

    return json(200, { spotifyUrl, appleUrl });
  } catch (err) {
    return json(500, { error: "Unexpected error", details: String(err) });
  }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}
