const assert = require('assert');
const {
  setupLegacyTestEnv,
  teardownLegacyTestEnv,
  loadPhononClasses,
} = require('./helpers/legacy-test-env.cjs');

describe('Degenerate mode selection inputs', function () {
  let dom;
  let PhononWebpage;

  beforeEach(function () {
    ({ dom } = setupLegacyTestEnv());
    ({ PhononWebpage } = loadPhononClasses());
  });

  afterEach(function () {
    teardownLegacyTestEnv(dom);
  });

  it('allows selecting mode by k-index and energy order', function () {
    const visualizer = {
      updated: false,
      update() { this.updated = true; },
    };
    const dispersion = {
      selected: false,
      setClickEvent() {},
      update() {},
      selectModePoint() { this.selected = true; },
    };

    const p = new PhononWebpage(visualizer, dispersion);
    p.loadURL({ json: 'localdb/graphene/data.json', name: 'Graphene' });

    const kInput = global.$('<input id="kindex" type="number">');
    const nInput = global.$('<input id="nindex" type="number">');
    const applyButton = global.$('<button id="modeselect"></button>');
    global.$('body').append(kInput, nInput, applyButton);

    p.setModeSelectionInput(kInput, nInput, applyButton);

    visualizer.updated = false;
    dispersion.selected = false;
    kInput.val('3');
    nInput.val('4');
    p.selectModeFromInputs();

    assert.equal(p.k, 3);
    const expectedBand = p.getBandIndexFromEnergyOrder(3, 4);
    assert.equal(p.n, expectedBand);
    assert.ok(visualizer.updated, 'visualizer should update for manual mode selection');
    assert.ok(dispersion.selected, 'dispersion should highlight selected point');
  });

  it('clamps manual mode selection to valid index ranges', function () {
    const visualizer = { update() {} };
    const dispersion = { setClickEvent() {}, update() {}, selectModePoint() {} };

    const p = new PhononWebpage(visualizer, dispersion);
    p.loadURL({ json: 'localdb/graphene/data.json', name: 'Graphene' });

    const kInput = global.$('<input id="kindex" type="number">');
    const nInput = global.$('<input id="nindex" type="number">');
    const applyButton = global.$('<button id="modeselect"></button>');
    global.$('body').append(kInput, nInput, applyButton);

    p.setModeSelectionInput(kInput, nInput, applyButton);

    kInput.val('9999');
    nInput.val('9999');
    p.selectModeFromInputs();

    assert.equal(p.k, p.phonon.distances.length - 1);
    const maxOrder = p.phonon.eigenvalues[0].length - 1;
    assert.equal(p.n, p.getBandIndexFromEnergyOrder(p.k, maxOrder));
  });

  it('maps energy order to band index at each k-point', function () {
    const visualizer = { update() {} };
    const dispersion = { setClickEvent() {}, update() {}, selectModePoint() {} };
    const p = new PhononWebpage(visualizer, dispersion);

    p.phonon = {
      distances: [0],
      eigenvalues: [[8, 2, 5]],
    };
    p.k = 0;
    p.n = 0;

    assert.deepEqual(p.getEnergyOrderedBandIndices(0), [1, 2, 0]);
    assert.equal(p.getBandIndexFromEnergyOrder(0, 0), 1);
    assert.equal(p.getBandIndexFromEnergyOrder(0, 1), 2);
    assert.equal(p.getBandIndexFromEnergyOrder(0, 2), 0);
  });
});
