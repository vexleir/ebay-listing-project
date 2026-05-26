const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), 'utf8');
}

test('runtime eBay token JSON file is not present in the repository', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'server', 'ebay_tokens.json')), false);
});

test('token JSON files are ignored by git', () => {
  const gitignore = readRepoFile('.gitignore');
  assert.match(gitignore, /server\/ebay_tokens\.json/);
  assert.match(gitignore, /server\/\*tokens\*\.json/);
});

test('debug endpoints default to disabled in the example environment', () => {
  const envExample = readRepoFile('server', '.env.example');
  assert.match(envExample, /^ENABLE_DEBUG_ENDPOINTS=false$/m);
});
