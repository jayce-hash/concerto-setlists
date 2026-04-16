const https = require("https");

exports.handler = async (event) => {
  try {
    const artistRaw = (event.queryStringParameters?.artist || "").trim();
    const titleRaw = (event.queryStringParameters?.title || "").trim();

    if (!artistRaw || !titleRaw) {
      return json(400, { error: "Missing artist or title" });
    }

    // 1) Search iTunes to get a verified Apple URL
    const term = `${titleRaw} ${artistRaw}`;
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`;
    const itunes = await getJson(itunesUrl);
    const appleUrl = itunes?.results?.[0]?.trackViewUrl || null;

    // 2) Try to get Spotify via Songlink using the Apple URL (Best Accuracy)
    let spotifyUrl = null;
    let finalAppleUrl = appleUrl;

    if (appleUrl) {
      const slUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(appleUrl)}&userCountry=US`;
      const slData = await getJson(slUrl);
      spotifyUrl = slData?.linksByPlatform?.spotify?.url || null;
      finalAppleUrl = slData?.linksByPlatform?.appleMusic?.url || appleUrl;
    }

    // 3) FALLBACK: If Spotify is still null, search Songlink by text (Broad Search)
    if (!spotifyUrl) {
      const queryUrl = `https://api.song.link/v1-alpha.1/links?platform=itunes&type=song&id=${encodeURIComponent(term)}&userCountry=US`;
      const slDataFallback = await getJson(queryUrl);
      spotifyUrl = slDataFallback?.linksByPlatform?.spotify?.url || null;
      if (!finalAppleUrl) finalAppleUrl = slDataFallback?.linksByPlatform?.appleMusic?.url || null;
    }

    return json(200, {
      appleUrl: finalAppleUrl,
      spotifyUrl: spotifyUrl
    });

  } catch (err) {
    console.error("Function Error:", err);
    return json(500, { error: "Failed", details: String(err) });
  }
};

// --- Keep your normalize and json helper functions as they were ---
// --- Use the updated getJson below ---

function getJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'ConcertoApp/1.0' }
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data || "{}"));
        } catch (e) {
          resolve({}); // Resolve empty on parse error to avoid crashing
        }
      });
    }).on("error", () => resolve({})); 
  });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

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
    // We need to parse the URL to pass options to https.get
    const uri = new URL(url);
    const options = {
      hostname: uri.hostname,
      path: uri.pathname + uri.search,
      method: 'GET',
      headers: {
        'User-Agent': 'ConcertoSetlists/1.0', // Helps prevent being blocked
        'Accept': 'application/json'
      }
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            if (res.statusCode === 429) {
               console.error("Songlink Rate Limit Hit");
               return resolve({});
            }
            const parsed = JSON.parse(data || "{}");
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
