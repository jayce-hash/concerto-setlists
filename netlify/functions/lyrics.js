exports.handler = async (event) => {
  try {
    const artist = (event.queryStringParameters?.artist || "").trim();
    const title  = (event.queryStringParameters?.title || "").trim();

    if (!artist || !title) {
      return json(400, { error: "Missing artist or title" });
    }

    // Always have a safe fallback
    const fallback = `https://www.google.com/search?q=${encodeURIComponent(`${title} ${artist} lyrics`)}`;

    // Try lyrics.ovh but NEVER let it hang your app
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const api = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
      const res = await fetch(api, { signal: controller.signal });

      if (!res.ok) {
        return json(200, { lyricsUrl: fallback, source: "google_fallback" });
      }

      const data = await res.json();

      // If it returns lyrics text, we still just link out (copyright-safe)
      if (data?.lyrics) {
        return json(200, { lyricsUrl: fallback, source: "lyrics_found_google_link" });
      }

      return json(200, { lyricsUrl: fallback, source: "google_fallback" });
    } catch (e) {
      // timeout or network error
      return json(200, { lyricsUrl: fallback, source: "timeout_google_fallback" });
    } finally {
      clearTimeout(timeout);
    }

  } catch (err) {
    return json(200, {
      lyricsUrl: `https://www.google.com/search?q=${encodeURIComponent("lyrics")}`,
      source: "error_fallback"
    });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400"
    },
    body: JSON.stringify(body)
  };
}
