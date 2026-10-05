const fs = require('fs');
const c = fs.readFileSync('src/routes/_app/pacientes.$id.tsx', 'utf8');
console.log('First 500 chars:', JSON.stringify(c.slice(0, 500)));
console.log('Has BOM:', c.charCodeAt(0) === 0xFEFF);