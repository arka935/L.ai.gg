// netlify/functions/inspect.js
// Proxy fetch generik: ambil konten mentah (HTML/CSS/JS) dari URL manapun.
// Dipakai fitur DevTools di devtools.html. Server-side fetch gak kena CORS,
// jadi bisa ambil source dari domain manapun.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  var targetUrl;
  try {
    var body = JSON.parse(event.body || "{}");
    targetUrl = body.url;
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Body tidak valid" }) };
  }

  if (!targetUrl || typeof targetUrl !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "URL kosong" }) };
  }

  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = "https://" + targetUrl;
  }

  var controller = new AbortController();
  var timeoutId = setTimeout(function () { controller.abort(); }, 15000);

  try {
    var resp = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,text/css,application/javascript,text/javascript,*/*"
      },
      redirect: "follow",
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: "Website balas status " + resp.status }) };
    }

    var text = await resp.text();
    // batasi ukuran biar function gak meledak buat halaman raksasa
    var LIMIT = 1500000;
    if (text.length > LIMIT) {
      text = text.slice(0, LIMIT) + "\n\n/* ...dipotong, konten terlalu panjang... */";
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: text, finalUrl: resp.url || targetUrl })
    };
  } catch (err) {
    clearTimeout(timeoutId);
    var msg = err && err.name === "AbortError" ? "Timeout, website kelamaan respon" : (err && err.message ? err.message : "Gagal fetch");
    return { statusCode: 502, body: JSON.stringify({ error: msg }) };
  }
};
