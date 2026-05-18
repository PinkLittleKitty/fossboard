export default {
  async fetch(request, env, ctx) {
    if (!env.LEADERBOARD_KV) {
      return new Response(
        "ERROR: LEADERBOARD_KV namespace binding is missing. Please create and bind a KV namespace in your wrangler.toml or Cloudflare dashboard.",
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const url = new URL(request.url);
    const path = url.pathname;

    function corsHeaders(contentType = "text/plain; charset=utf-8") {
      return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Content-Type": contentType,
      };
    }

    function formatDreamloDate(dateStr) {
      try {
        const d = new Date(dateStr);
        const pad = (n) => String(n).padStart(2, "0");
        const month = pad(d.getUTCMonth() + 1);
        const day = pad(d.getUTCDate());
        const year = d.getUTCFullYear();
        let hours = d.getUTCHours();
        const minutes = pad(d.getUTCMinutes());
        const seconds = pad(d.getUTCSeconds());
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${month}-${day}-${year} ${pad(hours)}:${minutes}:${seconds} ${ampm}`;
      } catch (_e) {
        return dateStr;
      }
    }

    function generateToken(length = 20) {
      const arr = new Uint8Array(length / 2);
      crypto.getRandomValues(arr);
      return Array.from(arr, (dec) => dec.toString(16).padStart(2, "0")).join("");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    try {
      if (path === "/api/create") {
        const name = url.searchParams.get("name") || "Untitled Leaderboard";
        const sort = url.searchParams.get("sort") === "asc" ? "asc" : "desc";

        const privateKey = "priv-" + generateToken(20);
        const publicKey = "pub-" + generateToken(20);

        await env.LEADERBOARD_KV.put("private_to_public:" + privateKey, publicKey);
        await env.LEADERBOARD_KV.put("public_to_private:" + publicKey, privateKey);
        await env.LEADERBOARD_KV.put(
          "meta:" + publicKey,
          JSON.stringify({ name, sort, created: Date.now() })
        );

        return new Response(
          JSON.stringify({
            success: true,
            privateKey,
            publicKey,
            name,
            sort,
          }),
          {
            status: 200,
            headers: corsHeaders("application/json"),
          }
        );
      }

      const segments = path.split("/").filter(Boolean);

      if (segments[0] === "lb" && segments.length >= 3) {
        const key = segments[1];
        const action = segments[2];

        if (action === "add" || action === "add-pipe") {
          const username = decodeURIComponent(segments[3] || "").trim();
          const score = Number(segments[4]);
          const seconds = segments[5] ? Number(segments[5]) : 0;
          const text = segments[6] ? decodeURIComponent(segments[6]) : "";

          if (!username) {
            return new Response("ERROR: Username is required", { status: 400, headers: corsHeaders() });
          }
          if (isNaN(score)) {
            return new Response("ERROR: Score must be a number", { status: 400, headers: corsHeaders() });
          }

          const cleanUsername = username.replaceAll("*", "_");
          const cleanText = text.replaceAll("*", "_");

          const publicKey = await env.LEADERBOARD_KV.get("private_to_public:" + key);

          if (!publicKey) {
            return new Response("ERROR: Invalid private key", { status: 403, headers: corsHeaders() });
          }

          const scoreKey = `score:${publicKey}:${cleanUsername}`;
          await env.LEADERBOARD_KV.put(
            scoreKey,
            JSON.stringify({
              name: cleanUsername,
              score,
              seconds,
              text: cleanText,
              date: new Date().toISOString(),
            })
          );

          return new Response("OK", { status: 200, headers: corsHeaders() });
        }

        if (action === "delete") {
          const username = decodeURIComponent(segments[3] || "").trim();
          if (!username) {
            return new Response("ERROR: Username is required", { status: 400, headers: corsHeaders() });
          }

          const publicKey = await env.LEADERBOARD_KV.get("private_to_public:" + key);

          if (!publicKey) {
            return new Response("ERROR: Invalid private key", { status: 403, headers: corsHeaders() });
          }

          await env.LEADERBOARD_KV.delete(`score:${publicKey}:${username}`);
          return new Response("OK", { status: 200, headers: corsHeaders() });
        }

        if (action === "clear") {
          const publicKey = await env.LEADERBOARD_KV.get("private_to_public:" + key);

          if (!publicKey) {
            return new Response("ERROR: Invalid private key", { status: 403, headers: corsHeaders() });
          }

          const listPrefix = `score:${publicKey}:`;
          let listComplete = false;
          let cursor = undefined;

          while (!listComplete) {
            const list = await env.LEADERBOARD_KV.list({ prefix: listPrefix, cursor });
            for (const item of list.keys) {
              await env.LEADERBOARD_KV.delete(item.name);
            }
            if (list.list_complete) {
              listComplete = true;
            } else {
              cursor = list.cursor;
            }
          }

          return new Response("OK", { status: 200, headers: corsHeaders() });
        }

        if (action === "json" || action === "pipe" || action === "xml") {
          let publicKey = key;

          const pubKeyFromPriv = await env.LEADERBOARD_KV.get("private_to_public:" + key);
          if (pubKeyFromPriv) {
            publicKey = pubKeyFromPriv;
          }

          const metaJson = await env.LEADERBOARD_KV.get("meta:" + publicKey);
          if (!metaJson) {
            return new Response("ERROR: Leaderboard not found", { status: 404, headers: corsHeaders() });
          }
          const meta = JSON.parse(metaJson);

          const scoreEntries = [];
          const listPrefix = `score:${publicKey}:`;
          let listComplete = false;
          let cursor = undefined;

          while (!listComplete) {
            const list = await env.LEADERBOARD_KV.list({ prefix: listPrefix, cursor });
            const keysToFetch = list.keys.map((k) => k.name);

            const fetchedValues = await Promise.all(
              keysToFetch.map((k) => env.LEADERBOARD_KV.get(k, "json"))
            );

            for (const val of fetchedValues) {
              if (val) scoreEntries.push(val);
            }

            if (list.list_complete) {
              listComplete = true;
            } else {
              cursor = list.cursor;
            }
          }

          const isAscending = meta.sort === "asc";
          scoreEntries.sort((a, b) => {
            if (a.score !== b.score) {
              return isAscending ? a.score - b.score : b.score - a.score;
            }
            if (a.seconds !== b.seconds) {
              return a.seconds - b.seconds;
            }
            return new Date(a.date).getTime() - new Date(b.date).getTime();
          });

          const limitParam = url.searchParams.get("limit");
          const skipParam = url.searchParams.get("skip");
          let results = scoreEntries;

          if (skipParam) {
            const skipVal = parseInt(skipParam, 10);
            if (!isNaN(skipVal) && skipVal > 0) {
              results = results.slice(skipVal);
            }
          }
          if (limitParam) {
            const limitVal = parseInt(limitParam, 10);
            if (!isNaN(limitVal) && limitVal > 0) {
              results = results.slice(0, limitVal);
            }
          }

          if (action === "json") {
            const formattedEntries = results.map((entry) => ({
              name: entry.name,
              score: String(entry.score),
              seconds: String(entry.seconds),
              text: entry.text,
              date: formatDreamloDate(entry.date),
            }));

            let leaderboardValue = null;
            if (formattedEntries.length === 1) {
              leaderboardValue = { entry: formattedEntries[0] };
            } else if (formattedEntries.length > 1) {
              leaderboardValue = { entry: formattedEntries };
            }

            const responseData = {
              dreamlo: {
                leaderboard: leaderboardValue,
              },
            };

            return new Response(JSON.stringify(responseData, null, 2), {
              status: 200,
              headers: corsHeaders("application/json"),
            });
          }

          if (action === "pipe") {
            const lines = results.map(
              (entry) =>
                `${entry.name}|${entry.score}|${entry.seconds}|${entry.text}|${formatDreamloDate(entry.date)}`
            );
            return new Response(lines.join("\n"), {
              status: 200,
              headers: corsHeaders("text/plain; charset=utf-8"),
            });
          }

          if (action === "xml") {
            let xml = `<?xml version="1.0" encoding="utf-8"?>\n<dreamlo>\n  <leaderboard>\n`;
            for (const entry of results) {
              xml += `    <entry>\n`;
              xml += `      <name>${entry.name}</name>\n`;
              xml += `      <score>${entry.score}</score>\n`;
              xml += `      <seconds>${entry.seconds}</seconds>\n`;
              xml += `      <text>${entry.text}</text>\n`;
              xml += `      <date>${formatDreamloDate(entry.date)}</date>\n`;
              xml += `    </entry>\n`;
            }
            xml += `  </leaderboard>\n</dreamlo>`;
            return new Response(xml, {
              status: 200,
              headers: corsHeaders("application/xml; charset=utf-8"),
            });
          }
        }
      }

      return new Response(
        "FOSSBoard API is online. Use the dashboard to create a leaderboard.",
        {
          status: 200,
          headers: corsHeaders(),
        }
      );
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders("application/json"),
      });
    }
  }
};
