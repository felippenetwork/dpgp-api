const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = /\.(jpeg|jpg|png|gif|webp|mp4|mov|avi|webm|mp3|ogg|aac|m4a|wav)$/i;
const MAX_BYTES = 50 * 1024 * 1024; // 50MB

// POST /api/upload  — body: { filename: string, data: base64 string }
router.post('/', express.json({ limit: '70mb' }), (req, res) => {
  const { filename, data } = req.body || {};
  if (!filename || !data) {
    return res.status(400).json({ success: false, error: 'Parâmetros inválidos (filename e data obrigatórios)' });
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED.test(ext)) {
    return res.status(400).json({ success: false, error: 'Tipo de arquivo não permitido' });
  }

  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > MAX_BYTES) {
    return res.status(413).json({ success: false, error: 'Arquivo muito grande (máx. 50 MB)' });
  }

  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);

  const host     = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const url      = `${protocol}://${host}/uploads/${name}`;

  res.json({ success: true, url, filename: name, size: buffer.length });
});

// DELETE /api/upload/:filename
router.delete('/:filename', (req, res) => {
  const file = path.join(UPLOAD_DIR, path.basename(req.params.filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

module.exports = router;
