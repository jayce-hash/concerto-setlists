export async function handler(event) {
  try {
    const artist = (event.queryStringParameters?.artist || "").trim();
    const title  = (event.queryStringParameters?.title || "").trim();

    if (!artist || !title) {
      return json(400, { error: "Missing artist or title" });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return json(500, { error: "Spotify env vars not set" });
    }

    // 1) Get access token
    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
      },
      body: new URLSearchParams({ grant_type: "client_credentials" })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return json(500, { error: "Failed to get Spotify token", details: tokenData });
    }

    const token = tokenData.access_token;

    // 2) Search
    const q = `track:${title} artist:${artist}`;
    const searchUrl = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const searchData = await searchRes.json();
    if (!searchRes.ok) {
      return json(500, { error: "Spotify search failed", details: searchData });
    }

    const item = searchData?.tracks?.items?.[0];
    if (!item) {
      return json(200, { spotifyUrl: null });
    }

    return json(200, {
      spotifyUrl: item.external_urls?.spotify || null,
      trackName: item.name,
      artistName: item.artists?.[0]?.name || null
    });
  } catch (err) {
    return json(500, { error: "Unexpected error", details: String(err) });
  }
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
