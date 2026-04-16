const https = require("https");

exports.handler = async (event) => {
  const { artist, title } = event.queryStringParameters;
  if (!artist || !title) return { statusCode: 400, body: "Missing Params" };

  const term = encodeURIComponent(`${title} ${artist}`);
  const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=1`;

  return new Promise((resolve) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        const json = JSON.parse(data || "{}");
        const appleUrl = json.results?.[0]?.trackViewUrl || null;
        resolve({
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appleUrl })
        });
      });
    }).on("error", () => resolve({ statusCode: 500, body: "Error" }));
  });
};
