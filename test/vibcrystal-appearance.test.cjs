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

function makeAppearanceDom() {
  return new JSDOM(`<!doctype html><html><body>
    <div id="atom-list"></div>
    <select id="display"><option value="jmol">Jmol</option><option value="vesta">Vesta</option></select>
    <input id="atom-color" type="color">
    <input id="arrow-color" type="color">
    <input id="bond-color" type="color">
    <input id="bond-color-by-atom" type="checkbox">
    <input id="atom-radius" type="number">
    <input id="bond-radius" type="number">
    <input id="arrow-radius" type="number">
    <div id="bond-rules-list"></div>
    <select id="bond-add-a"></select>
    <select id="bond-add-b"></select>
    <input id="bond-add-cutoff" type="number">
    <button id="reset-atom" type="button"></button>
    <button id="reset-bonds" type="button"></button>
    <button id="reset-vectors" type="button"></button>
  </body></html>`);
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

  it('preserves selected atom when rebuilding selectors', function () {
    const dom = makeAppearanceDom();
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6, 8, 6];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#bond-color-by-atom'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#bond-rules-list'),
      $('#bond-add-a'),
      $('#bond-add-b'),
      $('#bond-add-cutoff'),
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

  it('resets atom, bonds and vectors sections independently', function () {
    const dom = makeAppearanceDom();
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#bond-color-by-atom'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#bond-rules-list'),
      $('#bond-add-a'),
      $('#bond-add-b'),
      $('#bond-add-cutoff'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );
    v.adjustCovalentRadiiSelect();

    const defaultAtom = v.getDefaultAtomColor(6);
    v.setAtomColorOverride(6, '#123456');
    v.setAtomRadiusScaleOverride(6, 2.0);
    v.arrowcolor = 0x111111;
    v.bondscolor = 0x222222;
    v.bondColorByAtom = true;
    v.bondRadius = 0.3;
    v.arrowRadius = 0.4;
    v.arrowScale = 3.5;
    v.arrows = true;

    $('#reset-atom').trigger('click');
    assert.equal(v.getAtomColorHex(6), defaultAtom);
    assert.equal(v.getAtomRadiusScale(6), v.defaultAtomRadiusScale);
    assert.equal(v.bondscolor, 0x222222);

    $('#reset-bonds').trigger('click');
    assert.equal(v.bondscolor, v.defaultBondsColor);
    assert.equal(v.bondColorByAtom, v.defaultBondColorByAtom);
    assert.equal(v.bondRadius, v.defaultBondRadius);
    assert.equal(v.arrowcolor, 0x111111);

    $('#reset-vectors').trigger('click');
    assert.equal(v.arrowcolor, v.defaultArrowColor);
    assert.equal(v.arrowRadius, v.defaultArrowRadius);
    assert.equal(v.arrowScale, v.defaultArrowScale);
    assert.equal(v.arrows, false);
    dom.window.close();
  });

  it('adds and removes bond rules from the UI controls', function () {
    const dom = makeAppearanceDom();
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6, 8];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#bond-color-by-atom'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#bond-rules-list'),
      $('#bond-add-a'),
      $('#bond-add-b'),
      $('#bond-add-cutoff'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );
    v.adjustCovalentRadiiSelect();

    $('#bond-add-a').val('6');
    $('#bond-add-b').val('8');
    $('#bond-add-cutoff').val('1.23');
    $('#bond-add-cutoff').trigger($.Event('keydown', { key: 'Enter' }));
    assert.equal(v.hasBondRule(6, 8), true);
    const key = v.getBondRuleKey(6, 8);
    assert.equal(v.bondRules[key].cutoff, 1.23);

    $('#bond-rules-list').find(`button[data-remove-key="${key}"]`).trigger('click');
    assert.equal(v.hasBondRule(6, 8), false);
    dom.window.close();
  });

  it('updates split bond colors mode from the bonds controls', function () {
    const dom = makeAppearanceDom();
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6, 8];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#bond-color-by-atom'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#bond-rules-list'),
      $('#bond-add-a'),
      $('#bond-add-b'),
      $('#bond-add-cutoff'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );

    assert.equal(v.bondColorByAtom, false);
    $('#bond-color-by-atom').prop('checked', true).trigger('change');
    assert.equal(v.bondColorByAtom, true);

    $('#reset-bonds').trigger('click');
    assert.equal(v.bondColorByAtom, false);
    dom.window.close();
  });

  it('disables bond color input while split bond colors mode is enabled', function () {
    const dom = makeAppearanceDom();
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6, 8];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#bond-color-by-atom'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#bond-rules-list'),
      $('#bond-add-a'),
      $('#bond-add-b'),
      $('#bond-add-cutoff'),
      $('#reset-atom'),
      $('#reset-bonds'),
      $('#reset-vectors')
    );

    assert.equal($('#bond-color').prop('disabled'), false);
    $('#bond-color-by-atom').prop('checked', true).trigger('change');
    assert.equal($('#bond-color').prop('disabled'), true);
    $('#bond-color').val('#123456').trigger('change');
    assert.notEqual(v.bondscolor, 0x123456);

    $('#bond-color-by-atom').prop('checked', false).trigger('change');
    assert.equal($('#bond-color').prop('disabled'), false);
    dom.window.close();
  });

  it('keeps default atom colors dynamic across display modes', function () {
    const dom = makeAppearanceDom();
    const $ = require('jquery')(dom.window);

    const v = new VibCrystal(makeContainer());
    v.atom_numbers = [6];
    v.updatelocal = () => {};
    v.setAdvancedAppearanceControls(
      $('#atom-list'),
      $('#display'),
      $('#atom-color'),
      $('#arrow-color'),
      $('#bond-color'),
      $('#bond-color-by-atom'),
      $('#atom-radius'),
      $('#bond-radius'),
      $('#arrow-radius'),
      $('#bond-rules-list'),
      $('#bond-add-a'),
      $('#bond-add-b'),
      $('#bond-add-cutoff'),
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
