const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const SMTP_PORT = 2525;
const DB_PATH = path.join(__dirname, 'database.json');
const SCRIPTS_DIR = path.join(__dirname, 'scripts');

// Ensure Scripts Directory exists
if (!fs.existsSync(SCRIPTS_DIR)) {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
}

// ----------------------------------------------------
// DATABASE INITIALIZATION & OPERATIONS
// ----------------------------------------------------
function getInitialDB() {
  return {
    adminPassword: 'avoidkxrried_owner',
    mainEmails: [
      { id: '1', email: 'owner@avoidkxrried.com', label: 'Primary Tracking Account' }
    ],
    accounts: [
      { id: 'acc_1', email: 'buyer1@avoidkxrried.com', password: 'buyerpassword123', ubiLinked: 'R6_Smurf_Level50' }
    ],
    emails: [
      {
        id: 'mail_init',
        recipient: 'buyer1@avoidkxrried.com',
        sender: 'support@ubisoft.com',
        subject: 'Ubisoft Account Verification - R6 Account Transfer',
        date: new Date().toUTCString(),
        body: 'Hello Player,\r\n\r\nTo complete your account security update, please enter the following verification code:\r\n\r\n681934\r\n\r\nIf you did not request this change, please contact support immediately.\r\n\r\nBest regards,\r\nUbisoft Security Team',
        receivedAt: new Date().toISOString()
      }
    ],
    logs: [
      { timestamp: new Date().toISOString(), message: 'System initialized. avoidkxrried Engine running.' }
    ]
  };
}

function loadDatabase() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initData = getInitialDB();
      fs.writeFileSync(DB_PATH, JSON.stringify(initData, null, 2), 'utf-8');
      return initData;
    }
    const content = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error('Database load error, resetting to default:', e);
    return getInitialDB();
  }
}

function saveDatabase(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error('Database write error:', e);
  }
}

function addLog(message) {
  const db = loadDatabase();
  db.logs.unshift({
    timestamp: new Date().toISOString(),
    message
  });
  if (db.logs.length > 100) {
    db.logs = db.logs.slice(0, 100);
  }
  saveDatabase(db);
}

// ----------------------------------------------------
// EMAIL PARSING ENGINE (DEPENDENCY-FREE)
// ----------------------------------------------------
function parseRawEmail(raw) {
  const parts = raw.split('\r\n\r\n');
  const headersText = parts[0];
  const bodyText = parts.slice(1).join('\r\n\r\n');
  
  const headers = {};
  const headerLines = headersText.split('\r\n');
  let lastHeader = null;
  
  for (let line of headerLines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (lastHeader) {
        headers[lastHeader] += ' ' + line.trim();
      }
    } else {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.substring(0, idx).trim().toLowerCase();
        const value = line.substring(idx + 1).trim();
        headers[key] = value;
        lastHeader = key;
      }
    }
  }
  
  let subject = headers['subject'] || '(No Subject)';
  let date = headers['date'] || new Date().toUTCString();
  let body = bodyText;
  
  const transferEncoding = headers['content-transfer-encoding'] || '';
  if (transferEncoding.toLowerCase().includes('quoted-printable')) {
    body = bodyText
      .replace(/=\r\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
  } else if (transferEncoding.toLowerCase().includes('base64')) {
    try {
      const cleaned = bodyText.replace(/\s+/g, '');
      body = Buffer.from(cleaned, 'base64').toString('utf-8');
    } catch (e) {
      console.error('Base64 decode failed:', e);
    }
  }
  
  return {
    subject,
    date,
    body,
    headers
  };
}

// ----------------------------------------------------
// SSE (SERVER-SENT EVENTS) FOR LIVE INBOX REFRESH
// ----------------------------------------------------
let sseClients = [];
function handleSse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  res.write('data: {"status":"connected"}\n\n');
  
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);
  
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
}

function broadcastEmailUpdate() {
  const payload = JSON.stringify({ type: 'NEW_MAIL', timestamp: new Date().toISOString() });
  sseClients.forEach(client => {
    client.res.write(`data: ${payload}\n\n`);
  });
}

