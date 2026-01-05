export async function handler(event) {
  try {
    const artist = (event.queryStringParameters?.artist || "").trim();
    const title  = (event.queryStringParameters?.title || "").trim();
    if (!artist || !title) return json(400, { error: "Missing artist or title" });

    // lyrics.ovh returns actual lyrics text, but we’ll just use it to validate existence
    const api = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const res = await fetch(api);
    const data = await res.json();

    if (!res.ok || !data?.lyrics) {
      return json(200, { lyricsUrl: null });
    }

    // Simple choice: open a Google search for lyrics (very reliable UX)
    const lyricsUrl = `https://www.google.com/search?q=${encodeURIComponent(`${title} ${artist} lyrics`)}`;
    return json(200, { lyricsUrl });
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
