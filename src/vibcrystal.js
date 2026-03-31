import * as THREE from 'three';
import { TrackballControls } from './static_libs/TrackballControls.js';
import { Stats } from './static_libs/stats.min.js';
import * as atomic_data from './atomic_data.js';
import * as utils from './utils.js';
import * as mat from './mat.js';
import { createAtomBadgeHtml } from './atomcolors.js';

const vec_y = new THREE.Vector3( 0, 1, 0 );
const vec_0 = new THREE.Vector3( 0, 0, 0 );
const direction = new THREE.Vector3( 0, 0, 0 );
const quaternion = new THREE.Quaternion();

function getComplexParts(z) {
    if (z && z.__rawComplex) {
        z = z.__rawComplex;
    }

    let re = 0.0;
    let im = 0.0;

    if (z && typeof z.real === 'number') {
        re = z.real;
    } else if (z && typeof z.real === 'function') {
        re = z.real();
    }

    if (z && typeof z.im === 'number') {
        im = z.im;
    } else if (z && typeof z.imag === 'number') {
        im = z.imag;
    } else if (z && typeof z.imag === 'function') {
        im = z.imag();
    }

    return [re, im];
}

function getBond( point1, point2 ) {
    /*
    get a quaternion and midpoint that links two points
    */
    direction.subVectors(point2, point1);
    quaternion.setFromUnitVectors( vec_y, direction.clone().normalize() );

    return { quaternion: quaternion,
             midpoint: point1.clone().add( direction.multiplyScalar(0.5) ) };
}

export class VibCrystal {
    /*
    Class to show phonon vibrations using Three.js and WebGl
    */

    constructor(container) {

        this.display = 'jmol'; //use jmol or vesta displaystyle

        this.time = 0,
        this.lastFrameTime = null;
        this.animationFrameId = null;
        this.needsRender = true;
        this.arrows = false;
        this.cell = false;
        this.shading = true;
        this.paused = false;
        this.initialized = false;

        this.container = container;
        this.container0 = container.get(0);
        this.dimensions = this.getContainerDimensions();

        this.stats = null;
        this.camera = null;
        this.pointLight = null;
        this.controls = null;
        this.scene = null;
        this.renderer = null;
        this.capturer = null;
        this.captureState = 'idle';
        this.vibrationComponents = [];
        this.onAppearanceUpdated = null;

        //camera options
        this.cameraDistance = 100;
        this.cameraViewAngle = 10;
        this.cameraNear = 0.1;
        this.cameraFar = 5000;

        //balls
        this.sphereRadius = 0.5;
        if (this.display == 'vesta') {
            this.sphereLat = 16;
            this.sphereLon = 16;
        } else {
            this.sphereLat = 12;
            this.sphereLon = 12;
        }

        //bonds
        this.bondRadius = 0.1;
        this.bondSegments = 6;
        this.bondVertical = 1;

        //arrows
        this.arrowHeadRadiusRatio = 2;
        this.arrowHeadLengthRatio = .25;
        this.arrowRadius = 0.1;
        this.arrowLength = 1.0;

        //arrowscale
        this.arrowScale = 2.0;
        this.defaultArrowScale = this.arrowScale;
        this.minArrowScale = 0.0;
        this.maxArrowScale = 5.0;
        this.stepArrowScale = 0.01;

        //amplitude
        this.amplitude = 0.2;
        this.defaultAmplitude = this.amplitude;
        this.minAmplitude = 0.0;
        this.maxAmplitude = 5.0;
        this.stepAmplitude = 0.01;
        this.modeScaleAutoInitialized = false;

        //speed
        this.speed = 0.7;
        this.minSpeed = 0.01;
        this.maxSpeed = 3.0;
        this.stepSpeed = 0.01;

        this.fps = 60;

        this.arrowcolor = 0xbbffbb;
        this.bondscolor = 0xffffff;
        this.defaultArrowColor = this.arrowcolor;
        this.defaultBondsColor = this.bondscolor;
        this.bondColorByAtom = false;
        this.defaultBondColorByAtom = this.bondColorByAtom;
        this.atomRadiusScale = 1.0;
        this.defaultAtomRadiusScale = this.atomRadiusScale;
        this.defaultBondRadius = this.bondRadius;
        this.defaultArrowRadius = this.arrowRadius;
        this.atomColorOverrides = {};
        this.atomRadiusScaleOverrides = {};
        this.bondRules = {};
        this.appearanceSelectedAtomNumber = null;
        this.arrowobjects = [];
        this.atomobjects = [];
        this.atommeshes = [];
        this.atommeshTypeIndices = [];
        this.atomInstanceRefs = [];
        this.bondobjects = [];
        this.bondmesh = null;
        this.bondmeshes = [];
        this.bonds = [];
        this.instanceDummy = new THREE.Object3D();
        this.captureK = null;
        this.captureN = null;
		this.modified_covalent_radii = JSON.parse(JSON.stringify(atomic_data.covalent_radii));
    }

    colorToInputHex(colorHex) {
        return '#' + Number(colorHex).toString(16).padStart(6, '0');
    }

