const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const jqueryFactory = require('jquery');
const ComplexLib = require('complex');
const jsyaml = require('js-yaml');
require('esbuild-register/dist/node').register({
  target: 'es2019',
  format: 'cjs',
});

function wrapComplex(raw) {
  return {
    __rawComplex: raw,
    mult(other) {
      const rhs = other && other.__rawComplex ? other.__rawComplex : other;
      return wrapComplex(raw.clone().mult(rhs));
    },
    real() {
      return raw.real;
    },
    imag() {
      return raw.im;
    },
  };
}

function makeComplexCompat() {
  function Complex(real, imag) {
    return wrapComplex(ComplexLib.from(real, imag));
  }
  Complex.Polar = function (r, phi) {
    return wrapComplex(ComplexLib.fromPolar(r, phi));
  };
  return Complex;
}

function resolveAsset(url) {
  const clean = decodeURIComponent(url.split('?')[0]);
  return path.join(process.cwd(), clean);
}

function installAjaxStubs($) {
  $.getJSON = function (url, callback) {
    const text = fs.readFileSync(resolveAsset(url), 'utf8');
    callback(JSON.parse(text));
  };

  $.get = function (url, callback) {
    const filePath = resolveAsset(url);
    const text = fs.readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.json')) {
      callback(JSON.parse(text));
    } else {
      callback(text);
    }
  };
}

describe('Legacy tests migrated to Mocha/CommonJS', function () {
  let dom;
  let VibCrystal;
  let PhononHighcharts;
  let PhononWebpage;

  beforeEach(function () {
    dom = new JSDOM(
      `
      <!doctype html>
      <html>
      <body>
        <div id="vibcrystal"></div>
        <div id="highcharts"></div>
        <ul id="mat"></ul>
        <ul id="ref"></ul>
      </body>
      </html>
      `,
      { url: 'http://localhost/phonon.html' }
    );

    global.window = dom.window;
    global.document = dom.window.document;
    global.location = dom.window.location;
    global.navigator = dom.window.navigator;
    global.alert = () => {};
    global.jsyaml = jsyaml;
    global.Complex = makeComplexCompat();

    const $ = jqueryFactory(dom.window);
    installAjaxStubs($);
    global.$ = $;
    global.jQuery = $;

    delete require.cache[require.resolve('../src/phononwebsite.js')];
    ({ VibCrystal, PhononHighcharts, PhononWebpage } = require('../src/phononwebsite.js'));
  });

  afterEach(function () {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.location;
    delete global.navigator;
    delete global.alert;
    delete global.jsyaml;
    delete global.Complex;
    delete global.$;
    delete global.jQuery;
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

    p.loadURL({ json: 'tests/pymatgen/mp-149_pmg_bs.json', name: 'Silicon PMG' });

    assert.ok(p.phonon && p.phonon.natoms > 0, 'PMG phonon data should be loaded');
    assert.ok(Array.isArray(p.phonon.kpoints) && p.phonon.kpoints.length > 0, 'k-point data should be present');
    assert.ok(visualizer.updated, 'visualizer update should run');
    assert.ok(dispersion.updated, 'dispersion update should run');
  });

  it('loads a phonopy yaml file', function () {
    const visualizer = { updated: false, update() { this.updated = true; } };
    const dispersion = { updated: false, setClickEvent() {}, update() { this.updated = true; } };
    const p = new PhononWebpage(visualizer, dispersion);

    p.loadURL({ yaml: 'tests/phonopy/band.yaml', name: 'Graphene Phonopy' });

    assert.ok(p.phonon && p.phonon.natoms > 0, 'phonopy yaml should be loaded');
    assert.ok(Array.isArray(p.phonon.eigenvalues) && p.phonon.eigenvalues.length > 0, 'eigenvalues should be present');
    assert.ok(visualizer.updated, 'visualizer update should run');
    assert.ok(dispersion.updated, 'dispersion update should run');
  });
});
