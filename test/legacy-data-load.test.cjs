const assert = require('assert');
const {
  setupLegacyTestEnv,
  teardownLegacyTestEnv,
  loadPhononClasses,
} = require('./helpers/legacy-test-env.cjs');

describe('Legacy compatibility: data loading', function () {
  let dom;
  let PhononWebpage;

  beforeEach(function () {
    ({ dom } = setupLegacyTestEnv());
    ({ PhononWebpage } = loadPhononClasses());
  });

  afterEach(function () {
    teardownLegacyTestEnv(dom);
  });

  it('loads a phononwebsite internal json file', function () {
    const visualizer = { updated: false, update() { this.updated = true; } };
    const dispersion = { updated: false, setClickEvent() {}, update() { this.updated = true; } };
    const p = new PhononWebpage(visualizer, dispersion);

    p.loadURL({ json: 'localdb/graphene/data.json', name: 'Graphene Phononwebsite' });

    assert.ok(p.phonon && p.phonon.name, 'phonon data should be loaded');
    assert.ok(Array.isArray(p.atoms) && p.atoms.length > 0, 'atoms should be computed');
    assert.ok(Array.isArray(p.vibrations) && p.vibrations.length > 0, 'vibrations should be computed');
    assert.ok(visualizer.updated, 'visualizer update should run');
    assert.ok(dispersion.updated, 'dispersion update should run');
  });

  it('loads a pymatgen phonon json', function () {
    const visualizer = { updated: false, update() { this.updated = true; } };
    const dispersion = { updated: false, setClickEvent() {}, update() { this.updated = true; } };
    const p = new PhononWebpage(visualizer, dispersion);

    p.loadURL({ json: 'test/fixtures/pymatgen/mp-149_pmg_bs.json', name: 'Silicon PMG' });

    assert.ok(p.phonon && p.phonon.natoms > 0, 'PMG phonon data should be loaded');
    assert.ok(Array.isArray(p.phonon.kpoints) && p.phonon.kpoints.length > 0, 'k-point data should be present');
    assert.ok(visualizer.updated, 'visualizer update should run');
    assert.ok(dispersion.updated, 'dispersion update should run');
  });

  it('loads a phonopy yaml file', function () {
    const visualizer = { updated: false, update() { this.updated = true; } };
    const dispersion = { updated: false, setClickEvent() {}, update() { this.updated = true; } };
    const p = new PhononWebpage(visualizer, dispersion);

    p.loadURL({ yaml: 'test/fixtures/phonopy/band.yaml', name: 'Graphene Phonopy' });

    assert.ok(p.phonon && p.phonon.natoms > 0, 'phonopy yaml should be loaded');
    assert.ok(Array.isArray(p.phonon.eigenvalues) && p.phonon.eigenvalues.length > 0, 'eigenvalues should be present');
    assert.ok(visualizer.updated, 'visualizer update should run');
    assert.ok(dispersion.updated, 'dispersion update should run');
  });
});
