const assert = require('assert');
const {
  setupLegacyTestEnv,
  teardownLegacyTestEnv,
} = require('./helpers/legacy-test-env.cjs');

require('esbuild-register/dist/node').register({
  target: 'es2019',
  format: 'cjs',
});

const { PhononJson } = require('../src/phononjson.js');

function encodeQ11(values) {
  const flattened = Int16Array.from(values.map((value) => Math.round(value * 2047)));
  const bytes = new Uint8Array(flattened.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

describe('PhononJson compressed vectors', function () {
  let dom;

  beforeEach(function () {
    ({ dom } = setupLegacyTestEnv());
  });

  afterEach(function () {
    teardownLegacyTestEnv(dom);
  });

  it('decodes q11 int16 base64 vectors from internal json', function (done) {
    const phonon = new PhononJson();
    const values = [1, 0, 0, 0, 1, 0];
    phonon.getFromInternalJson({
      name: 'Test',
      natoms: 1,
      atom_types: ['C'],
      atom_numbers: [6],
      atom_pos_car: [[0, 0, 0]],
      atom_pos_red: [[0, 0, 0]],
      lattice: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      qpoints: [[0, 0, 0]],
      distances: [0],
      formula: 'C',
      eigenvalues: [[100]],
      repetitions: [1, 1, 1],
      highsym_qpts: [[0, 'GAMMA']],
      line_breaks: [[0, 1]],
      vectors_compressed: {
        format: 'q11-int16-base64',
        scale: 2047,
        shape: [1, 1, 1, 3, 2],
        data: encodeQ11(values),
      },
    }, function () {
      assert.ok(Array.isArray(phonon.vec));
      assert.equal(phonon.vec.length, 1);
      assert.equal(phonon.vec[0].length, 1);
      assert.equal(phonon.vec[0][0].length, 1);
      assert.equal(phonon.vec[0][0][0].length, 3);
      done();
    });
  });
});
