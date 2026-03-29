const fs = require('fs');
const path = require('path');
const assert = require('assert');

function read(relPath) {
  const absPath = path.join(process.cwd(), relPath);
  return fs.readFileSync(absPath, 'utf8');
}

describe('Build smoke tests', function () {
  it('produces minified bundle artifacts', function () {
    const requiredFiles = [
      'build/main.js',
      'build/main.js.map',
      'build/main.min.js',
      'build/main.min.js.map',
    ];

    for (const file of requiredFiles) {
      assert.ok(fs.existsSync(path.join(process.cwd(), file)), `Missing ${file}`);
    }
  });

  it('does not leak Node fs imports into browser bundle', function () {
    const mainJs = read('build/main.js');
    const mainMinJs = read('build/main.min.js');
    assert.ok(!mainJs.includes("from 'fs'"), 'build/main.js must not import fs');
    assert.ok(!mainMinJs.includes("from 'fs'"), 'build/main.min.js must not import fs');
  });

  it('uses minified production entrypoint', function () {
    const html = read('phonon.html');
    assert.ok(
      html.includes('<script src="main.min.js" type="module"></script>'),
      'phonon.html should load main.min.js'
    );
  });
});
