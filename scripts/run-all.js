/**
 * เปิดทั้งระบบด้วยคำสั่งเดียว: server หลัก (Gateway) + ทุก service ใน config.services
 *   npm run dev:all    → แก้ไฟล์แล้วรีสตาร์ทเอง (ใช้ตอนพัฒนา)
 *   npm run start:all  → ถ้า service ไหนดับ จะเปิดกลับเองใน 3 วินาที (ใช้วัน demo สาธิต "ระบบซ่อมตัวเอง")
 * ตั้ง DB_PORT ก่อนรันเหมือนเดิม เช่น cmd: set "DB_PORT=3307" && npm run dev:all
 */
const { spawn } = require('child_process');
const path = require('path');
const config = require('../config');

const watch = process.argv.includes('--watch');
const root = path.join(__dirname, '..');
const procs = [
  { name: 'main', file: 'server.js' },
  ...Object.keys(config.services).map((name) => ({ name, file: `services/${name}/index.js` })),
];

let stopping = false;
const children = new Map();

function start(p) {
  const args = watch ? ['--watch', p.file] : [p.file];
  const child = spawn(process.execPath, args, { cwd: root, env: process.env });
  children.set(p.name, child);
  const prefix = `[${p.name}]`.padEnd(12);
  const pipe = (stream, out) => stream.on('data', (d) => {
    for (const line of String(d).split(/\r?\n/)) if (line) out.write(`${prefix}${line}\n`);
  });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    children.delete(p.name);
    if (stopping) return;
    console.log(`${prefix}ดับ (code ${code}) → เปิดใหม่ใน 3 วินาที`);
    setTimeout(() => { if (!stopping) start(p); }, 3000);
  });
}

procs.forEach(start);
console.log(`เปิด ${procs.length} ระบบ: ${procs.map((p) => p.name).join(', ')}${watch ? ' (โหมดพัฒนา)' : ''} · กด Ctrl+C เพื่อปิดทั้งหมด`);

function stopAll() {
  stopping = true;
  for (const c of children.values()) c.kill();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