    normalizeColorHex(value, fallback) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            let normalized = value.trim();
            if (!normalized) {
                return fallback;
            }
            if (normalized.startsWith('#')) {
                normalized = normalized.slice(1);
            }
            if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
                return parseInt(normalized, 16);
            }
        }
        return fallback;
    }

    getDefaultAtomColor(atomNumber) {
        let palette = this.display == 'vesta' ? atomic_data.vesta_colors : atomic_data.jmol_colors;
        let rgb = palette[atomNumber] || [0.5, 0.5, 0.5];
        return new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex();
    }

    getAtomColorHex(atomNumber) {
        if (Object.prototype.hasOwnProperty.call(this.atomColorOverrides, atomNumber)) {
            return this.atomColorOverrides[atomNumber];
        }
        return this.getDefaultAtomColor(atomNumber);
    }

    getAtomColor(atomNumber) {
        return new THREE.Color(this.getAtomColorHex(atomNumber));
    }

    setAtomColorOverride(atomNumber, colorValue) {
        this.atomColorOverrides[atomNumber] = this.normalizeColorHex(
            colorValue,
            this.getDefaultAtomColor(atomNumber)
        );
    }

    clearAtomColorOverride(atomNumber) {
        delete this.atomColorOverrides[atomNumber];
    }

    getAtomRadiusScale(atomNumber) {
        if (Object.prototype.hasOwnProperty.call(this.atomRadiusScaleOverrides, atomNumber)) {
            return this.atomRadiusScaleOverrides[atomNumber];
        }
        return this.defaultAtomRadiusScale;
    }

    setAtomRadiusScaleOverride(atomNumber, scale) {
        if (!Number.isFinite(scale)) {
            return;
        }
        this.atomRadiusScaleOverrides[atomNumber] = Math.max(0.1, scale);
    }

    getBondRuleKey(atomNumberA, atomNumberB) {
        let a = Math.min(atomNumberA, atomNumberB);
        let b = Math.max(atomNumberA, atomNumberB);
        return a + '-' + b;
    }

    getDefaultBondCutoff(atomNumberA, atomNumberB) {
        let covalent = atomic_data.covalent_radii[atomNumberA] + atomic_data.covalent_radii[atomNumberB];
        let nnd = this.phonon && Number.isFinite(this.phonon.nndist) ? this.phonon.nndist + 0.05 : 0;
        return Math.max(covalent, nnd);
    }

    setBondRule(atomNumberA, atomNumberB, cutoff) {
        let key = this.getBondRuleKey(atomNumberA, atomNumberB);
        let a = Math.min(atomNumberA, atomNumberB);
        let b = Math.max(atomNumberA, atomNumberB);
        let c = Number.isFinite(cutoff) ? cutoff : this.getDefaultBondCutoff(a, b);
        this.bondRules[key] = { a: a, b: b, cutoff: c };
    }

    removeBondRule(atomNumberA, atomNumberB) {
        let key = this.getBondRuleKey(atomNumberA, atomNumberB);
        delete this.bondRules[key];
    }

    hasBondRule(atomNumberA, atomNumberB) {
        let key = this.getBondRuleKey(atomNumberA, atomNumberB);
        return Object.prototype.hasOwnProperty.call(this.bondRules, key);
    }

    initializeBondRulesFromAtoms(atoms, atom_numbers) {
        this.bondRules = {};
        let tmpAtoms = [];
        for (let i=0; i<atoms.length; i++) {
            tmpAtoms.push({
                atom_number: atom_numbers[atoms[i][0]],
                position: new THREE.Vector3(atoms[i][1], atoms[i][2], atoms[i][3])
            });
        }
        let combinations = utils.getCombinations(tmpAtoms);
        for (let i=0; i<combinations.length; i++) {
            let a = combinations[i][0];
            let b = combinations[i][1];
            let length = a.position.distanceTo(b.position);
            let cutoff = this.getDefaultBondCutoff(a.atom_number, b.atom_number);
            if (length < cutoff) {
                this.setBondRule(a.atom_number, b.atom_number, cutoff);
            }
        }
    }

    refreshBondRulesUI(unique_atom_numbers) {
        if (!this.dom_bond_rules_list || !this.dom_bond_rules_list.length) {
            return;
        }
        this.dom_bond_rules_list.empty();

        let keys = Object.keys(this.bondRules).sort();
        if (!keys.length) {
            this.dom_bond_rules_list.append('<div>none</div>');
            return;
        }

        for (let i=0; i<keys.length; i++) {
            let rule = this.bondRules[keys[i]];
            let label =
                '<span class="atom-badge-pair">' +
                createAtomBadgeHtml(atomic_data.atomic_symbol[rule.a], rule.a, this.getAtomColorHex.bind(this)) +
                '<span class="atom-badge-separator">-</span>' +
                createAtomBadgeHtml(atomic_data.atomic_symbol[rule.b], rule.b, this.getAtomColorHex.bind(this)) +
                '</span>';
            let cutoff = Number(rule.cutoff).toFixed(2);
            this.dom_bond_rules_list.append(
                '<div class="appearance-controls">' +
                '<span>' + label + ' ' + cutoff + '</span>' +
                '<button type="button" data-remove-key="' + keys[i] + '">remove</button>' +
                '</div>'
            );
        }
    }

    //functions to link the DOM buttons with this class
    setCameraDirectionButton(dom_button,direction) {
    /* Bind the action to set the direction of the camera using direction
       direction can be 'x','y','z'
    */
        let self = this;
        dom_button.click( function() { self.setCameraDirection(direction) } );
    }

    setPlayPause(dom_input) {
        dom_input.click( this.playpause.bind(this) );
    }

    setCellCheckbox(dom_checkbox) {
        let self = this;
        dom_checkbox.click( function() {
            self.cell = this.checked;
            self.updatelocal();
        } )
    }

    setDisplayCombo(dom_combo) {
        var self = this;
        dom_combo[0].onchange = function() {
            self.display = dom_combo[0].options[dom_combo[0].selectedIndex].value;
            self.updatelocal(true);
        }
    }

    setShadingCheckbox(dom_checkbox) {
        let self = this;
        this.shading = dom_checkbox.prop('checked');
        dom_checkbox.click( function() {
            self.shading = this.checked;
            self.updatelocal();
        } );
    }

    setWebmButton(dom_button) {
        let self = this;
        /*
        check if its Chrome 1+ taken from
        http://stackoverflow.com/questions/9847580/how-to-detect-safari-chrome-ie-firefox-and-opera-browser
        only show webm button for chrome
        */
        let isChrome = !!window.chrome && !!window.chrome.webstore;
        if (!isChrome) {
            dom_button.hide();
        }

        dom_button.click(function() { self.capturestart('webm'); });
    }

    setGifButton(dom_button) {
        let self = this;
        dom_button.click(function() { self.capturestart('gif'); });
    }

    setArrowsCheckbox(dom_checkbox) {
        let self = this;
        this.dom_drawvectors_checkbox = dom_checkbox;
        this.arrows = dom_checkbox.checked;
        dom_checkbox.click( function() {
            self.arrows = this.checked;
            self.updatelocal();
        });
    }

    setArrowsInput(dom_range) {
        let self = this;
        this.dom_vectors_amplitude_range = dom_range;

        dom_range.val(self.arrowScale);
        dom_range.attr('min',self.minArrowScale);
        dom_range.attr('max',self.maxArrowScale);
        dom_range.attr('step',self.stepArrowScale);
        dom_range.change( function () {
            self.arrowScale = parseFloat(this.value);
        });
    }

   setAmplitudeInput(dom_number,dom_range) {
        let self = this;
        this.dom_amplitude_box = dom_number;
        this.dom_amplitude_range = dom_range;

        dom_number.val(self.amplitude);
        dom_number.keyup( function () {
            if (this.value < dom_range.min) { dom_range.attr('min', this.value); }
            if (this.value > dom_range.max) { dom_range.attr('max', this.value); }
            self.amplitude = parseFloat(this.value);
            dom_range.val(this.value)
        });

        dom_range.val(self.amplitude);
        dom_range.attr('min',self.minAmplitude);
        dom_range.attr('max',self.maxAmplitude);
        dom_range.attr('step',self.stepAmplitude);
        dom_range.change( function () {
            self.amplitude = parseFloat(this.value);
            dom_number.val(this.value);
        });
    }

    isApproximatelyEqual(a, b, tolerance = 1e-6) {
        return Math.abs(Number(a) - Number(b)) <= tolerance;
    }

    setArrowScaleValue(value) {
        value = Number(value);
        if (!Number.isFinite(value)) {
            return;
        }

        this.arrowScale = value;
        if (this.dom_vectors_amplitude_range && this.dom_vectors_amplitude_range.length) {
            if (value > Number(this.dom_vectors_amplitude_range.attr('max'))) {
                this.dom_vectors_amplitude_range.attr('max', value);
            }
            this.dom_vectors_amplitude_range.val(value);
        }
    }

    setAmplitudeValue(value) {
        value = Number(value);
        if (!Number.isFinite(value)) {
            return;
        }

        this.amplitude = value;
        if (this.dom_amplitude_box && this.dom_amplitude_box.length) {
            this.dom_amplitude_box.val(value);
        }
        if (this.dom_amplitude_range && this.dom_amplitude_range.length) {
            if (value > Number(this.dom_amplitude_range.attr('max'))) {
                this.dom_amplitude_range.attr('max', value);
            }
            this.dom_amplitude_range.val(value);
        }
    }

    syncModeScaleDefaults(amplitudeValue, arrowScaleValue = amplitudeValue, force = false) {
        amplitudeValue = Number(amplitudeValue);
        arrowScaleValue = Number(arrowScaleValue);
        if (!Number.isFinite(amplitudeValue) || amplitudeValue < 0) {
            return;
        }
        if (!Number.isFinite(arrowScaleValue) || arrowScaleValue < 0) {
            return;
        }

        let previousDefaultAmplitude = Number(this.defaultAmplitude);
        let previousDefaultArrowScale = Number(this.defaultArrowScale);
        let shouldUpdateAmplitude = force || !this.modeScaleAutoInitialized ||
            this.isApproximatelyEqual(this.amplitude, previousDefaultAmplitude);
        let shouldUpdateArrowScale = force || !this.modeScaleAutoInitialized ||
            this.isApproximatelyEqual(this.arrowScale, previousDefaultArrowScale);

        this.defaultAmplitude = amplitudeValue;
        this.defaultArrowScale = arrowScaleValue;
        this.modeScaleAutoInitialized = true;

        if (shouldUpdateAmplitude) {
            this.setAmplitudeValue(amplitudeValue);
        }
        if (shouldUpdateArrowScale) {
            this.setArrowScaleValue(arrowScaleValue);
        }
    }

    setSpeedInput(dom_range) {
        let self = this;

        dom_range.val(self.speed);
        dom_range.attr('min',self.minSpeed);
        dom_range.attr('max',self.maxSpeed);
        dom_range.attr('step',self.stepSpeed);
        dom_range.change( function () {
            self.speed = this.value;
        });
    }

    setCovalentRadiiSelect(dom_select,dom_input) {
        // Legacy API kept for compatibility. Advanced appearance now owns these controls.
        this.dom_covalent_radii_select = dom_select;
        this.dom_covalent_radii_input = dom_input;
    }

    getSelectedAppearanceAtomNumber() {
        if (Number.isFinite(this.appearanceSelectedAtomNumber)) {
            return this.appearanceSelectedAtomNumber;
        }
        if (this.atom_numbers && this.atom_numbers.length) {
            return this.atom_numbers[0];
        }
        return null;
    }

    setSelectedAppearanceAtomNumber(atomNumber) {
        this.appearanceSelectedAtomNumber = atomNumber;
        if (this.dom_appearance_atom_list && this.dom_appearance_atom_list.length) {
            this.dom_appearance_atom_list.find('button').removeClass('active');
            this.dom_appearance_atom_list.find('button[data-atom-number="' + atomNumber + '"]').addClass('active');
        }
    }

    adjustCovalentRadiiSelect() {
        let unique_atom_numbers = this.atom_numbers.filter((v, i, a) => a.indexOf(v) === i);
        if (!this.dom_appearance_atom_list || !this.dom_appearance_atom_list.length) {
            return;
        }

        let selected = Number(this.getSelectedAppearanceAtomNumber());
        if (!Number.isFinite(selected) || !unique_atom_numbers.includes(selected)) {
            selected = unique_atom_numbers.length ? unique_atom_numbers[0] : null;
        }

        this.dom_appearance_atom_list.empty();
        for (let i=0; i<unique_atom_numbers.length; i++) {
            let atomNumber = unique_atom_numbers[i];
            this.dom_appearance_atom_list.append(
                '<button type="button" data-atom-number="' + atomNumber + '">' +
                createAtomBadgeHtml(atomic_data.atomic_symbol[atomNumber], atomNumber, this.getAtomColorHex.bind(this)) +
                '</button>'
            );
        }

        if (Number.isFinite(selected)) {
            this.setSelectedAppearanceAtomNumber(selected);
        }

        if (!Number.isFinite(selected)) {
            return;
        }
        if (this.dom_atom_color_input && this.dom_atom_color_input.length) {
            this.dom_atom_color_input.val(this.colorToInputHex(this.getAtomColorHex(selected)));
        }
        if (this.dom_atom_radius_input && this.dom_atom_radius_input.length) {
            this.dom_atom_radius_input.val(this.getAtomRadiusScale(selected));
        }

        if (this.dom_bond_add_atom_a && this.dom_bond_add_atom_a.length) {
            let previous = this.dom_bond_add_atom_a.val();
            this.dom_bond_add_atom_a.empty();
            for (let i=0; i<unique_atom_numbers.length; i++) {
                let atomNumber = unique_atom_numbers[i];
                this.dom_bond_add_atom_a.append('<option value="' + atomNumber + '">' + atomic_data.atomic_symbol[atomNumber] + '</option>');
            }
            if (previous !== null && unique_atom_numbers.includes(Number(previous))) {
                this.dom_bond_add_atom_a.val(previous);
            }
        }
        if (this.dom_bond_add_atom_b && this.dom_bond_add_atom_b.length) {
            let previous = this.dom_bond_add_atom_b.val();
            this.dom_bond_add_atom_b.empty();
            for (let i=0; i<unique_atom_numbers.length; i++) {
                let atomNumber = unique_atom_numbers[i];
                this.dom_bond_add_atom_b.append('<option value="' + atomNumber + '">' + atomic_data.atomic_symbol[atomNumber] + '</option>');
            }
            if (previous !== null && unique_atom_numbers.includes(Number(previous))) {
                this.dom_bond_add_atom_b.val(previous);
            }
        }
        if (this.dom_bond_add_cutoff_input && this.dom_bond_add_cutoff_input.length &&
            this.dom_bond_add_atom_a && this.dom_bond_add_atom_b) {
            let a = Number(this.dom_bond_add_atom_a.val());
            let b = Number(this.dom_bond_add_atom_b.val());
            if (Number.isFinite(a) && Number.isFinite(b)) {
                let key = this.getBondRuleKey(a, b);
                let value = this.bondRules[key] ? this.bondRules[key].cutoff : this.getDefaultBondCutoff(a, b);
                this.dom_bond_add_cutoff_input.val(Number(value).toFixed(2));
            }
        }
        this.refreshBondRulesUI(unique_atom_numbers);
    }

    setCovalentRadiiButton(dom_select,dom_input,dom_button) {
        let self = this;
        dom_button.click( function() {
            self.modified_covalent_radii[dom_select.val()] = parseFloat(dom_input.val());
            self.updatelocal();
        });
    }

    setCovalentRadiiResetButton(dom_select,dom_input,dom_button) {
        let self = this;
        dom_button.click( function() {
            self.modified_covalent_radii = JSON.parse(JSON.stringify(atomic_data.covalent_radii));
            dom_input.val(self.modified_covalent_radii[dom_select.val()]);
            self.updatelocal();
        });
    }

    setAdvancedAppearanceControls(
        domAtomList,
        domDisplaySelect,
        domAtomColorInput,
        domArrowColorInput,
        domBondColorInput,
        domBondColorByAtomCheckbox,
        domAtomRadiusInput,
        domBondRadiusInput,
        domArrowRadiusInput,
        domBondRulesList,
        domBondAddAtomA,
        domBondAddAtomB,
        domBondAddCutoffInput,
        domResetAtomButton,
        domResetBondsButton,
        domResetVectorsButton,
    ) {
        let self = this;
        this.dom_appearance_atom_list = domAtomList;
        this.dom_display_select = domDisplaySelect;
        this.dom_atom_color_input = domAtomColorInput;
        this.dom_arrow_color_input = domArrowColorInput;
        this.dom_bond_color_input = domBondColorInput;
        this.dom_bond_color_by_atom_checkbox = domBondColorByAtomCheckbox;
        this.dom_atom_radius_input = domAtomRadiusInput;
        this.dom_bond_radius_input = domBondRadiusInput;
        this.dom_arrow_radius_input = domArrowRadiusInput;
        this.dom_bond_rules_list = domBondRulesList;
        this.dom_bond_add_atom_a = domBondAddAtomA;
        this.dom_bond_add_atom_b = domBondAddAtomB;
        this.dom_bond_add_cutoff_input = domBondAddCutoffInput;
        const updateBondColorInputState = function() {
            if (domBondColorInput && domBondColorInput.length) {
                domBondColorInput.prop('disabled', self.bondColorByAtom);
            }
        };

        if (domAtomList && domAtomList.length) {
            domAtomList.on('click', 'button[data-atom-number]', function() {
                let atomNumber = Number(this.getAttribute('data-atom-number'));
                if (!Number.isFinite(atomNumber)) {
                    return;
                }
                self.setSelectedAppearanceAtomNumber(atomNumber);
                if (domAtomColorInput && domAtomColorInput.length) {
                    domAtomColorInput.val(self.colorToInputHex(self.getAtomColorHex(atomNumber)));
                }
                if (domAtomRadiusInput && domAtomRadiusInput.length) {
                    domAtomRadiusInput.val(self.getAtomRadiusScale(atomNumber));
                }
            });
        }

        const applyAppearanceSettings = function() {
            let atomNumber = Number(self.getSelectedAppearanceAtomNumber());
            let previousDisplay = self.display;
            let previousBondColorByAtom = self.bondColorByAtom;
            let previousBondRadius = self.bondRadius;
            let previousArrowRadius = self.arrowRadius;
            let previousArrowColor = self.arrowcolor;
            let previousBondColor = self.bondscolor;
            let previousAtomColor = Number.isFinite(atomNumber) ? self.getAtomColorHex(atomNumber) : null;
            let previousAtomRadius = Number.isFinite(atomNumber) ? self.getAtomRadiusScale(atomNumber) : null;
            if (Number.isFinite(atomNumber)) {
                if (domAtomColorInput && domAtomColorInput.length) {
                    let rawAtomColor = domAtomColorInput.val();
                    if (rawAtomColor) {
                            // Only persist an override when user picked a non-default color.
                            // If it matches current display default, keep it dynamic across Jmol/Vesta.
                            let defaultHex = self.getDefaultAtomColor(atomNumber);
                            let selectedHex = self.normalizeColorHex(rawAtomColor, defaultHex);
                            if (selectedHex === defaultHex) {
                                self.clearAtomColorOverride(atomNumber);
                            } else {
                                self.atomColorOverrides[atomNumber] = selectedHex;
                            }
                        }
                    }
                if (domAtomRadiusInput && domAtomRadiusInput.length) {
                    let atomScale = Math.max(0.1, parseFloat(domAtomRadiusInput.val()) || self.defaultAtomRadiusScale);
                    self.setAtomRadiusScaleOverride(atomNumber, atomScale);
                    domAtomRadiusInput.val(atomScale);
                }
            }

            if (domDisplaySelect && domDisplaySelect.length) {
                self.display = domDisplaySelect.val() || self.display;
            }
            if (domArrowColorInput && domArrowColorInput.length) {
                self.arrowcolor = self.normalizeColorHex(domArrowColorInput.val(), self.arrowcolor);
            }
            if (!self.bondColorByAtom && domBondColorInput && domBondColorInput.length) {
                self.bondscolor = self.normalizeColorHex(domBondColorInput.val(), self.bondscolor);
            }
            if (domBondColorByAtomCheckbox && domBondColorByAtomCheckbox.length) {
                self.bondColorByAtom = !!domBondColorByAtomCheckbox.prop('checked');
            }
            updateBondColorInputState();
            if (domBondRadiusInput && domBondRadiusInput.length) {
                self.bondRadius = Math.max(0.01, parseFloat(domBondRadiusInput.val()) || self.bondRadius);
                domBondRadiusInput.val(self.bondRadius);
            }
            if (domArrowRadiusInput && domArrowRadiusInput.length) {
                self.arrowRadius = Math.max(0.01, parseFloat(domArrowRadiusInput.val()) || self.arrowRadius);
                domArrowRadiusInput.val(self.arrowRadius);
            }

            let displayChanged = self.display !== previousDisplay;
            let bondColorModeChanged = self.bondColorByAtom !== previousBondColorByAtom;
            let bondRadiusChanged = self.bondRadius !== previousBondRadius;
            let arrowRadiusChanged = self.arrowRadius !== previousArrowRadius;
            let atomRadiusChanged = Number.isFinite(atomNumber) && self.getAtomRadiusScale(atomNumber) !== previousAtomRadius;

            let atomColorChanged = Number.isFinite(atomNumber) && self.getAtomColorHex(atomNumber) !== previousAtomColor;
            let bondColorChanged = self.bondscolor !== previousBondColor;
            let arrowColorChanged = self.arrowcolor !== previousArrowColor;

            if (displayChanged || bondColorModeChanged || bondRadiusChanged || arrowRadiusChanged || atomRadiusChanged) {
                self.updatelocal(true);
            } else if (atomColorChanged || bondColorChanged || arrowColorChanged) {
                self.refreshColorsInPlace(true);
            }
        };

        if (domArrowColorInput && domArrowColorInput.length) {
            domArrowColorInput.val(this.colorToInputHex(this.arrowcolor));
            domArrowColorInput.on('change', function() {
                applyAppearanceSettings();
            });
        }

        if (domBondColorInput && domBondColorInput.length) {
            domBondColorInput.val(this.colorToInputHex(this.bondscolor));
            domBondColorInput.on('change', function() {
                applyAppearanceSettings();
            });
        }
        if (domBondColorByAtomCheckbox && domBondColorByAtomCheckbox.length) {
            domBondColorByAtomCheckbox.prop('checked', this.bondColorByAtom);
            domBondColorByAtomCheckbox.on('change', function() {
                applyAppearanceSettings();
            });
        }
        updateBondColorInputState();

        if (domAtomColorInput && domAtomColorInput.length) {
            domAtomColorInput.on('change', function() {
                applyAppearanceSettings();
            });
        }

        if (domAtomRadiusInput && domAtomRadiusInput.length) {
            let atomNumber = this.getSelectedAppearanceAtomNumber();
            domAtomRadiusInput.val(
                Number.isFinite(atomNumber) ? this.getAtomRadiusScale(atomNumber) : this.defaultAtomRadiusScale
            );
            domAtomRadiusInput.attr('min', 0.1);
            domAtomRadiusInput.attr('max', 5.0);
            domAtomRadiusInput.attr('step', 0.05);
        }

        if (domBondRadiusInput && domBondRadiusInput.length) {
            domBondRadiusInput.val(this.bondRadius);
            domBondRadiusInput.attr('min', 0.01);
            domBondRadiusInput.attr('max', 1.0);
            domBondRadiusInput.attr('step', 0.01);
        }

        if (domArrowRadiusInput && domArrowRadiusInput.length) {
            domArrowRadiusInput.val(this.arrowRadius);
            domArrowRadiusInput.attr('min', 0.01);
            domArrowRadiusInput.attr('max', 1.0);
            domArrowRadiusInput.attr('step', 0.01);
        }

        if (domResetAtomButton && domResetAtomButton.length) {
            domResetAtomButton.click(function() {
                let atomNumber = self.getSelectedAppearanceAtomNumber();
                if (Number.isFinite(atomNumber)) {
                    self.clearAtomColorOverride(atomNumber);
                    delete self.atomRadiusScaleOverrides[atomNumber];
                }
                if (self.dom_atom_color_input && self.dom_atom_color_input.length && Number.isFinite(atomNumber)) {
                    self.dom_atom_color_input.val(self.colorToInputHex(self.getAtomColorHex(atomNumber)));
                }
                if (self.dom_atom_radius_input && self.dom_atom_radius_input.length && Number.isFinite(atomNumber)) {
                    self.dom_atom_radius_input.val(self.getAtomRadiusScale(atomNumber));
                }
                self.updatelocal(true);
            });
        }

        if (domResetBondsButton && domResetBondsButton.length) {
            domResetBondsButton.click(function() {
                self.bondscolor = self.defaultBondsColor;
                self.bondColorByAtom = self.defaultBondColorByAtom;
                self.bondRadius = self.defaultBondRadius;
                if (self.dom_bond_color_input && self.dom_bond_color_input.length) {
                    self.dom_bond_color_input.val(self.colorToInputHex(self.bondscolor));
                }
                if (self.dom_bond_color_by_atom_checkbox && self.dom_bond_color_by_atom_checkbox.length) {
                    self.dom_bond_color_by_atom_checkbox.prop('checked', self.bondColorByAtom);
                }
                updateBondColorInputState();
                if (self.dom_bond_radius_input && self.dom_bond_radius_input.length) {
                    self.dom_bond_radius_input.val(self.bondRadius);
                }
                self.initializeBondRulesFromAtoms(self.atoms || [], self.phonon ? self.phonon.atom_numbers : []);
                self.refreshBondRulesUI(this.atom_numbers || []);
                self.updatelocal(true);
            });
        }

        if (domBondRulesList && domBondRulesList.length) {
            domBondRulesList.on('click', 'button[data-remove-key]', function() {
                let key = this.getAttribute('data-remove-key');
                if (key && self.bondRules[key]) {
                    delete self.bondRules[key];
                    self.refreshBondRulesUI(self.atom_numbers || []);
                    self.updatelocal();
                }
            });
        }

        const addBondRuleFromControls = function() {
            let a = Number(domBondAddAtomA.val());
            let b = Number(domBondAddAtomB.val());
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
                return;
            }
            let defaultCutoff = self.getDefaultBondCutoff(a, b);
            let cutoff = defaultCutoff;
            if (domBondAddCutoffInput && domBondAddCutoffInput.length) {
                let parsed = parseFloat(domBondAddCutoffInput.val());
                if (Number.isFinite(parsed) && parsed > 0) {
                    cutoff = parsed;
                }
                domBondAddCutoffInput.val(cutoff.toFixed(2));
            }
            self.setBondRule(a, b, cutoff);
            self.refreshBondRulesUI(self.atom_numbers || []);
            self.updatelocal();
        };

        const updateBondCutoffInput = function() {
            if (!domBondAddCutoffInput || !domBondAddCutoffInput.length) {
                return;
            }
            let a = Number(domBondAddAtomA.val());
            let b = Number(domBondAddAtomB.val());
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
                return;
            }
            let key = self.getBondRuleKey(a, b);
            let value = self.bondRules[key] ? self.bondRules[key].cutoff : self.getDefaultBondCutoff(a, b);
            domBondAddCutoffInput.val(Number(value).toFixed(2));
        };
        if (domBondAddAtomA && domBondAddAtomA.length) {
            domBondAddAtomA.on('change', updateBondCutoffInput);
        }
        if (domBondAddAtomB && domBondAddAtomB.length) {
            domBondAddAtomB.on('change', updateBondCutoffInput);
        }
        if (domBondAddCutoffInput && domBondAddCutoffInput.length) {
            domBondAddCutoffInput.on('keydown', function(event) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    addBondRuleFromControls();
                }
            });
        }

        if (domResetVectorsButton && domResetVectorsButton.length) {
            domResetVectorsButton.click(function() {
                self.arrowcolor = self.defaultArrowColor;
                self.arrowRadius = self.defaultArrowRadius;
                self.arrowScale = self.defaultArrowScale;
                self.arrows = false;

                if (self.dom_arrow_color_input && self.dom_arrow_color_input.length) {
                    self.dom_arrow_color_input.val(self.colorToInputHex(self.arrowcolor));
                }
                if (self.dom_arrow_radius_input && self.dom_arrow_radius_input.length) {
                    self.dom_arrow_radius_input.val(self.arrowRadius);
                }
                if (self.dom_vectors_amplitude_range && self.dom_vectors_amplitude_range.length) {
                    self.dom_vectors_amplitude_range.val(self.arrowScale);
                }
                if (self.dom_drawvectors_checkbox && self.dom_drawvectors_checkbox.length) {
                    self.dom_drawvectors_checkbox.prop('checked', self.arrows);
                }
                self.updatelocal();
            });
        }

        // Enter in text/number fields applies the whole appearance form.
        let enterToUpdateInputs = [
            domAtomRadiusInput,
            domBondRadiusInput,
            domArrowRadiusInput
        ];
        for (let i = 0; i < enterToUpdateInputs.length; i++) {
            let domInput = enterToUpdateInputs[i];
            if (domInput && domInput.length) {
                domInput.on('keydown', function(event) {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        applyAppearanceSettings();
                    }
                });
            }
        }
    }

    init(phonon) {
        /*
        Initialize the phonon animation
        */


        //add camera
        this.camera = new THREE.PerspectiveCamera( this.cameraViewAngle, this.dimensions.ratio,
                                                   this.cameraNear, this.cameraFar );
        this.setCameraDirection('z');

        //add lights to the camera
        if (this.display == 'vesta') {
            this.pointLight = new THREE.PointLight( 0xffffff, 1.2 );
            this.pointLight.position.set(1, 1, 1);
        } else {
            this.pointLight = new THREE.PointLight( 0xdddddd );
            this.pointLight.position.set(1, 1, 2);
        }
        this.pointLight.visible = true;
        this.camera.add(this.pointLight);

        //controls
        this.controls = new TrackballControls( this.camera, this.container0 );
        this.controls.rotateSpeed = 1.0;
        this.controls.zoomSpeed = 1.0;
        this.controls.panSpeed = 0.3;
        this.controls.noZoom = false;
        this.controls.noPan = false;
        this.controls.staticMoving = true;
        this.controls.dynamicDampingFactor = 0.3;
        this.controls.addEventListener( 'change', function() {
            this.needsRender = true;
            if (this.paused) {
                this.render();
            }
        }.bind(this) );

        // world
        this.scene = new THREE.Scene();

        // renderer
        this.renderer = new THREE.WebGLRenderer( { antialias: true } );
        this.renderer.setClearColor( 0xffffff );
        this.renderer.setPixelRatio( window.devicePixelRatio );
        this.renderer.shadowMap.enabled = false;
        this.renderer.setSize( this.dimensions.width , this.dimensions.height );
        this.container0.appendChild( this.renderer.domElement );
        this.canvas = this.renderer.domElement;
        this.canvas.style.display = 'block';

        // Ensure a visible drawing area even when CSS/flex layout reports 0 height.
        if (!this.container0.clientHeight) {
            this.container0.style.height = this.dimensions.height + 'px';
        }
        if (this.container0.parentElement && !this.container0.parentElement.clientHeight) {
            this.container0.parentElement.style.height = this.dimensions.height + 'px';
        }
        //this.canvas.style.width = this.dimensions.width + "px";
        //this.canvas.style.height = this.dimensions.height + "px";

        //frame counter
        this.stats = new Stats();
        this.container0.appendChild( this.stats.domElement );

        //resizer
        window.addEventListener( 'resize', this.onWindowResize.bind(this), false );
        this.onWindowResize();
    }

    captureend(format) {
        if (!this.capturer || this.captureState !== 'capturing') {
            return;
        }

        const capturer = this.capturer;
        this.capturer = null;
        this.captureState = 'saving';
        const progress = document.getElementById('progress');
        const filename = this.getCaptureFilename(format);

        capturer.stop();
        capturer.save((url) => {
            let element = document.createElement('a');
            element.setAttribute('href', url);
            element.setAttribute('download', filename);
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            //remove progress bar
            if (progress) {
                progress.style.width = '0%';
            }
            this.captureState = 'idle';
        });
    }

    capturestart(format) {
        if (this.capturer || this.captureState !== 'idle') {
            return;
        }
        if (format === 'gif' && typeof globalThis.GIF !== 'function') {
            const message = 'GIF export is currently unavailable. Please reload the page and try again.';
            if (typeof alert === 'function') {
                alert(message);
            } else {
                console.warn(message);
            }
            return;
        }

        let progress = document.getElementById( 'progress' );
        if (progress) {
            progress.style.width = '0%';
        }

        let options = { format: format,
                        workersPath: 'libs/',
                        verbose: true,
                        frameMax: this.fps,
                        end: this.captureend.bind(this,format),
                        framerate: this.fps,
                        onProgress: function( p ) {
                            if (progress) {
                                progress.style.width = ( p * 100 ) + '%';
                            }
                        }
                      }

        this.capturer = new globalThis.CCapture( options ),
        this.captureState = 'capturing';
        this.capturer.start();
    }

    getCaptureFilename(format) {
        let base = this.phonon && this.phonon.name ? this.phonon.name : 'phonon';
        let suffix = '';
        if (Number.isFinite(this.captureK) && Number.isFinite(this.captureN)) {
            suffix = '_k' + this.captureK + '_n' + this.captureN;
        }
        let safe = String(base)
            .trim()
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9._-]/g, '');
        if (!safe) {
            safe = 'phonon';
        }
        return safe + suffix + '.' + format;
    }

    setCameraDirection(direction) {
        if (direction == 'x') {
            this.camera.position.set( this.cameraDistance, 0, 0);
            this.camera.up.set( 0, 0, 1 );
        }
        if (direction == 'y') {
            this.camera.position.set( 0, this.cameraDistance, 0);
            this.camera.up.set( 0, 0, 1 );
        }
        if (direction == 'z') {
            this.camera.position.set( 0, 0, this.cameraDistance);
            this.camera.up.set( 0, 1, 0 );
        }
    }

    getAtypes(atom_numbers) {
        this.materials = [];
        this.atom_numbers = atom_numbers;

        for (let i=0; i < atom_numbers.length; i++) {
            let n = atom_numbers[i];
            let atomColor = this.getAtomColor(n);
            if (!this.shading) {
                let material = new THREE.MeshBasicMaterial( { blending: THREE.NormalBlending } );
                material.color.copy(atomColor);
                this.materials.push( material );
            } else if (this.display == 'vesta') {
                let material = new THREE.MeshPhongMaterial( {reflectivity:1, shininess: 80} );
                material.color.copy(atomColor);
                this.materials.push( material );
            } else {
                let material = new THREE.MeshLambertMaterial( { blending: THREE.NormalBlending } );
                material.color.copy(atomColor);
                this.materials.push( material );
            }
        }
    }

    refreshAtomMeshColors() {
        if (!this.atommeshes || !this.atom_numbers) {
            return;
        }

        for (let i=0; i<this.atommeshes.length; i++) {
            let mesh = this.atommeshes[i];
            let typeIndex = this.atommeshTypeIndices[i];
            if (!mesh || !mesh.material || !Number.isFinite(typeIndex)) {
                continue;
            }

            let atomNumber = this.atom_numbers[typeIndex];
            if (!Number.isFinite(atomNumber)) {
                continue;
            }

            mesh.material.color.copy(this.getAtomColor(atomNumber));
            mesh.material.needsUpdate = true;
        }
    }

    refreshBondMeshColors() {
        if (!this.bondmeshes || !this.bondmeshes.length) {
            return;
        }

        if (this.bondColorByAtom && this.bondmeshes.length >= 2) {
            let meshA = this.bondmeshes[0];
            let meshB = this.bondmeshes[1];

            for (let i=0; i<this.bonds.length; i++) {
                let bond = this.bonds[i];
                if (meshA.setColorAt) {
                    meshA.setColorAt(i, this.getAtomColor(bond.a_atom_number));
                }
                if (meshB.setColorAt) {
                    meshB.setColorAt(i, this.getAtomColor(bond.b_atom_number));
                }
            }

            if (meshA.instanceColor) { meshA.instanceColor.needsUpdate = true; }
            if (meshB.instanceColor) { meshB.instanceColor.needsUpdate = true; }
            if (meshA.material) { meshA.material.needsUpdate = true; }
            if (meshB.material) { meshB.material.needsUpdate = true; }
            return;
        }

        for (let i=0; i<this.bondmeshes.length; i++) {
            let mesh = this.bondmeshes[i];
            if (!mesh || !mesh.material) {
                continue;
            }
            mesh.material.color.setHex(this.bondscolor);
            mesh.material.needsUpdate = true;
        }
    }

    refreshArrowColors() {
        if (!this.arrowobjects || !this.arrowobjects.length) {
            return;
        }

        for (let i=0; i<this.arrowobjects.length; i++) {
            let arrow = this.arrowobjects[i];
            if (!arrow || !arrow.material) {
                continue;
            }
            arrow.material.color.setHex(this.arrowcolor);
            arrow.material.needsUpdate = true;
        }
    }

    refreshColorsInPlace(notifyAppearanceUpdate = false) {
        this.refreshAtomMeshColors();
        this.refreshBondMeshColors();
        this.refreshArrowColors();
        this.adjustCovalentRadiiSelect();
        if (notifyAppearanceUpdate && typeof this.onAppearanceUpdated === 'function') {
            this.onAppearanceUpdated();
        }
        this.needsRender = true;
        this.startAnimationLoop();
    }

    addCell(lat) {
        /*
        Represent the unit cell
        */
        if (this.cell) {
          let material = new THREE.LineBasicMaterial({ color: 0x000000 });
          let points = [];

          let o = this.geometricCenter;
          let zero = new THREE.Vector3(0,0,0);
          let c = new THREE.Vector3(0,0,0);
          let x = new THREE.Vector3(lat[0][0], lat[0][1], lat[0][2]);
          let y = new THREE.Vector3(lat[1][0], lat[1][1], lat[1][2]);
          let z = new THREE.Vector3(lat[2][0], lat[2][1], lat[2][2]);

          //lower part
          c.copy(zero);
          c.sub(o); points.push(c.clone());
          c.add(x); points.push(c.clone());
          c.add(y); points.push(c.clone());
          c.sub(x); points.push(c.clone());
          c.sub(y); points.push(c.clone());

          //upper part
          c.copy(zero); c.add(z);
          c.sub(o); points.push(c.clone());
          c.add(x); points.push(c.clone());
          c.add(y); points.push(c.clone());
          c.sub(x); points.push(c.clone());
          c.sub(y); points.push(c.clone());

          //vertical lines
          c.copy(zero);
          c.sub(o); points.push(c.clone());
          c.add(z); points.push(c.clone());

          c.add(x); points.push(c.clone());
          c.sub(z); points.push(c.clone());

          c.add(y); points.push(c.clone());
          c.add(z); points.push(c.clone());

          c.sub(x); points.push(c.clone());
          c.sub(z); points.push(c.clone());

          let geometry = new THREE.BufferGeometry().setFromPoints(points);
          let line = new THREE.Line(geometry, material);
          this.scene.add(line);
        }

    }

    addStructure(atoms,atom_numbers) {
        /*
        Add the atoms from the phononweb object
        */
        this.atomobjects  = [];
        this.atommeshes = [];
        this.atommeshTypeIndices = [];
        this.atomInstanceRefs = [];
        this.bondobjects  = [];
        this.bondmesh = null;
        this.bondmeshes = [];
        this.arrowobjects = [];
        this.atompos = [];
        this.atomvel = [];
        this.bonds = [];
        this.nndist = this.phonon.nndist+0.05;

        //get geometric center
        let geometricCenter = new THREE.Vector3(0,0,0);
        for (let i=0; i<atoms.length; i++) {
            let pos = new THREE.Vector3(atoms[i][1], atoms[i][2], atoms[i][3]);
            geometricCenter.add(pos);
        }
        geometricCenter.multiplyScalar(1.0/atoms.length);
        this.geometricCenter = geometricCenter;

        // Build one instanced mesh per atom type/material.
        let instancesPerType = new Map();
        for (let i=0; i<atoms.length; i++) {
            let typeIndex = atoms[i][0];
            instancesPerType.set(typeIndex, (instancesPerType.get(typeIndex) || 0) + 1);
        }

        let meshesByType = new Map();
        let nextInstanceByType = new Map();
        instancesPerType.forEach((count, typeIndex) => {
            let sphereGeometry;
            let atomNumber = atom_numbers[typeIndex];
            let atomScale = this.getAtomRadiusScale(atomNumber);
            if (this.display == 'vesta') {
                sphereGeometry = new THREE.SphereGeometry(
                    (atomic_data.covalent_radii[atomNumber]/2.3) * atomScale,
                    this.sphereLat,
                    this.sphereLon
                );
            } else {
                sphereGeometry = new THREE.SphereGeometry(
                    this.sphereRadius * atomScale,
                    this.sphereLat,
                    this.sphereLon
                );
            }

            let instancedMesh = new THREE.InstancedMesh(sphereGeometry, this.materials[typeIndex], count);
            instancedMesh.name = "atoms-" + typeIndex;
            instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            instancedMesh.frustumCulled = false;
            this.scene.add(instancedMesh);
            this.atommeshes.push(instancedMesh);
            this.atommeshTypeIndices.push(typeIndex);
            meshesByType.set(typeIndex, instancedMesh);
            nextInstanceByType.set(typeIndex, 0);
        });

        //add an atom state for each atom and assign it to the corresponding instance
        for (let i=0; i<atoms.length; i++) {
            let typeIndex = atoms[i][0];
            let pos = new THREE.Vector3(atoms[i][1], atoms[i][2], atoms[i][3]);
            pos.sub(geometricCenter);

            let atomState = {
                name: "atom",
                atom_number: atom_numbers[typeIndex],
                position: pos.clone(),
                velocity: vec_0.clone()
            };

            let mesh = meshesByType.get(typeIndex);
            let instanceId = nextInstanceByType.get(typeIndex);
            nextInstanceByType.set(typeIndex, instanceId + 1);
            this.atomInstanceRefs.push({ mesh: mesh, instanceId: instanceId });

            this.instanceDummy.position.copy(pos);
            this.instanceDummy.quaternion.set(0, 0, 0, 1);
            this.instanceDummy.scale.set(1, 1, 1);
            this.instanceDummy.updateMatrix();
            mesh.setMatrixAt(instanceId, this.instanceDummy.matrix);

            this.atomobjects.push(atomState);
            this.atompos.push(pos);
        }

        for (let i=0; i<this.atommeshes.length; i++) {
            this.atommeshes[i].instanceMatrix.needsUpdate = true;
        }

        //add arrows
        if (this.arrows) {

            //arrow geometry
            let arrowGeometry = new THREE.CylinderGeometry( 0,
                                                            this.arrowHeadRadiusRatio*this.arrowRadius,
                                                            this.arrowLength*this.arrowHeadLengthRatio );

            let axisGeometry  = new THREE.CylinderGeometry( this.arrowRadius, this.arrowRadius,
                                                            this.arrowLength );

            let AxisMaterial;
            if (this.shading) {
                AxisMaterial = new THREE.MeshLambertMaterial( {
                    color: this.arrowcolor,
                    blending: THREE.NormalBlending
                } );
            } else {
                AxisMaterial = new THREE.MeshBasicMaterial( {
                    color: this.arrowcolor,
                    blending: THREE.NormalBlending
                } );
            }

            for (let i=0; i<atoms.length; i++) {

                //add an arrow for each atom
                let ArrowMesh = new THREE.Mesh( arrowGeometry, AxisMaterial );
                let length = (this.arrowLength+this.arrowLength*this.arrowHeadLengthRatio)/2;
                ArrowMesh.position.y = length;

                //merge form of the arrow with cylinder
                ArrowMesh.updateMatrix();
                axisGeometry.merge(ArrowMesh.geometry,ArrowMesh.matrix);
                let object = new THREE.Mesh( axisGeometry, AxisMaterial );
                object.position.copy( geometricCenter );

                this.scene.add( object );
                this.arrowobjects.push( object );
            }
        }

        //obtain combinations two by two of all the atoms
        let combinations = utils.getCombinations( this.atomobjects );
        let a, b, length;
        //collect bonds first
        for (let i=0; i<combinations.length; i++) {
            a = combinations[i][0];
            b = combinations[i][1];
            let ad = a.position;
            let bd = b.position;

            // Draw bond only if the corresponding bond rule exists and cutoff is satisfied.
            length = ad.distanceTo(bd);
            let key = this.getBondRuleKey(a.atom_number, b.atom_number);
            let rule = this.bondRules[key];
            if (rule && length < rule.cutoff) {
                this.bonds.push({
                    a: ad,
                    b: bd,
                    a_atom_number: a.atom_number,
                    b_atom_number: b.atom_number,
                    baseLength: length
                });
            }
        }

        const createBondMaterial = function(vertexColorsEnabled) {
            let bondMaterialConfig = {
                color: this.bondscolor,
                blending: THREE.NormalBlending,
                vertexColors: vertexColorsEnabled
            };
            if (this.shading) {
                return new THREE.MeshLambertMaterial(bondMaterialConfig);
            }
            return new THREE.MeshBasicMaterial(bondMaterialConfig);
        }.bind(this);

        //build bond meshes
        if (this.bonds.length > 0) {
            let bondGeometry = new THREE.CylinderGeometry(
                this.bondRadius, this.bondRadius, 1.0, this.bondSegments, this.bondVertical, true
            );

            if (this.bondColorByAtom) {
                let meshA = new THREE.InstancedMesh(bondGeometry, createBondMaterial(true), this.bonds.length);
                let meshB = new THREE.InstancedMesh(bondGeometry, createBondMaterial(true), this.bonds.length);
                meshA.name = "bonds-a";
                meshB.name = "bonds-b";
                meshA.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                meshB.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                meshA.frustumCulled = false;
                meshB.frustumCulled = false;

                let dir = new THREE.Vector3();
                for (let i=0; i<this.bonds.length; i++) {
                    let bond = this.bonds[i];
                    let lengthNow = bond.a.distanceTo(bond.b);
                    let bonddata = getBond(bond.a, bond.b);
                    dir.copy(bond.b).sub(bond.a).normalize();
                    let offset = dir.clone().multiplyScalar(lengthNow * 0.25);

                    this.instanceDummy.quaternion.copy(bonddata.quaternion);
                    this.instanceDummy.scale.set(1, lengthNow * 0.5, 1);

                    this.instanceDummy.position.copy(bonddata.midpoint).sub(offset);
                    this.instanceDummy.updateMatrix();
                    meshA.setMatrixAt(i, this.instanceDummy.matrix);

                    this.instanceDummy.position.copy(bonddata.midpoint).add(offset);
                    this.instanceDummy.updateMatrix();
                    meshB.setMatrixAt(i, this.instanceDummy.matrix);

                    if (meshA.setColorAt) {
                        meshA.setColorAt(i, this.getAtomColor(bond.a_atom_number));
                    }
                    if (meshB.setColorAt) {
                        meshB.setColorAt(i, this.getAtomColor(bond.b_atom_number));
                    }
                }

                meshA.instanceMatrix.needsUpdate = true;
                meshB.instanceMatrix.needsUpdate = true;
                if (meshA.instanceColor) {
                    meshA.instanceColor.needsUpdate = true;
                }
                if (meshB.instanceColor) {
                    meshB.instanceColor.needsUpdate = true;
                }

                this.bondmeshes.push(meshA);
                this.bondmeshes.push(meshB);
                this.bondmesh = meshA;
                this.scene.add(meshA);
                this.scene.add(meshB);
            } else {
                this.bondmesh = new THREE.InstancedMesh(
                    bondGeometry,
                    createBondMaterial(false),
                    this.bonds.length
                );
                this.bondmesh.name = "bonds";
                this.bondmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                this.bondmesh.frustumCulled = false;

                for (let i=0; i<this.bonds.length; i++) {
                    let bond = this.bonds[i];
                    let bonddata = getBond(bond.a, bond.b);
                    this.instanceDummy.position.copy(bonddata.midpoint);
                    this.instanceDummy.quaternion.copy(bonddata.quaternion);
                    this.instanceDummy.scale.set(1, bond.baseLength, 1);
                    this.instanceDummy.updateMatrix();
                    this.bondmesh.setMatrixAt(i, this.instanceDummy.matrix);
                }

                this.bondmesh.instanceMatrix.needsUpdate = true;
                this.bondmeshes.push(this.bondmesh);
                this.scene.add(this.bondmesh);
            }
        }

    }

    removeStructure() {
        let nobjects = this.scene.children.length;
        let scene = this.scene

        //remove everything
        for (let i=nobjects-1; i>=0; i--) {
            scene.remove(scene.children[i]);
        }
    }

    addLights() {
        this.scene.add(this.camera);
        if (this.pointLight) {
            this.pointLight.visible = true;
        }
        let light = new THREE.AmbientLight( 0x333333 );
        this.scene.add( light );
    }

    update(phononweb) {
        /*
        this is the entry point of the phononweb
        structure.
        It must contain:
            1. atoms
            2. vibrations
            3. phonon
        */

        this.phonon     = phononweb.phonon;
        this.vibrations = phononweb.vibrations;
        this.atoms      = phononweb.atoms;
        this.captureK   = Number(phononweb.k);
        this.captureN   = Number(phononweb.n);
        this.vibrationComponents = this.vibrations.map((v) => [
            getComplexParts(v[0]),
            getComplexParts(v[1]),
            getComplexParts(v[2])
        ]);
        this.initializeBondRulesFromAtoms(this.atoms, this.phonon.atom_numbers);

        //check if it is initialized
        if (!this.initialized) {
            this.init(phononweb)
            this.initialized = true;
        }

        this.updatelocal();
    }

    setAppearanceUpdatedCallback(callback) {
        this.onAppearanceUpdated = callback;
    }

    updatelocal(notifyAppearanceUpdate = false) {
        this.removeStructure();
        this.addLights();
        this.getAtypes(this.phonon.atom_numbers);
        this.addStructure(this.atoms,this.phonon.atom_numbers);
        this.addCell(this.phonon.lat);
        this.adjustCovalentRadiiSelect();
        if (notifyAppearanceUpdate && typeof this.onAppearanceUpdated === 'function') {
            this.onAppearanceUpdated();
        }
        this.needsRender = true;
        this.startAnimationLoop();
    }

    getContainerDimensions() {
        let w = this.container.width();
        let h = this.container.height();

        // In module/deferred startup paths, initial flex layout can report 0x0.
        // Fall back to actual DOM rects (container, parent, then window) so WebGL gets a real size.
        if (!w || !h) {
            let rect = this.container0.getBoundingClientRect();
            w = rect.width;
            h = rect.height;
        }
        if ((!w || !h) && this.container0.parentElement) {
            let rect = this.container0.parentElement.getBoundingClientRect();
            w = rect.width;
            h = rect.height;
        }
        if (!w || !h) {
            w = Math.max(window.innerWidth * 0.5, 300);
            h = Math.max(window.innerHeight * 0.5, 300);
        }

        let dimensions = { width: w,
                           height: h,
                           ratio: ( w / h ) };
        return dimensions;
    }

    onWindowResize() {
        this.dimensions = this.getContainerDimensions();

        this.camera.aspect = this.dimensions.ratio;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize( this.dimensions.width, this.dimensions.height );
        this.controls.handleResize();
        this.needsRender = true;
        this.render();
    }

    playpause() {
        if (this.paused) { this.paused = false; }
        else             { this.paused = true;  }
        if (!this.paused) {
            this.lastFrameTime = null;
        }
        this.needsRender = true;
    }

    pause() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    startAnimationLoop() {
        if (this.animationFrameId === null) {
            this.lastFrameTime = null;
            this.animationFrameId = requestAnimationFrame( this.animate.bind(this) );
        }
    }

    animate(timestamp) {
        if (this.lastFrameTime === null) {
            this.lastFrameTime = timestamp;
        }

        let dt = (timestamp - this.lastFrameTime) / 1000.0;
        this.lastFrameTime = timestamp;
        if (dt > 0.05) dt = 0.05;

        if (!this.paused) {
            this.time += dt * this.speed;
        }
        this.controls.update();
        if (!this.paused || this.needsRender) {
            this.render();
        }
        this.animationFrameId = requestAnimationFrame( this.animate.bind(this) );
    }

    render() {
        let phaseAngle = this.time * 2.0 * mat.pi;
        let phaseRe = this.amplitude * Math.cos(phaseAngle);
        let phaseIm = this.amplitude * Math.sin(phaseAngle);
        let v = new THREE.Vector3();

        if (!this.paused) {

            //update positions according to vibrational modes
            for (let i=0; i<this.atomobjects.length; i++) {
                let atom       = this.atomobjects[i];
                let atompos    = this.atompos[i];
                let vibrations = this.vibrationComponents[i];

                let vx = phaseRe * vibrations[0][0] - phaseIm * vibrations[0][1];
                let vy = phaseRe * vibrations[1][0] - phaseIm * vibrations[1][1];
                let vz = phaseRe * vibrations[2][0] - phaseIm * vibrations[2][1];

                let x  = atompos.x + vx;
                let y  = atompos.y + vy;
                let z  = atompos.z + vz;

                atom.position.set( x, y, z );
                let atomInstance = this.atomInstanceRefs[i];
                this.instanceDummy.position.copy(atom.position);
                this.instanceDummy.quaternion.set(0, 0, 0, 1);
                this.instanceDummy.scale.set(1, 1, 1);
                this.instanceDummy.updateMatrix();
                atomInstance.mesh.setMatrixAt(atomInstance.instanceId, this.instanceDummy.matrix);

                if (this.arrows) {

                    //velocity vector
                    v.set(vx,vy,vz);
                    let vlength = v.length()/this.amplitude;
                    let s = .5*this.arrowScale/this.amplitude;

                    this.arrowobjects[i].position.set(x+vx*s,y+vy*s,z+vz*s);
                    this.arrowobjects[i].scale.y = vlength*this.arrowScale;
                    this.arrowobjects[i].quaternion.setFromUnitVectors(vec_y,v.normalize());
                }
            }

            //update the bonds positions
            for (let i=0; i<this.bonds.length; i++) {
                let bond = this.bonds[i];
                let bonddata = getBond(bond.a, bond.b);
                this.instanceDummy.quaternion.copy(bonddata.quaternion);
                let lengthNow = bond.a.distanceTo(bond.b);
                if (this.bondColorByAtom && this.bondmeshes.length >= 2) {
                    let dir = new THREE.Vector3().copy(bond.b).sub(bond.a).normalize();
                    let offset = dir.multiplyScalar(lengthNow * 0.25);

                    this.instanceDummy.scale.set(1, lengthNow * 0.5, 1);

                    this.instanceDummy.position.copy(bonddata.midpoint).sub(offset);
                    this.instanceDummy.updateMatrix();
                    this.bondmeshes[0].setMatrixAt(i, this.instanceDummy.matrix);

                    this.instanceDummy.position.copy(bonddata.midpoint).add(offset);
                    this.instanceDummy.updateMatrix();
                    this.bondmeshes[1].setMatrixAt(i, this.instanceDummy.matrix);
                } else if (this.bondmesh) {
                    this.instanceDummy.position.copy(bonddata.midpoint);
                    this.instanceDummy.scale.set(1, lengthNow, 1);
                    this.instanceDummy.updateMatrix();
                    this.bondmesh.setMatrixAt(i, this.instanceDummy.matrix);
                }
            }

            for (let i=0; i<this.atommeshes.length; i++) {
                this.atommeshes[i].instanceMatrix.needsUpdate = true;
            }
            if (this.bondmeshes && this.bondmeshes.length) {
                for (let i=0; i<this.bondmeshes.length; i++) {
                    this.bondmeshes[i].instanceMatrix.needsUpdate = true;
                }
            } else if (this.bondmesh) {
                this.bondmesh.instanceMatrix.needsUpdate = true;
            }

        }

        this.renderer.render( this.scene, this.camera );

        //if the capturer exists then capture
        if (this.capturer) {
            this.capturer.capture( this.canvas );
        }

        this.stats.update();
        this.needsRender = false;
    }
}
