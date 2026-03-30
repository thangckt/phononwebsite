import $ from 'jquery';
import * as THREE from 'three';
import Highcharts from 'highcharts';
import ComplexLib from 'complex';
import jsyaml from 'js-yaml';
import Detector from '../libs/Detector.js';
import '../libs/CCapture.js';
import GIFLib from '../libs/gif.js';
import Whammy from 'whammy';

// Import your own classes (adjust the path as needed)
import { VibCrystal, PhononHighcharts, PhononWebpage } from './phononwebsite.js';

function resolveGifConstructor(mod) {
    if (typeof mod === 'function') {
        return mod;
    }
    if (mod && typeof mod.default === 'function') {
        return mod.default;
    }
    if (mod && typeof mod.GIF === 'function') {
        return mod.GIF;
    }
    return null;
}

function wrapComplex(raw) {
    return {
        __rawComplex: raw,
        mult(other) {
            const rhs = other && other.__rawComplex ? other.__rawComplex : other;
            return wrapComplex(raw.clone().mult(rhs));
        },
        multiply(other) {
            const rhs = other && other.__rawComplex ? other.__rawComplex : other;
            return wrapComplex(raw.clone().multiply(rhs));
        },
        real() {
            return raw.real;
        },
        imag() {
            return raw.im;
        }
    };
}

function Complex(real, imag) {
    return wrapComplex(ComplexLib.from(real, imag));
}

Complex.Polar = function(r, phi) {
    return wrapComplex(ComplexLib.fromPolar(r, phi));
};

Complex.fromPolar = Complex.Polar;

// Keep legacy globals available for modules still using the old global style.
globalThis.THREE = THREE;
globalThis.$ = $;
globalThis.jQuery = $;
globalThis.Highcharts = Highcharts;
globalThis.Complex = Complex;
globalThis.jsyaml = jsyaml;
const GIF = resolveGifConstructor(GIFLib);
if (GIF) {
    globalThis.GIF = GIF;
}
globalThis.Whammy = Whammy;

// Now use your classes as before
const v = new VibCrystal($('#vibcrystal'));
const d = new PhononHighcharts($('#highcharts'));
const p = new PhononWebpage(v, d);

//set dom objects phononwebsite
p.setMaterialsList( $('#mat') );
p.setReferencesList( $('#ref') );
p.setAtomPositions( $('#atompos') );
p.setLattice( $('#lattice') );
p.setRepetitionsInput( $('#nx'), $('#ny'), $('#nz') );
p.setModeSelectionInput( $('#kindex'), $('#nindex'), $('#modeselect') );
p.setUpdateButton( $('#update') );
p.setFileInput( $('#file-input') );
p.setMaterialsProjectAPIKey( $('#mp_api_key_input'),$('#mp_api_key_button') );
p.setExportPOSCARButton($('#poscar'));
p.setExportXSFButton($('#xsf'));
p.setTitle($('#name'));

p.updateMenu();
p.getUrlVars({json: "data/localdb/graphene/data.json", name:"Graphene [1]"});

//set dom objects vibcrystal
v.setCameraDirectionButton($('#camerax'),'x');
v.setCameraDirectionButton($('#cameray'),'y');
v.setCameraDirectionButton($('#cameraz'),'z');

v.setDisplayCombo($('#displaystyle'));
v.setCellCheckbox($('#drawcell'));
v.setShadingCheckbox($('#drawshading'));
v.setWebmButton($('#webmbutton'));
v.setGifButton($('#gifbutton'));
v.setArrowsCheckbox($('#drawvectors'));
v.setArrowsInput($('#vectors_amplitude_range'));
v.setSpeedInput($('#speed_range'));
v.setAmplitudeInput($('#amplitude_box'),$('#amplitude_range'));
v.setPlayPause($('#playpause'));
v.setAdvancedAppearanceControls(
    $('#appearance_atom_list'),
    $('#displaystyle'),
    $('#atom_color_input'),
    $('#arrow_color_input'),
    $('#bond_color_input'),
    $('#bond_color_by_atom_checkbox'),
    $('#atom_radius_input'),
    $('#bond_radius_input'),
    $('#arrow_radius_input'),
    $('#bond_rules_list'),
    $('#bond_add_atom_a'),
    $('#bond_add_atom_b'),
    $('#bond_add_cutoff_input'),
    $('#appearance_reset_atom_button'),
    $('#appearance_reset_bonds_button'),
    $('#appearance_reset_vectors_button'),
);

// check if webgl is available
if ( ! Detector.webgl ) {
    Detector.addGetWebGLMessage();
}
