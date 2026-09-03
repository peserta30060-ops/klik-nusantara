const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// Model default mengikuti rekomendasi Gemini untuk pengguna baru saat ini.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const ROOT = __dirname;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJson(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new Error('Permintaan terlalu besar'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('JSON tidak valid')); }
    });
    req.on('error', reject);
  });
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-10).flatMap(item => {
    const role = item?.role === 'assistant' ? 'Bot Nusantara' : item?.role === 'user' ? 'Siswa' : null;
    const text = typeof item?.content === 'string' ? item.content.slice(0, 3000).trim() : '';
    return role && text ? [`${role}: ${text}`] : [];
  });
}

function extractInteractionText(data) {
  const texts = [];
  for (const step of data?.steps || []) {
    if (step?.type !== 'model_output') continue;
    for (const block of step?.content || []) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text);
      }
    }
  }
  return texts.join('\n').trim();
}

async function askGemini({ message, history, context }) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY belum diatur di server');

  const pageContext = {
    app: 'Klik Nusantara',
    audience: 'Siswa SMP',
    role: context?.role || 'siswa',
    active_tab: context?.active_tab || 'beranda',
    province: context?.province || null,
    province_category: context?.province_category || null
  };

  const systemInstruction = `Kamu adalah Bot Nusantara, asisten belajar AI di aplikasi Klik Nusantara untuk siswa SMP Indonesia.
Fokus utama: IPS, geografi Indonesia, masyarakat, budaya, ekonomi dasar, sejarah, keragaman daerah, dan membantu siswa memahami materi Klik Nusantara.
Gunakan Bahasa Indonesia yang ramah, sederhana, jelas, dan sesuai usia SMP. Berikan jawaban yang cukup lengkap agar siswa benar-benar memahami materi, bukan jawaban satu atau dua kalimat saja.
Jika siswa meminta penjelasan suatu konsep, tempat, budaya, peristiwa, atau materi IPS, jelaskan secara terstruktur. Untuk pertanyaan yang membutuhkan penjelasan, gunakan 3–6 paragraf pendek atau poin-poin yang relevan, dan bila cocok sertakan: pengertian, lokasi/konteks, ciri utama, fungsi atau peran, kaitan dengan kehidupan masyarakat, serta contoh. Untuk pertanyaan sederhana, jawaban boleh lebih singkat.
Jika siswa meminta jawaban tugas, bantu memahami konsep dan langkah berpikir, bukan sekadar memberi jawaban tanpa penjelasan.
Jangan mengarang fakta. Jika tidak yakin, katakan bahwa informasi perlu diverifikasi.
Jangan meminta atau mengulang data pribadi sensitif siswa.
Gunakan konteks halaman aplikasi bila relevan: ${JSON.stringify(pageContext)}.
Saat pengguna bertanya "provinsi ini" atau "materi ini", tafsirkan berdasarkan konteks halaman di atas.
Gunakan format yang nyaman dibaca: judul pendek bila perlu, paragraf singkat, dan bullet jika membantu. Hindari mengulang pertanyaan. Akhiri dengan ringkasan satu kalimat bila jawaban cukup panjang.`;

  const transcript = sanitizeHistory(history);
  const currentMessage = String(message || '').slice(0, 5000).trim();
  const input = transcript.length
    ? `Percakapan sebelumnya:\n${transcript.join('\n')}\n\nPertanyaan terbaru dari siswa:\n${currentMessage}`
    : currentMessage;

  // Gemini 3.x untuk pengguna baru menggunakan Interactions API.
  const endpoint = 'https://generativelanguage.googleapis.com/v1/interactions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY
    },
    body: JSON.stringify({
      model: GEMINI_MODEL,
      input,
      system_instruction: systemInstruction,
      store: false,
      generation_config: {
        max_output_tokens: 1800,
        thinking_level: 'low'
      }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error?.message || data?.message || `Gemini API error (${response.status})`;
    throw new Error(msg);
  }

  const text = extractInteractionText(data);
  if (!text) {
    const status = data?.status || 'unknown';
    throw new Error(`Respons Gemini kosong (status: ${status})`);
  }
  return text;
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      ai: Boolean(GEMINI_API_KEY),
      provider: 'gemini',
      model: GEMINI_API_KEY ? GEMINI_MODEL : null
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    try {
      const body = await readJson(req);
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message) return sendJson(res, 400, { error: 'Pesan tidak boleh kosong' });

      const reply = await askGemini({
        message,
        history: body.history,
        context: body.context
      });
      return sendJson(res, 200, { reply, provider: 'gemini', model: GEMINI_MODEL });
    } catch (error) {
      console.error('[Bot Nusantara / Gemini]', error.message);
      return sendJson(res, 500, { error: error.message || 'Gagal menghubungi Gemini' });
    }
  }

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return serveFile(res, path.join(ROOT, 'index.html'), 'text/html; charset=utf-8');
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`Klik Nusantara Gemini: http://${HOST}:${PORT}`);
  console.log(GEMINI_API_KEY
    ? `Gemini aktif (${GEMINI_MODEL}) via Interactions API`
    : 'Gemini belum aktif: set GEMINI_API_KEY untuk mengaktifkan Bot Nusantara.');
});
