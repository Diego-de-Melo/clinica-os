const fs = require('fs');
const c = fs.readFileSync('src/routes/_app/pacientes.$id.tsx', 'utf8');
const lines = c.split('\n');
for (let i = 188; i < 200; i++) console.log(i + ':', JSON.stringify(lines[i]));