// netlify/functions/chat.js
// Proxy ke Groq API. Key disimpan sebagai environment variable GROQ_API_KEY
// di Netlify (Site settings > Environment variables), TIDAK pernah dikirim ke browser.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Urutan model: coba yang pertama dulu, kalau gagal (limit/token habis/error)
// otomatis lanjut ke model berikutnya. Client (frontend) tidak pernah tahu
// model mana yang sebenarnya menjawab — semua tetap tampil sebagai "L.ai".
const MODELS = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b"];

const SYSTEM_PROMPT = {
  role: "system",
  content:
    "Kamu adalah L.ai (Leviathan Artificial Intelligence), asisten AI yang dibuat oleh Alex. " +
    "Tugasmu membantu pengguna merancang dan menulis kode aplikasi Android / aplikasi web yang bisa " +
    "langsung dideploy. Jawab dalam Bahasa Indonesia yang santai tapi jelas, dan langsung ke intinya " +
    "tanpa basa-basi berlebihan. Kalau diminta membuat aplikasi/website, tulis SATU blok kode ```html``` " +
    "yang lengkap dan mandiri (HTML, CSS, dan JavaScript semua digabung inline dalam satu file, tanpa " +
    "dependency eksternal yang butuh instalasi), supaya kodenya bisa langsung dijalankan di mode preview."
};

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server belum dikonfigurasi. Set GROQ_API_KEY di Netlify." })
    };
  }

  let userMessages;
  try {
    const body = JSON.parse(event.body || "{}");
    userMessages = Array.isArray(body.messages) ? body.messages : [];
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Body tidak valid" }) };
  }

  // batasi riwayat biar hemat token, ambil 20 pesan terakhir
  const trimmed = userMessages.slice(-20);
  const payloadMessages = [SYSTEM_PROMPT, ...trimmed];

  let lastErrorDetail = "";

  for (const model of MODELS) {
    try {
      const resp = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + apiKey
        },
        body: JSON.stringify({
          model: model,
          messages: payloadMessages,
          temperature: 0.7,
          max_completion_tokens: 2048
        })
      });

      if (!resp.ok) {
        lastErrorDetail = await resp.text();
        // status 429 (rate/token habis) atau 4xx/5xx lain -> coba model berikutnya
        continue;
      }

      const data = await resp.json();
      const reply = data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";

      if (!reply) {
        continue;
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: reply })
      };
    } catch (err) {
      lastErrorDetail = err.message || String(err);
      continue;
    }
  }

  console.error("L.ai: semua model gagal.", lastErrorDetail);
  return {
    statusCode: 502,
    body: JSON.stringify({ error: "L.ai sedang sibuk, coba lagi sebentar lagi." })
  };
};
