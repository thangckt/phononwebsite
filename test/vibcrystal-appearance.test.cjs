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
      <div id="atom-list"></div>
      <select id="display"><option value="jmol">Jmol</option><option value="vesta">Vesta</option></select>
      <input id="cov-input" type="number">
      <input id="atom-color" type="color">
      <input id="arrow-color" type="color">
      <input id="bond-color" type="color">
      <input id="atom-radius" type="number">
      <input id="bond-radius" type="number">
      <input id="arrow-radius" type="number">
      <button id="reset-atom" type="button"></button>
      <button id="reset-bonds" type="button"></button>
      <button id="reset-vectors" type="button"></button>
    </body></html>`);
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6, 8, 6];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#cov-input'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );

    v.adjustCovalentRadiiSelect();
    $('#atom-list').find('button[data-atom-number="8"]').trigger('click');
    v.adjustCovalentRadiiSelect();

    assert.equal(v.getSelectedAppearanceAtomNumber(), 8);
    dom.window.close();
  });

  it('resets all advanced colors and radii with dedicated buttons', function () {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="atom-list"></div>
      <select id="display"><option value="jmol">Jmol</option><option value="vesta">Vesta</option></select>
      <input id="cov-input" type="number">
      <input id="atom-color" type="color">
      <input id="arrow-color" type="color">
      <input id="bond-color" type="color">
      <input id="atom-radius" type="number">
      <input id="bond-radius" type="number">
      <input id="arrow-radius" type="number">
      <button id="reset-atom" type="button"></button>
      <button id="reset-bonds" type="button"></button>
      <button id="reset-vectors" type="button"></button>
    </body></html>`);
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#cov-input'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );
    v.adjustCovalentRadiiSelect();

    const defaultAtom = v.getDefaultAtomColor(6);
    const defaultCovalent = v.modified_covalent_radii[6];
    v.setAtomColorOverride(6, '#123456');
    v.modified_covalent_radii[6] = defaultCovalent + 0.5;
    v.arrowcolor = 0x111111;
    v.bondscolor = 0x222222;
    v.setAtomRadiusScaleOverride(6, 2.0);
    v.bondRadius = 0.3;
    v.arrowRadius = 0.4;
    v.arrowScale = 3.5;
    v.arrows = true;

    $('#reset-atom').trigger('click');
    assert.equal(v.getAtomColorHex(6), defaultAtom);
    assert.equal(v.modified_covalent_radii[6], defaultCovalent);
    assert.equal(v.getAtomRadiusScale(6), v.defaultAtomRadiusScale);
    assert.equal(v.arrowcolor, 0x111111);
    assert.equal(v.bondscolor, 0x222222);
    assert.equal(v.bondRadius, 0.3);
    assert.equal(v.arrowRadius, 0.4);

    $('#reset-bonds').trigger('click');
    assert.equal(v.arrowcolor, 0x111111);
    assert.equal(v.bondscolor, v.defaultBondsColor);
    assert.equal(v.bondRadius, v.defaultBondRadius);
    assert.equal(v.getAtomColorHex(6), defaultAtom);

    $('#reset-vectors').trigger('click');
    assert.equal(v.arrowcolor, v.defaultArrowColor);
    assert.equal(v.arrowRadius, v.defaultArrowRadius);
    assert.equal(v.arrowScale, v.defaultArrowScale);
    assert.equal(v.arrows, false);
    assert.equal(v.getAtomColorHex(6), defaultAtom);
    dom.window.close();
  });

  it('applies selected atom values on Enter', function () {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="atom-list"></div>
      <select id="display"><option value="jmol">Jmol</option><option value="vesta">Vesta</option></select>
      <input id="cov-input" type="number">
      <input id="atom-color" type="color">
      <input id="arrow-color" type="color">
      <input id="bond-color" type="color">
      <input id="atom-radius" type="number">
      <input id="bond-radius" type="number">
      <input id="arrow-radius" type="number">
      <button id="reset-atom" type="button"></button>
      <button id="reset-bonds" type="button"></button>
      <button id="reset-vectors" type="button"></button>
    </body></html>`);
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6, 8];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#cov-input'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );
    v.adjustCovalentRadiiSelect();

    $('#atom-list').find('button[data-atom-number="8"]').trigger('click');
    $('#cov-input').val('2.22');
    $('#atom-color').val('#123456');
    $('#atom-radius').val('1.75');
    $('#atom-radius').trigger($.Event('keydown', { key: 'Enter' }));

    assert.equal(v.modified_covalent_radii[8], 2.22);
    assert.equal(v.getAtomColorHex(8), 0x123456);
    assert.equal(v.getAtomRadiusScale(8), 1.75);
    dom.window.close();
  });

  it('keeps default atom colors dynamic across display modes', function () {
    const dom = new JSDOM(`<!doctype html><html><body>
      <div id="atom-list"></div>
      <select id="display"><option value="jmol">Jmol</option><option value="vesta">Vesta</option></select>
      <input id="cov-input" type="number">
      <input id="atom-color" type="color">
      <input id="arrow-color" type="color">
      <input id="bond-color" type="color">
      <input id="atom-radius" type="number">
      <input id="bond-radius" type="number">
      <input id="arrow-radius" type="number">
      <button id="reset-atom" type="button"></button>
      <button id="reset-bonds" type="button"></button>
      <button id="reset-vectors" type="button"></button>
    </body></html>`);
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#cov-input'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );
    v.adjustCovalentRadiiSelect();

    const jmolDefault = v.getDefaultAtomColor(6);
    $('#atom-color').val(v.colorToInputHex(jmolDefault));
    $('#atom-radius').trigger($.Event('keydown', { key: 'Enter' }));

    v.display = 'vesta';
    const vestaDefault = v.getDefaultAtomColor(6);
    assert.equal(v.getAtomColorHex(6), vestaDefault);
    dom.window.close();
  });
});
