const fs = require('fs');
const c = fs.readFileSync('src/routes/_app/pacientes.$id.tsx', 'utf8');
console.log('char 0:', c.charCodeAt(0));
console.log('Has BOM:', c.charCodeAt(0) === 0xFEFF);
console.log('Line 159:', c.split('\n')[158]);
console.log('Line 160:', c.split('\n')[159]);