const assert = require('assert');
const {
  setupLegacyTestEnv,
  teardownLegacyTestEnv,
  loadPhononClasses,
} = require('./helpers/legacy-test-env.cjs');

describe('Legacy compatibility: construction', function () {
  let dom;
  let VibCrystal;
  let PhononHighcharts;
  let PhononWebpage;

  beforeEach(function () {
    ({ dom } = setupLegacyTestEnv());
    ({ VibCrystal, PhononHighcharts, PhononWebpage } = loadPhononClasses());
  });

  afterEach(function () {
    teardownLegacyTestEnv(dom);
  });

  it('initializes VibCrystal, PhononHighcharts and PhononWebpage', function () {
    const fakeContainer = {
      width: () => 640,
      height: () => 480,
      get: () => ({ getBoundingClientRect: () => ({ width: 640, height: 480 }) }),
    };

    const v = new VibCrystal(fakeContainer);
    assert.ok(v instanceof VibCrystal);

    const d = new PhononHighcharts(global.$('#highcharts'));
    assert.ok(d instanceof PhononHighcharts);

    const p = new PhononWebpage(v, d);
    assert.ok(p instanceof PhononWebpage);
  });
});
