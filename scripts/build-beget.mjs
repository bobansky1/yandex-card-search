import { build } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const path = (value) => fileURLToPath(new URL(value, import.meta.url));
await build({ configFile: path('../deploy/beget/vite.config.ts') });
await mkdir(path('../beget-dist/private'), { recursive: true });
await cp(path('../deploy/beget/public'), path('../beget-dist/public_html'), { recursive: true });
await cp(path('../deploy/beget/private/backend.php'), path('../beget-dist/private/backend.php'));
console.log('Beget package ready in beget-dist: public_html + private. Requires PHP 8.1+, cURL, mbstring, PDO SQLite.');