// ----------------------------------------------------
// LOCAL SMTP RECEIVER (INCOMING ONLY)
// ----------------------------------------------------
const smtpServer = net.createServer((socket) => {
  let state = 'HELO';
  let emailData = '';
  let mailFrom = '';
  let rcptTo = [];
  
  socket.setTimeout(30000);
  socket.write('220 avoidkxrried.com ESMTP Postfix\r\n');
  
  socket.on('timeout', () => {
    socket.write('421 Connection timeout, closing socket.\r\n');
    socket.end();
  });
  
  socket.on('error', (err) => {
    console.error('SMTP Socket error:', err.message);
  });

  socket.on('data', (data) => {
    const lines = data.toString().split('\r\n');
    for (let line of lines) {
      if (!line && state !== 'DATA') continue;
      
      const upper = line.toUpperCase().trim();
      
      if (upper.startsWith('QUIT')) {
        socket.write('221 2.0.0 Bye\r\n');
        socket.end();
        return;
      }
      
      if (state === 'DATA') {
        if (line.trim() === '.') {
          state = 'HELO';
          
          const parsed = parseRawEmail(emailData);
          const db = loadDatabase();
          let emailSaved = false;
          
          for (let recipient of rcptTo) {
            const emailAddress = recipient.toLowerCase();
            const account = db.accounts.find(a => a.email.toLowerCase() === emailAddress);
            if (account) {
              const newMail = {
                id: 'mail_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                recipient: emailAddress,
                sender: mailFrom,
                subject: parsed.subject,
                date: parsed.date,
                body: parsed.body,
                receivedAt: new Date().toISOString()
              };
              db.emails.push(newMail);
              emailSaved = true;
              addLog(`SMTP: Received mail for ${emailAddress} from ${mailFrom}`);
            }
          }
          
          if (emailSaved) {
            saveDatabase(db);
            broadcastEmailUpdate();
            socket.write('250 2.0.0 Ok: queued\r\n');
          } else {
            socket.write('250 2.0.0 Ok: queued (filtered)\r\n');
          }
          
          emailData = '';
          mailFrom = '';
          rcptTo = [];
        } else {
          let cleanLine = line;
          if (line.startsWith('..')) {
            cleanLine = line.substring(1);
          }
          emailData += cleanLine + '\r\n';
        }
        continue;
      }
      
      if (upper.startsWith('HELO') || upper.startsWith('EHLO')) {
        socket.write('250-avoidkxrried.com\r\n250-8BITMIME\r\n250 SMTPUTF8\r\n');
      } else if (upper.startsWith('MAIL FROM:')) {
        const match = line.match(/FROM:\s*<([^>]+)>/i) || line.match(/FROM:\s*([^\s]+)/i);
        mailFrom = match ? match[1].trim() : 'unknown@sender.com';
        socket.write('250 2.1.0 Ok\r\n');
      } else if (upper.startsWith('RCPT TO:')) {
        const match = line.match(/TO:\s*<([^>]+)>/i) || line.match(/TO:\s*([^\s]+)/i);
        if (match) {
          rcptTo.push(match[1].trim().toLowerCase());
          socket.write('250 2.1.5 Ok\r\n');
        } else {
          socket.write('501 5.5.4 Invalid recipient format\r\n');
        }
      } else if (upper.startsWith('DATA')) {
        state = 'DATA';
        socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
      } else if (upper.startsWith('RSET')) {
        emailData = '';
        mailFrom = '';
        rcptTo = [];
        state = 'HELO';
        socket.write('250 2.0.0 Ok\r\n');
      } else if (upper.startsWith('NOOP')) {
        socket.write('250 2.0.0 Ok\r\n');
      } else {
        socket.write('502 5.5.1 Command not recognized\r\n');
      }
    }
  });
});

smtpServer.listen(SMTP_PORT, '0.0.0.0', () => {
  console.log(`[SMTP] Native Receiver listening on port ${SMTP_PORT}`);
});

