KLIK NUSANTARA - VERSI SIAP HOSTING DI RENDER

Isi folder:
- index.html
- server.js
- package.json
- .gitignore

PENTING:
Jangan menulis GEMINI_API_KEY di index.html, server.js, package.json, atau GitHub.
API key dimasukkan melalui Environment Variables di dashboard Render.

RENDER:
1. Upload semua file dalam folder ini ke sebuah repository GitHub.
2. Di Render pilih New > Web Service.
3. Hubungkan repository GitHub tersebut.
4. Runtime/Language: Node.
5. Build Command: npm install
6. Start Command: npm start
7. Pilih Free plan untuk prototipe bila tersedia.
8. Di Environment Variables tambahkan:
   GEMINI_API_KEY = [API KEY GEMINI ANDA]
9. Opsional:
   GEMINI_MODEL = gemini-3.6-flash
10. Deploy.

Setelah deploy selesai, Render memberi URL publik seperti:
https://klik-nusantara.onrender.com

Catatan: Free Web Service dapat sleep saat lama tidak diakses, sehingga pembukaan pertama setelah idle bisa lebih lambat.
