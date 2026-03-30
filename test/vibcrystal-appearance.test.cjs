const assert = require('assert');
const { JSDOM } = require('jsdom');

require('esbuild-register/dist/node').register({
  target: 'es2019',
  format: 'cjs',
});

const { VibCrystal } = require('../src/vibcrystal.js');

function makeContainer() {
  return {
    width: () => 640,
    height: () => 480,
    get: () => ({
      getBoundingClientRect: () => ({ width: 640, height: 480 }),
      clientHeight: 480,
      style: {},
    }),
  };
}

describe('VibCrystal advanced appearance', function () {
  it('supports atom color overrides and reset', function () {
    const v = new VibCrystal(makeContainer());
    v.display = 'jmol';

    const defaultColor = v.getDefaultAtomColor(6);
    assert.equal(v.getAtomColorHex(6), defaultColor);

    v.setAtomColorOverride(6, '#123456');
    assert.equal(v.getAtomColorHex(6), 0x123456);

    v.clearAtomColorOverride(6);
    assert.equal(v.getAtomColorHex(6), defaultColor);
  });

  it('formats color values for color input controls', function () {
    const v = new VibCrystal(makeContainer());
    assert.equal(v.colorToInputHex(0x00ffaa), '#00ffaa');
  });

  it('preserves selected atom when rebuilding advanced selectors', function () {
    const dom = new JSDOM(`<!doctype html><html><body>
      <select id="cov-select"></select>
      <input id="cov-input" type="number">
      <select id="atom-select"></select>
      <input id="atom-color" type="color">
      <button id="atom-reset" type="button"></button>
    </body></html>`);
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6, 8, 6];
    v.setCovalentRadiiSelect($('#cov-select'), $('#cov-input'));
    v.setAdvancedAppearanceControls(
      $('#atom-select'),
      $('#atom-color'),
      $('#atom-reset'),
      $(),
      $(),
      $(),
      $(),
      $(),
      $(),
      $()
    );

    v.adjustCovalentRadiiSelect();
    $('#cov-select').val('8');
    $('#atom-select').val('8');
    v.adjustCovalentRadiiSelect();

    assert.equal($('#cov-select').val(), '8');
    assert.equal($('#atom-select').val(), '8');
    dom.window.close();
  });

  it('resets all advanced colors and radii with dedicated buttons', function () {
    const dom = new JSDOM(`<!doctype html><html><body>
      <select id="atom-select"><option value="6">C</option></select>
      <input id="atom-color" type="color">
      <button id="atom-reset" type="button"></button>
      <input id="arrow-color" type="color">
      <input id="bond-color" type="color">
      <input id="atom-radius" type="number">
      <input id="bond-radius" type="number">
      <input id="arrow-radius" type="number">
      <button id="reset-colors" type="button"></button>
      <button id="reset-radius" type="button"></button>
    </body></html>`);
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-select'),
      $('#atom-color'),
      $('#atom-reset'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#reset-colors'),
      $('#reset-radius')
    );

    const defaultAtom = v.getDefaultAtomColor(6);
    v.setAtomColorOverride(6, '#123456');
    v.arrowcolor = 0x111111;
    v.bondscolor = 0x222222;
    v.atomRadiusScale = 2.0;
    v.bondRadius = 0.3;
    v.arrowRadius = 0.4;

    $('#reset-colors').trigger('click');
    assert.equal(v.getAtomColorHex(6), defaultAtom);
    assert.equal(v.arrowcolor, v.defaultArrowColor);
    assert.equal(v.bondscolor, v.defaultBondsColor);

    $('#reset-radius').trigger('click');
    assert.equal(v.atomRadiusScale, v.defaultAtomRadiusScale);
    assert.equal(v.bondRadius, v.defaultBondRadius);
    assert.equal(v.arrowRadius, v.defaultArrowRadius);
    dom.window.close();
  });
});
