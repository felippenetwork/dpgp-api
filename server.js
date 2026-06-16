const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const { initWA, setSchedulerCallbacks }          = require('./utils/whatsapp');
const { startScheduler, iniciarScheduler, pausarScheduler } = require('./utils/scheduler');

const app     = express();
const PORT    = process.env.SERVER_PORT || process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || 'dpgp-secret-key';

// ── Garante diretórios ──
['data', 'auth_info'].forEach(d => {
  const p = path.join(__dirname, d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ── Middleware ──
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// ── Auth middleware ──
// /api/status e /api/qr são públicos (o site precisa consultar sem API Key)
const PUBLIC_PATHS = ['/status', '/qr'];
app.use('/api', (req, res, next) => {
  if (PUBLIC_PATHS.includes(req.path)) return next();
  const key = req.headers['x-api-key'];
  if (key !== API_KEY) {
    return res.status(401).json({ success: false, error: 'API Key inválida' });
  }
  next();
});

// ── Rotas ──
app.use('/api',          require('./routes/status'));
app.use('/api/sync',     require('./routes/sync'));
app.use('/api/history',  require('./routes/history'));
app.use('/api/dispatch', require('./routes/dispatch'));

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ service: 'DPGP API', version: '1.0.0', status: 'online' });
});

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n🚀 DPGP API rodando na porta ${PORT}`);
  console.log(`🔑 API Key: ${API_KEY}`);
  console.log(`📡 Iniciando WhatsApp...\n`);

  // Liga o scheduler ao whatsapp: quando conectar -> iniciarScheduler, quando desconectar -> pausarScheduler
  setSchedulerCallbacks(iniciarScheduler, pausarScheduler);

  startScheduler();
  initWA();
});
