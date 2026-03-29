const assert = require('assert');
const {
  setupLegacyTestEnv,
  teardownLegacyTestEnv,
  loadPhononClasses,
} = require('./helpers/legacy-test-env.cjs');

describe('Legacy compatibility: UI wiring', function () {
  let dom;
  let PhononWebpage;

  beforeEach(function () {
    ({ dom } = setupLegacyTestEnv());
    ({ PhononWebpage } = loadPhononClasses());
  });

  afterEach(function () {
    teardownLegacyTestEnv(dom);
  });

  it('updateMenu populates materials and references', function () {
    const visualizer = { update() {} };
    const dispersion = { setClickEvent() {}, update() {} };
    const p = new PhononWebpage(visualizer, dispersion);
    p.setMaterialsList(global.$('#mat'));
    p.setReferencesList(global.$('#ref'));

    p.updateMenu();

    assert.ok(global.$('#mat').children().length > 0, 'materials list should not be empty');
    assert.ok(global.$('#ref').children().length > 0, 'references list should not be empty');
  });
});
