const fs = require('fs');
const c = fs.readFileSync('src/routes/_app/pacientes.$id.tsx', 'utf8');
fs.writeFileSync('src/routes/_app/pacientes.$id.tsx', c.replace(/\r\n/g, '\n'));
console.log('done');