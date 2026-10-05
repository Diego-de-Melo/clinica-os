import fs from 'fs';
const c = fs.readFileSync('src/routes/_app/pacientes.$id.tsx', 'utf8');
const lines = c.split('\n');
console.log('line 193 bytes:', Buffer.from(lines[192]).toString('hex'));
console.log('line 320 bytes:', Buffer.from(lines[319]).toString('hex'));