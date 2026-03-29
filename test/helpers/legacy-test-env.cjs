const fs = require('fs');
const path = require('path');
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

function setupLegacyTestEnv() {
  const dom = new JSDOM(
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

  return { dom, $ };
}

function teardownLegacyTestEnv(dom) {
  if (dom && dom.window) {
    dom.window.close();
  }
  delete global.window;
  delete global.document;
  delete global.location;
  delete global.navigator;
  delete global.alert;
  delete global.jsyaml;
  delete global.Complex;
  delete global.$;
  delete global.jQuery;
}

function loadPhononClasses() {
  delete require.cache[require.resolve('../../src/phononwebsite.js')];
  return require('../../src/phononwebsite.js');
}

module.exports = {
  setupLegacyTestEnv,
  teardownLegacyTestEnv,
  loadPhononClasses,
};
