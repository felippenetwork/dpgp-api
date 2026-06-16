const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const TMP_DIR    = path.join(UPLOAD_DIR, '_tmp');

[UPLOAD_DIR, TMP_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const ALLOWED  = /\.(jpeg|jpg|png|gif|webp|mp4|mov|avi|webm|mp3|ogg|aac|m4a|wav)$/i;
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// POST /api/upload/start — inicia um upload chunked
router.post('/start', express.json({ limit: '1kb' }), (req, res) => {
  const uploadId = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.join(TMP_DIR, uploadId), { recursive: true });
  res.json({ success: true, uploadId });
});

// POST /api/upload/chunk — recebe um pedaço do arquivo
router.post('/chunk', express.json({ limit: '800kb' }), (req, res) => {
  const { uploadId, index, data } = req.body || {};
  if (!uploadId || index === undefined || !data) {
    return res.status(400).json({ success: false, error: 'Parâmetros inválidos' });
  }
  const dir = path.join(TMP_DIR, uploadId);
  if (!fs.existsSync(dir)) {
    return res.status(400).json({ success: false, error: 'Upload não encontrado' });
  }
  // salva chunk como arquivo de texto (base64 parcial)
  fs.writeFileSync(path.join(dir, String(index).padStart(8, '0')), data, 'utf8');
  res.json({ success: true });
});

// POST /api/upload/finish — monta o arquivo final
router.post('/finish', express.json({ limit: '10kb' }), (req, res) => {
  const { uploadId, filename } = req.body || {};
  if (!uploadId || !filename) {
    return res.status(400).json({ success: false, error: 'Parâmetros inválidos' });
  }

  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED.test(ext)) {
    return res.status(400).json({ success: false, error: 'Tipo de arquivo não permitido' });
  }

  const dir = path.join(TMP_DIR, uploadId);
  if (!fs.existsSync(dir)) {
    return res.status(400).json({ success: false, error: 'Upload não encontrado' });
  }

  const parts    = fs.readdirSync(dir).sort();
  const allB64   = parts.map(p => fs.readFileSync(path.join(dir, p), 'utf8')).join('');
  const buffer   = Buffer.from(allB64, 'base64');

  // limpa tmp independente do resultado
  fs.rmSync(dir, { recursive: true, force: true });

  if (buffer.length > MAX_SIZE) {
    return res.status(413).json({ success: false, error: 'Arquivo muito grande (máx. 50 MB)' });
  }

  const name     = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const url      = `${protocol}://${req.get('host')}/uploads/${name}`;

  res.json({ success: true, url, filename: name, size: buffer.length });
});

// DELETE /api/upload/:filename
router.delete('/:filename', (req, res) => {
  const file = path.join(UPLOAD_DIR, path.basename(req.params.filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

module.exports = router;
