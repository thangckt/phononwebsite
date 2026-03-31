import $ from 'jquery';
import * as THREE from 'three';
import Highcharts from 'highcharts';
import Detector from '../libs/Detector.js';

import { AbsorptionSpectra, ExcitonWf, ExcitonWebpage } from './excitonwebsite.js';

globalThis.THREE = THREE;
globalThis.$ = $;
globalThis.jQuery = $;
globalThis.Highcharts = Highcharts;

const viewer = new ExcitonWf();
viewer.init($('#excitonwf'));

const spectra = new AbsorptionSpectra($('#highcharts'));
const page = new ExcitonWebpage(viewer, spectra);

page.setTitle($('#name'));
page.setMaterialsList($('#mat'));
page.setFileInput($('#file-input'));
page.setIsolevelInput($('#isolevel_range'), $('#isolevel_value'));
page.setCameraDirectionButton($('#camerax'), 'x');
page.setCameraDirectionButton($('#cameray'), 'y');
page.setCameraDirectionButton($('#cameraz'), 'z');
viewer.setDisplayCombo($('#displaystyle'));
viewer.setAppearanceControls(
    $('#appearance_atom_list'),
    $('#atom_color_input'),
    $('#bond_color_input'),
    $('#bond_color_by_atom_checkbox'),
    $('#atom_radius_input'),
    $('#bond_radius_input'),
    $('#bond_rules_list'),
    $('#bond_add_atom_a'),
    $('#bond_add_atom_b'),
    $('#bond_add_cutoff_input'),
    $('#appearance_reset_atom_button'),
    $('#appearance_reset_bonds_button'),
);

page.init();

if (!Detector.webgl) {
    Detector.addGetWebGLMessage();
}
