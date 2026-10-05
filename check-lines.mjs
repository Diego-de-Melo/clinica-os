import fs from 'fs';
const c = fs.readFileSync('src/routes/_app/pacientes.$id.tsx', 'utf8');
const lines = c.split('\n');
for (let i = 190; i < 200; i++) console.log(i + ':', JSON.stringify(lines[i]));
for (let i = 318; i < 325; i++) console.log(i + ':', JSON.stringify(lines[i]));