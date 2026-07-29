const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = 'http://localhost:8090/api/whatsapp';
const AUTH_DIR = path.resolve(__dirname, 'auth_state');

let currentSock = null;
let isDisconnecting = false;

const CONTACTS_CACHE_FILE = path.resolve(__dirname, 'contacts_cache.json');
let knownContacts = {};
if (fs.existsSync(CONTACTS_CACHE_FILE)) {
    try {
        const parsed = JSON.parse(fs.readFileSync(CONTACTS_CACHE_FILE, 'utf-8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            knownContacts = parsed;
        }
    } catch (e) {}
}

function saveContactsCache() {
    try {
        fs.writeFileSync(CONTACTS_CACHE_FILE, JSON.stringify(knownContacts || {}, null, 2));
    } catch (e) {}
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    
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



    // Track contacts & pushName updates
    sock.ev.on('contacts.upsert', (contacts) => {
        for (const c of contacts) {
            if (c.id && !c.id.endsWith('@g.us')) {
                const phone = c.id.split('@')[0];
                const name = c.name || c.notify || c.verifiedName || '';
                if (phone) {
                    knownContacts[phone] = {
                        phone,
                        name: name || knownContacts[phone]?.name || ''
                    };
                }
            }
        }
        saveContactsCache();
    });

    sock.ev.on('chats.upsert', (chats) => {
        for (const chat of chats) {
            if (chat.id && !chat.id.endsWith('@g.us')) {
                const phone = chat.id.split('@')[0];
                const name = chat.name || chat.notify || '';
                if (phone) {
                    knownContacts[phone] = {
                        phone,
                        name: name || knownContacts[phone]?.name || ''
                    };
                }
            }
        }
        saveContactsCache();
    });

    sock.ev.on('chats.set', ({ chats }) => {
        if (chats) {
            for (const chat of chats) {
                if (chat.id && !chat.id.endsWith('@g.us')) {
                    const phone = chat.id.split('@')[0];
                    const name = chat.name || chat.notify || '';
                    if (phone) {
                        knownContacts[phone] = {
                            phone,
                            name: name || knownContacts[phone]?.name || ''
                        };
                    }
                }
            }
            saveContactsCache();
        }
    });

    sock.ev.on('messaging-history.set', ({ contacts, chats, messages }) => {
        if (contacts) {
            for (const c of contacts) {
                if (c.id && !c.id.endsWith('@g.us')) {
                    const phone = c.id.split('@')[0];
                    const name = c.name || c.notify || c.verifiedName || '';
                    if (phone) {
                        knownContacts[phone] = {
                            phone,
                            name: name || knownContacts[phone]?.name || ''
                        };
                    }
                }
            }
        }
        if (chats) {
            for (const chat of chats) {
                if (chat.id && !chat.id.endsWith('@g.us')) {
                    const phone = chat.id.split('@')[0];
                    const name = chat.name || chat.notify || '';
                    if (phone) {
                        knownContacts[phone] = {
                            phone,
                            name: name || knownContacts[phone]?.name || ''
                        };
                    }
                }
            }
        }
        if (messages) {
            for (const msg of messages) {
                const sender = msg.key?.remoteJid;
                if (sender && !sender.endsWith('@g.us')) {
                    const phone = sender.split('@')[0];
                    const pushName = msg.pushName || '';
                    if (phone) {
                        if (!knownContacts[phone]) knownContacts[phone] = { phone, name: pushName };
                        else if (pushName && !knownContacts[phone].name) knownContacts[phone].name = pushName;
                    }
                }
            }
        }
        saveContactsCache();
    });

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify') return;
        const msg = m.messages[0];
        const sender = msg.key.remoteJid;
        if (!sender || sender.endsWith('@g.us')) return;

        const phone = sender.split('@')[0];
        if (msg.pushName) {
            if (!knownContacts[phone]) knownContacts[phone] = { phone, name: msg.pushName };
            else if (!knownContacts[phone].name) knownContacts[phone].name = msg.pushName;
        }

        if (msg.key.fromMe) {
            const recipient = msg.key.remoteJid;
            if (recipient && !recipient.endsWith('@g.us')) {
                const cleanRecipient = recipient.split('@')[0];
                const text = (msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text || 
                              '').toLowerCase().trim();
                
                let commandAction = 'pause';
                if (text.includes('#bot') || text.includes('#reactivar') || text.includes('#reanudar')) {
                    commandAction = 'unpause';
                }
                
                console.log(`[Human Operator Message] Operator wrote to ${cleanRecipient} (action: ${commandAction}). Notifying backend...`);
                axios.post(`${BACKEND_URL}/human-activity`, { sender: cleanRecipient, action: commandAction })
                     .catch(err => console.error('Error posting human activity to backend:', err.message));
            }
            return;
        }
        
        // Extract text message content
        const text = msg.message?.conversation || 
                     (msg.message?.extendedTextMessage && msg.message.extendedTextMessage.text) || 
                     '';
                     
        if (!text) return;
        
        console.log(`Received message from ${sender}: ${text}`);
        
        try {
            // Post message to backend webhook
            const res = await axios.post(`${BACKEND_URL}/webhook`, {
                sender: phone,
                pushName: msg.pushName || '',
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
            if (fs.existsSync(AUTH_DIR)) {
                fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                console.log(`Deleted auth_state credentials at ${AUTH_DIR}`);
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
    } else if ((req.method === 'GET' || req.method === 'POST') && req.url === '/sync-contacts') {
        try {
            console.log('Received sync-contacts request...');
            const contactsList = Object.values(knownContacts || {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, count: contactsList.length, contacts: contactsList }));
        } catch (err) {
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

