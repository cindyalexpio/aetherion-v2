const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const ROOT = 'C:\\Users\\alexp\\Documents\\Default Project\\aetherion-live';
const AUTH = 'C:\\Users\\alexp\\AppData\\Roaming\\xdg.data\\com.vercel.cli\\auth.json';
const PROJECT = 'aetherion-live';
const TEAM = 'cindyalexpios-projects';

const authRaw = fs.readFileSync(AUTH, 'utf8');
const auth = JSON.parse(authRaw);
const token = auth.token;

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '.git' || e.name === '.vercel' || e.name === 'node_modules') continue;
      walk(full, base, out);
    } else {
      out.push({ abs: full, rel: path.relative(base, full).replace(/\\/g, '/') });
    }
  }
  return out;
}

function gzipFiles(files) {
  const zlib = require('zlib');
  const chunks = [];
  const header = Buffer.alloc(512);
  const dataChunks = [];

  let offset = 0;
  for (const f of files) {
    const content = fs.readFileSync(f.abs);
    const nameBuf = Buffer.from(f.rel, 'utf8');
    const fileHeader = Buffer.alloc(512);
    fileHeader.write(nameBuf.toString('utf8'), 0, nameBuf.length, 'utf8');
    fileHeader.write('0000644', 100, 7, 'ascii');
    fileHeader.write('0000000', 108, 7, 'ascii');
    fileHeader.write('0000000', 116, 7, 'ascii');
    fileHeader.write(String(content.length).padStart(11, '0') + '0', 124, 12, 'ascii');
    fileHeader.write('00000000000\0', 136, 13, 'ascii');
    fileHeader.write('ustar ', 257, 6, 'ascii');
    fileHeader.write('00', 263, 2, 'ascii');
    fileHeader.write('root', 265, 4, 'ascii');
    fileHeader.write('root', 297, 4, 'ascii');
    fileHeader.write(' '.repeat(155), 0, 155, 'ascii');
    const sum = fileHeader.reduce((a, b) => a + b, 0);
    fileHeader.write(String(sum).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    dataChunks.push(fileHeader, content);
    const rem = content.length % 512;
    if (rem !== 0) dataChunks.push(Buffer.alloc(512 - rem));
  }
  const end = Buffer.alloc(1024);
  dataChunks.push(end);
  const tar = Buffer.concat(dataChunks);
  return zlib.gzipSync(tar);
}

const files = walk(ROOT);
console.log(`Files to deploy: ${files.length}`);

const body = gzipFiles(files);
console.log(`Tar.gz size: ${(body.length / 1024).toFixed(0)} KB`);

const boundary = '----vercel' + Date.now().toString(16);
const meta = JSON.stringify({
  name: PROJECT,
  project: PROJECT,
  target: 'production',
  projectSettings: { framework: null, buildCommand: null, outputDirectory: null, rootDirectory: null },
  routes: [{ src: '/(.*)', dest: '/$1' }]
});

const pre = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="deployment.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`);
const post = Buffer.from(`\r\n--${boundary}--\r\n`);
const payload = Buffer.concat([pre, body, post]);

const req = https.request({
  hostname: 'api.vercel.com',
  path: '/v13/deployments?teamId=' + TEAM,
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': payload.length
  }
}, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => {
    try {
      const j = JSON.parse(data);
      console.log('Deployment ID:', j.id);
      console.log('Status:', j.readyState);
      console.log('URL:', j.url);
      fs.writeFileSync('C:\\Users\\alexp\\Documents\\Default Project\\aetherion-live\\deployment.json', JSON.stringify(j, null, 2));
    } catch (e) {
      console.log('Response:', data.substring(0, 2000));
    }
    if (!j.id) {
      console.log('Full response:', data.substring(0, 3000));
    }
  });
});
req.on('error', (e) => console.error('Error:', e.message));
req.on('response', (res) => {
  console.log('HTTP status:', res.statusCode);
});
req.write(payload);
req.end();
