const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino   = require('pino');
const qrcode = require('qrcode');
const path   = require('path');

const AUTH_DIR = path.join(__dirname, '..', 'auth_info');

const state = {
  connected: false,
  phone:     null,
  qrBase64:  null,
  sock:      null,
  reconnectAttempts: 0,
};

const MAX_TENTATIVAS = 10;

// Referência ao scheduler para pausar quando desconectar
let _pausarScheduler = null;
let _iniciarScheduler = null;

function setSchedulerCallbacks(iniciar, pausar) {
  _iniciarScheduler = iniciar;
  _pausarScheduler  = pausar;
}

// Cache da versão WA — busca uma vez por processo
let waVersion = null;

async function initWA() {
  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    if (!waVersion) {
      const { version } = await fetchLatestBaileysVersion();
      waVersion = version;
    }

    // Keep-alive com jitter igual ao bot: 55–90s
    const keepAliveMs = 55000 + Math.floor(Math.random() * 35000);

    const sock = makeWASocket({
      version:                        waVersion,
      logger:                         pino({ level: 'silent' }),
      printQRInTerminal:              true,
      auth: {
        creds: authState.creds,
        keys:  makeCacheableSignalKeyStore(authState.keys, pino({ level: 'silent' })),
      },
      browser:                        Browsers.macOS('Safari'),
      markOnlineOnConnect:            false,
      syncFullHistory:                false,
      generateHighQualityLinkPreview: false,
      keepAliveIntervalMs:            keepAliveMs,
      connectTimeoutMs:               60000,
      retryRequestDelayMs:            500,
      getMessage:                     async () => undefined,
    });

    state.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        try {
          state.qrBase64  = await qrcode.toDataURL(qr);
          state.connected = false;
          state.phone     = null;
          console.log('📱 QR Code gerado — escaneie no WhatsApp');
        } catch (err) {
          console.error('Erro ao gerar QR:', err.message);
        }
      }

      if (connection === 'open') {
        state.connected = true;
        state.qrBase64  = null;
        state.phone     = sock.user?.id?.split(':')[0] || null;
        state.reconnectAttempts = 0;
        console.log(`✅ WhatsApp conectado: ${state.phone}`);
        if (_iniciarScheduler) _iniciarScheduler(sock);
      }

      if (connection === 'close') {
        state.connected = false;
        state.sock      = null;
        if (_pausarScheduler) _pausarScheduler();

        const code    = lastDisconnect?.error?.output?.statusCode;
        const logout  = code === DisconnectReason.loggedOut;

        if (logout) {
          console.log('🚪 Sessão encerrada (logout). Aguardando 15s antes de reconectar...');
          state.qrBase64 = null;
          await new Promise(r => setTimeout(r, 15000));
          state.reconnectAttempts = 0;
          initWA();
          return;
        }

        state.reconnectAttempts++;

        if (state.reconnectAttempts > MAX_TENTATIVAS) {
          console.log(`❌ ${MAX_TENTATIVAS} tentativas falham. Aguardando 60s antes de tentar novamente...`);
          await new Promise(r => setTimeout(r, 60000));
          state.reconnectAttempts = 0;
          initWA();
          return;
        }

        // Backoff exponencial: 3s, 6s, 12s, 24s, 48s... até 120s
        const delay = Math.min(3000 * Math.pow(2, state.reconnectAttempts - 1), 120000);
        console.log(`⚠️  Conexão encerrada (tentativa ${state.reconnectAttempts}/${MAX_TENTATIVAS}). Reconectando em ${delay / 1000}s...`);
        await new Promise(r => setTimeout(r, delay));
        initWA();
      }
    });

  } catch (err) {
    console.error('Erro ao iniciar WhatsApp:', err.message);
    setTimeout(initWA, 10000);
  }
}

function getState()    { return state; }
function getSock()     { return state.sock; }
function isConnected() { return state.connected && !!state.sock; }

async function disconnect() {
  if (state.sock) {
    try { await state.sock.logout(); } catch (_) {}
    state.sock      = null;
    state.connected = false;
    state.phone     = null;
    state.qrBase64  = null;
    if (_pausarScheduler) _pausarScheduler();
    console.log('🔴 WhatsApp desconectado manualmente.');
  }
}

module.exports = { initWA, getState, getSock, isConnected, disconnect, setSchedulerCallbacks };
