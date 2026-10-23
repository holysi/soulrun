const fs = require('node:fs');
const path = require('node:path');

const marker = '__SOULRUN_TEST__';

function javascriptContains(directory, value) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.some((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return javascriptContains(entryPath, value);
    return (
      entry.isFile() &&
      entry.name.endsWith('.js') &&
      fs.readFileSync(entryPath, 'utf8').includes(value)
    );
  });
}

if (javascriptContains('dist', marker)) {
  throw new Error('Production JavaScript must omit the deterministic test API');
}

if (!javascriptContains('dist-test', marker)) {
  throw new Error('Test-mode JavaScript must expose the deterministic test API');
}

console.log('Validated production/test bundle API boundaries.');
