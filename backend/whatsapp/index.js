const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const http = require('http');
const fs = require('fs');

const BACKEND_URL = 'http://localhost:8090/api/whatsapp';

let currentSock = null;
let isDisconnecting = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_state');
    
    // Fetch latest WhatsApp version to avoid 405 WebSocket errors
    let version;
    try {
        const versionResult = await fetchLatestBaileysVersion();
        version = versionResult.version;
        console.log(`Using WA version: ${version.join('.')}`);
    } catch (err) {
        console.error('Failed to fetch latest WA version, using default.', err.message);
    }
    
    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome')
    });
    
    currentSock = sock;
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('QR Code received, updating backend...');
            try {
                await axios.post(`${BACKEND_URL}/status-update`, {
                    status: 'qrcode',
                    qr: qr
                });
            } catch (err) {
                console.error('Error posting QR to backend:', err.message);
            }
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            const shouldReconnect = !isDisconnecting && statusCode !== DisconnectReason.loggedOut;
            console.log(`Connection closed (status: ${statusCode}). Reconnecting:`, shouldReconnect);
            
            try {
                await axios.post(`${BACKEND_URL}/status-update`, {
                    status: (isDisconnecting || statusCode === DisconnectReason.loggedOut) ? 'disconnected' : 'connecting',
                    phone: isDisconnecting ? '' : undefined,
                    qr: ''
                });
            } catch (err) {}
            
            if (shouldReconnect) {
                setTimeout(startBot, 5000);
            }
        } else if (connection === 'open') {
            console.log('Connection opened successfully!');
            const userPhone = sock.user.id.split(':')[0];
            try {
                await axios.post(`${BACKEND_URL}/status-update`, {
                    status: 'connected',
                    phone: userPhone,
                    qr: ''
                });
            } catch (err) {}
        }
    });
    
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        if (!msg.message) return;
        if (msg.key.fromMe) return; // Ignore own messages
        
        const sender = msg.key.remoteJid;
        // Ignore group messages (group JIDs end in @g.us)
        if (sender.endsWith('@g.us')) return;

        // Extract text message content
        const text = msg.message.conversation || 
                     (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) || 
                     '';
                     
        if (!text) return;
        
        console.log(`Received message from ${sender}: ${text}`);
        
        try {
            // Post message to backend webhook
            const res = await axios.post(`${BACKEND_URL}/webhook`, {
                sender: sender.split('@')[0], // strip domain
                text: text
            });
            
            const reply = res.data.reply;
            if (reply) {
                await sock.sendMessage(sender, { text: reply });
                console.log(`Sent reply to ${sender}: ${reply}`);
            }
        } catch (err) {
            console.error('Error in message webhook handler:', err.message);
        }
    });
}

// HTTP control server for commands from FastAPI backend
const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/disconnect') {
        console.log('Received disconnect request from admin panel...');
        try {
            isDisconnecting = true;
            if (currentSock) {
                try {
                    await currentSock.logout();
                } catch (e) {
                    try { currentSock.end(undefined); } catch (_) {}
                }
                currentSock = null;
            }
            if (fs.existsSync('auth_state')) {
                fs.rmSync('auth_state', { recursive: true, force: true });
                console.log('Deleted auth_state credentials.');
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));

            setTimeout(() => {
                isDisconnecting = false;
                startBot();
            }, 1000);
        } catch (err) {
            console.error('Error handling disconnect request:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
    } else {
        res.writeHead(404);
        res.end();
    }
});

server.listen(8091, '127.0.0.1', () => {
    console.log('WhatsApp control server listening on http://127.0.0.1:8091');
});

startBot();

