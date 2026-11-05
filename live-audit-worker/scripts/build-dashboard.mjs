import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/dashboard-client.txt',import.meta.url),'utf8');
fs.writeFileSync(new URL('../src/dashboard-client.generated.js',import.meta.url),`// Generated from dashboard-client.txt.\nexport default ${JSON.stringify(source)};\n`);
