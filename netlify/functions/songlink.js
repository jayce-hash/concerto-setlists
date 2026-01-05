const https = require("https");

exports.handler = async (event) => {
  try {
    const artistRaw = (event.queryStringParameters?.artist || "").trim();
    const titleRaw  = (event.queryStringParameters?.title || "").trim();

    if (!artistRaw || !titleRaw) {
      return json(400, { error: "Missing artist or title" });
    }

    // 1) Find the song on Apple via iTunes Search (no auth)
    const term = `${titleRaw} ${artistRaw}`;
    const itunesUrl =
      `https://itunes.apple.com/search?` +
      `term=${encodeURIComponent(term)}&entity=song&limit=5`;

    const itunes = await getJson(itunesUrl);
    const results = Array.isArray(itunes?.results) ? itunes.results : [];

    // Choose best match: prefer exact-ish artist match
    const artistLower = normalize(artistRaw);
    const titleLower = normalize(titleRaw);

    const best =
      results.find(r =>
        normalize(r.artistName || "").includes(artistLower) &&
        normalize(r.trackName || "").includes(titleLower)
      ) || results[0];

    if (!best?.trackViewUrl) {
      return json(200, { spotifyUrl: null, appleUrl: null });
    }

    const appleUrl = best.trackViewUrl;

    // 2) Resolve to other platforms via song.link /links
    const songlinkUrl =
      `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(appleUrl)}`;

    const songlink = await getJson(songlinkUrl);
    const platforms = songlink?.linksByPlatform || {};

    return json(200, {
      appleUrl: platforms?.appleMusic?.url || appleUrl,
      spotifyUrl: platforms?.spotify?.url || null
    });

  } catch (err) {
    return json(500, { error: "Song resolution failed", details: String(err) });
  }
};

function normalize(str) {
  return String(str)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data || "{}");
            // Treat non-2xx as “no result”, not fatal
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return resolve({ __httpError: res.statusCode, __body: parsed });
            }
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Invalid JSON from ${url}`));
          }
        });
      })
      .on("error", reject);
  });
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