// ----------------------------------------------------
// WEB SERVER (HTTP ROUTER)
// ----------------------------------------------------
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ----------------------------------------------------
  // CLIENT API ENDPOINTS
  // ----------------------------------------------------
  if (method === 'POST' && pathname === '/api/incoming-email') {
    const bodyData = await parseBody(req);
    const db = loadDatabase();
    
    const recipient = (bodyData.recipient || bodyData.to || '').toLowerCase().trim();
    const sender = (bodyData.sender || bodyData.from || 'support@ubisoft.com').trim();
    const subject = (bodyData.subject || 'Ubisoft Verification').trim();
    const emailBody = (bodyData.body || bodyData.text || bodyData.html || '').trim();

    if (!recipient || !emailBody) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid webhook email structure' }));
      return;
    }

    const account = db.accounts.find(a => a.email.toLowerCase() === recipient);
    if (account) {
      const newMail = {
        id: 'mail_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        recipient,
        sender,
        subject,
        date: new Date().toUTCString(),
        body: emailBody,
        receivedAt: new Date().toISOString()
      };
      db.emails.push(newMail);
      saveDatabase(db);
      addLog(`Webhook: Received mail for ${recipient} from ${sender}`);
      broadcastEmailUpdate();
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Filtered (No active customer linked)' }));
    }
    return;
  }

  if (method === 'POST' && pathname === '/api/login') {
    const { email, password } = await parseBody(req);
    const db = loadDatabase();
    
    if (!email || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email and password are required' }));
      return;
    }

    const account = db.accounts.find(
      a => a.email.toLowerCase() === email.toLowerCase().trim() && a.password === password
    );

    if (account) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, email: account.email, ubiLinked: account.ubiLinked }));
      addLog(`Buyer logged in: ${account.email}`);
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid email portal credentials' }));
      addLog(`Failed buyer login attempt: ${email}`);
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/emails') {
    const emailQuery = parsedUrl.searchParams.get('email');
    if (!emailQuery) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing account email parameter' }));
      return;
    }

    const db = loadDatabase();
    const inboxMails = db.emails
      .filter(m => m.recipient.toLowerCase() === emailQuery.toLowerCase())
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(inboxMails));
    return;
  }

  if (method === 'GET' && pathname === '/api/sse') {
    handleSse(req, res);
    return;
  }

  // ----------------------------------------------------
  // ADMIN CONSOLE API
  // ----------------------------------------------------
  if (method === 'POST' && pathname === '/api/admin/login') {
    const { password } = await parseBody(req);
    const db = loadDatabase();

    if (password === db.adminPassword) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      addLog('Administrator authenticated.');
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid Owner Password' }));
      addLog('Failed administrator login.');
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/admin/data') {
    const db = loadDatabase();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      accounts: db.accounts,
      emailsCount: db.emails.length,
      mainEmails: db.mainEmails,
      logs: db.logs
    }));
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/add-account') {
    const { username, domain, password, ubiLinked } = await parseBody(req);
    const db = loadDatabase();

    if (!username || !domain || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required parameters' }));
      return;
    }

    const email = `${username}@${domain}`.toLowerCase().trim();
    if (db.accounts.find(a => a.email === email)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email already exists' }));
      return;
    }

    const newAcc = {
      id: 'acc_' + Date.now(),
      email,
      password,
      ubiLinked: ubiLinked || 'None Linked'
    };

    db.accounts.push(newAcc);
    saveDatabase(db);
    addLog(`Admin generated custom linked mailbox: ${email}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, account: newAcc }));
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/change-password') {
    const { email, newPassword } = await parseBody(req);
    const db = loadDatabase();

    const account = db.accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
    if (!account) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Mailbox account not found' }));
      return;
    }

    account.password = newPassword;
    saveDatabase(db);
    addLog(`Admin updated password for account: ${email}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/delete-account') {
    const { email } = await parseBody(req);
    const db = loadDatabase();

    db.accounts = db.accounts.filter(a => a.email.toLowerCase() !== email.toLowerCase().trim());
    db.emails = db.emails.filter(m => m.recipient.toLowerCase() !== email.toLowerCase().trim());
    
    saveDatabase(db);
    addLog(`Admin deleted custom linked mailbox: ${email}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/add-main-email') {
    const { email, label } = await parseBody(req);
    const db = loadDatabase();

    if (!email) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Email address required' }));
      return;
    }

    const newMain = {
      id: 'main_' + Date.now(),
      email: email.trim(),
      label: label || 'Linked Account'
    };

    db.mainEmails.push(newMain);
    saveDatabase(db);
    addLog(`Admin registered primary tracked email: ${email}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, mainEmail: newMain }));
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/delete-main-email') {
    const { id } = await parseBody(req);
    const db = loadDatabase();

    db.mainEmails = db.mainEmails.filter(m => m.id !== id);
    saveDatabase(db);
    addLog(`Admin deleted primary email link: ${id}`);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/inject-email') {
    const { recipient, sender, subject, body } = await parseBody(req);
    const db = loadDatabase();

    const account = db.accounts.find(a => a.email.toLowerCase() === recipient.toLowerCase().trim());
    if (!account) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Recipient email not configured' }));
      return;
    }

    const newMail = {
      id: 'mail_' + Date.now(),
      recipient: recipient.toLowerCase().trim(),
      sender: sender || 'support@ubisoft.com',
      subject: subject || 'Ubisoft Verification Code',
      date: new Date().toUTCString(),
      body: body || 'Enter the code 693240 to confirm your R6 account changes.',
      receivedAt: new Date().toISOString()
    };

    db.emails.push(newMail);
    saveDatabase(db);
    addLog(`Admin injected simulated email for ${recipient}`);
    broadcastEmailUpdate();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, mail: newMail }));
    return;
  }

  if (method === 'POST' && pathname === '/api/admin/run-tool') {
    const { tool } = await parseBody(req);
    const allowedTools = ['clean_temp', 'clean_browser', 'sus_login', 'auto_signout'];
    
    if (!allowedTools.includes(tool)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown utility request' }));
      return;
    }

    const scriptPath = path.join(SCRIPTS_DIR, `${tool}.ps1`);
    if (!fs.existsSync(scriptPath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Utility script ${tool}.ps1 not found.` }));
      return;
    }

    addLog(`Running administrator optimization utility: ${tool}`);
    
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`;
    exec(cmd, (error, stdout, stderr) => {
      let output = stdout || '';
      if (stderr) {
        output += `\n[Log Output]:\n${stderr}`;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: !error, output }));
      addLog(`Completed utility task: ${tool}`);
    });
    return;
  }

  // ----------------------------------------------------
  // STATIC FILES
  // ----------------------------------------------------
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  
  const relative = path.relative(path.join(__dirname, 'public'), filePath);
  if (relative && relative.startsWith('..')) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  if (!path.extname(filePath)) {
    if (fs.existsSync(filePath + '.html')) {
      filePath += '.html';
    } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
      filePath = path.join(filePath, 'index.html');
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[WEB] avoidkxrried Server running on http://localhost:${PORT}`);
});
