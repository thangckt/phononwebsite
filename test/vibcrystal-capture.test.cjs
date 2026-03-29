const assert = require('assert');
const { JSDOM } = require('jsdom');

require('esbuild-register/dist/node').register({
  target: 'es2019',
  format: 'cjs',
});

const { VibCrystal } = require('../src/vibcrystal.js');

describe('VibCrystal capture lifecycle', function () {
  let dom;
  let fakeContainer;
  let captureInstances;
  let lastCapture;

  beforeEach(function () {
    dom = new JSDOM(`<!doctype html><html><body><div id="progress"></div></body></html>`);
    global.window = dom.window;
    global.document = dom.window.document;

    fakeContainer = {
      width: () => 640,
      height: () => 480,
      get: () => ({
        getBoundingClientRect: () => ({ width: 640, height: 480 }),
        clientHeight: 480,
        style: {},
      }),
    };

    captureInstances = 0;
    lastCapture = null;
    global.CCapture = class FakeCCapture {
      constructor(options) {
        captureInstances += 1;
        this.options = options;
        this.started = false;
        this.stopped = false;
        this.saved = false;
        lastCapture = this;
      }
      start() {
        this.started = true;
      }
      stop() {
        this.stopped = true;
      }
      save(callback) {
        this.saved = true;
        callback('blob:mock-capture');
      }
      capture() {}
    };
  });

  afterEach(function () {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.CCapture;
  });

  it('ignores duplicate capture start while already capturing', function () {
    const v = new VibCrystal(fakeContainer);

    v.capturestart('gif');
    v.capturestart('gif');

    assert.equal(captureInstances, 1);
    assert.equal(v.captureState, 'capturing');
    assert.ok(v.capturer);
  });

  it('resets state/progress cleanly when capture ends', function () {
    const v = new VibCrystal(fakeContainer);
    v.phonon = { name: 'Graphene demo' };

    v.capturestart('gif');
    assert.ok(lastCapture);

    lastCapture.options.onProgress(0.5);
    assert.equal(document.getElementById('progress').style.width, '50%');

    v.captureend('gif');

    assert.equal(v.captureState, 'idle');
    assert.equal(v.capturer, null);
    assert.equal(document.getElementById('progress').style.width, '0%');
    assert.ok(lastCapture.stopped);
    assert.ok(lastCapture.saved);

    // Calling end a second time should be a no-op.
    v.captureend('gif');
    assert.equal(v.captureState, 'idle');
  });
});
