import * as THREE from 'three';
import { TrackballControls } from './static_libs/TrackballControls.js';
import { atomic_symbol, covalent_radii, jmol_colors, vesta_colors } from './atomic_data.js';
import { createAtomBadgeHtml } from './atomcolors.js';
import { buildMarchingCubesGeometry } from './marchingcubesgeometry.js';
import { getCombinations } from './utils.js';

const vecY = new THREE.Vector3(0, 1, 0);

function getBond(point1, point2) {
    const direction = new THREE.Vector3().subVectors(point2, point1);

    return {
        quaternion: new THREE.Quaternion().setFromUnitVectors(vecY, direction.clone().normalize()),
        midpoint: point1.clone().add(direction.multiplyScalar(0.5)),
    };
}

export class ExcitonWf {

    constructor() {
        this.display = 'jmol';
        this.shading = true;
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.values = null;
        this.sizex = 1;
        this.sizey = 1;
        this.sizez = 1;
        this.cell = null;
        this.isolevel = 0.02;
        this.excitonIndex = 0;
        this.isInitialized = false;

        this.cameraViewAngle = 18;
        this.cameraNear = 0.1;
        this.cameraFar = 5000;
        this.cameraDistance = 300;

        this.sphereRadius = 0.5;
        this.sphereLat = 12;
        this.sphereLon = 12;
        this.bondRadius = 0.1;
        this.bondSegments = 6;
        this.bondVertical = 1;

        this.bondscolor = 0xffffff;
        this.defaultBondsColor = this.bondscolor;
        this.bondColorByAtom = true;
        this.defaultBondColorByAtom = this.bondColorByAtom;
        this.defaultBondRadius = this.bondRadius;
        this.atomColorOverrides = {};
        this.atomRadiusScaleOverrides = {};
        this.defaultAtomRadiusScale = 1.0;
        this.appearanceSelectedAtomNumber = null;
        this.bondRules = {};
        this.marchingCubesWorker = null;
        this.marchingCubesWorkerFailed = false;
        this.marchingCubesRequestId = 0;
        this.marchingCubesWorkerBusy = false;
        this.isosurfacePreviewCache = null;
    }

    init(container) {
        this.container = container;
        const containerElement = container.get(0);
        this.dimensions = this.getContainerDimensions();

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            this.cameraViewAngle,
            this.dimensions.ratio,
            this.cameraNear,
            this.cameraFar,
        );
        this.camera.position.set(0, 0, this.cameraDistance);
        this.camera.lookAt(this.scene.position);

        this.pointLight = new THREE.PointLight(0xdddddd);
        this.pointLight.position.set(1, 1, 2);
        this.pointLight.visible = true;
        this.camera.add(this.pointLight);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setClearColor(0xffffff);
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(this.dimensions.width, this.dimensions.height, false);
        containerElement.appendChild(this.renderer.domElement);
        this.canvas = this.renderer.domElement;
        this.canvas.style.display = 'block';

        if (!containerElement.clientHeight) {
            containerElement.style.height = `${this.dimensions.height}px`;
        }
        if (containerElement.parentElement && !containerElement.parentElement.clientHeight) {
            containerElement.parentElement.style.height = `${this.dimensions.height}px`;
        }

        this.controls = new TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 1.0;
        this.controls.zoomSpeed = 1.0;
        this.controls.panSpeed = 0.3;
        this.controls.staticMoving = true;
        this.controls.dynamicDampingFactor = 0.3;

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.isInitialized = true;
        this.onWindowResize();
        this.animate();
    }

    setData(absorption) {
        this.excitons = absorption.excitons;
        this.excitonIndex = absorption.excitonIndex;
        this.values = absorption.excitons[this.excitonIndex].datagrid;
        this.sizex = absorption.sizex;
        this.sizey = absorption.sizey;
        this.sizez = absorption.sizez;
        this.cell = absorption.cell;
        this.gridCell = absorption.gridCell || absorption.cell;
        this.atoms = absorption.atoms;
        this.natoms = absorption.atoms.length;
        this.atom_numbers = absorption.atom_numbers;
        this.clearIsosurfacePreviewCache();
        this.updateRecommendedIsolevel();

        this.geometricCenter = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < this.atoms.length; i++) {
            const pos = new THREE.Vector3(this.atoms[i][1], this.atoms[i][2], this.atoms[i][3]);
            this.geometricCenter.add(pos);
        }
        this.geometricCenter.multiplyScalar(1.0 / this.atoms.length);

        this.updateViewParameters();
        this.initializeBondRulesFromAtoms();
        this.refreshAppearanceControls();
    }

    setExcitonIndex(index) {
        this.excitonIndex = index;
        if (this.excitons && this.excitons[index]) {
            this.values = this.excitons[index].datagrid;
            this.clearIsosurfacePreviewCache();
            this.updateRecommendedIsolevel();
        }
    }

    clearIsosurfacePreviewCache() {
        this.isosurfacePreviewCache = null;
    }

    updateRecommendedIsolevel(force = false) {
        if (!Array.isArray(this.values) || !this.values.length) {
            return;
        }

        const positiveValues = this.values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
        if (!positiveValues.length) {
            return;
        }

        const quantile = (fraction) => {
            const position = Math.max(0, Math.min(1, fraction)) * (positiveValues.length - 1);
            const lower = Math.floor(position);
            const upper = Math.ceil(position);
            const weight = position - lower;
            if (lower === upper) {
                return positiveValues[lower];
            }
            return positiveValues[lower] * (1 - weight) + positiveValues[upper] * weight;
        };

        const recommended = Math.min(Math.max(quantile(0.99), positiveValues[positiveValues.length - 1] * 0.02), 0.9);
        if (force || !Number.isFinite(this.isolevel) || this.isolevel <= 0 || this.isolevel === 0.02) {
            this.isolevel = recommended;
        }

        if (this.onIsolevelRangeChanged) {
            this.onIsolevelRangeChanged({
                min: 0,
                max: Math.max(quantile(0.999), positiveValues[positiveValues.length - 1] * 0.1),
                step: Math.max(1e-4, positiveValues[positiveValues.length - 1] / 500),
                value: this.isolevel,
            });
        }
    }

    getContainerDimensions() {
        let width = this.container.width();
        let height = this.container.height();

        if (!width || !height) {
            const rect = this.container.get(0).getBoundingClientRect();
            width = rect.width;
            height = rect.height;
        }
        if ((!width || !height) && this.container.get(0).parentElement) {
            const rect = this.container.get(0).parentElement.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
        }
        if (!width || !height) {
            width = Math.max(window.innerWidth * 0.5, 300);
            height = Math.max(window.innerHeight * 0.5, 300);
        }

        return {
            width,
            height,
            ratio: width / height,
        };
    }

    colorToInputHex(colorHex) {
        return `#${Number(colorHex).toString(16).padStart(6, '0')}`;
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
        const palette = this.display === 'vesta' ? vesta_colors : jmol_colors;
        const rgb = palette[atomNumber] || [0.5, 0.5, 0.5];
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
        if (this.domAppearanceAtomList && this.domAppearanceAtomList.length) {
            this.domAppearanceAtomList.find('button').removeClass('active');
            this.domAppearanceAtomList.find(`button[data-atom-number="${atomNumber}"]`).addClass('active');
        }
    }

    setDisplayCombo(domCombo) {
        this.domDisplaySelect = domCombo;
        if (domCombo && domCombo.length) {
            domCombo.val(this.display);
            domCombo.on('change', () => {
                this.display = domCombo.val() || this.display;
                this.updateLightStyle();
                this.refreshAppearanceControls();
                this.updateStructure();
            });
        }
    }

    setAppearanceControls(
        domAtomList,
        domAtomColorInput,
        domBondColorInput,
        domBondColorByAtomCheckbox,
        domAtomRadiusInput,
        domBondRadiusInput,
        domBondRulesList,
        domBondAddAtomA,
        domBondAddAtomB,
        domBondAddCutoffInput,
        domResetAtomButton,
        domResetBondsButton,
    ) {
        this.domAppearanceAtomList = domAtomList;
        this.domAtomColorInput = domAtomColorInput;
        this.domBondColorInput = domBondColorInput;
        this.domBondColorByAtomCheckbox = domBondColorByAtomCheckbox;
        this.domAtomRadiusInput = domAtomRadiusInput;
        this.domBondRadiusInput = domBondRadiusInput;
        this.domBondRulesList = domBondRulesList;
        this.domBondAddAtomA = domBondAddAtomA;
        this.domBondAddAtomB = domBondAddAtomB;
        this.domBondAddCutoffInput = domBondAddCutoffInput;

        const updateBondColorInputState = () => {
            if (domBondColorInput && domBondColorInput.length) {
                domBondColorInput.prop('disabled', this.bondColorByAtom);
            }
        };

        if (domAtomList && domAtomList.length) {
            domAtomList.on('click', 'button[data-atom-number]', (event) => {
                const atomNumber = Number(event.currentTarget.getAttribute('data-atom-number'));
                if (!Number.isFinite(atomNumber)) {
                    return;
                }
                this.setSelectedAppearanceAtomNumber(atomNumber);
                if (domAtomColorInput && domAtomColorInput.length) {
                    domAtomColorInput.val(this.colorToInputHex(this.getAtomColorHex(atomNumber)));
                }
                if (domAtomRadiusInput && domAtomRadiusInput.length) {
                    domAtomRadiusInput.val(this.getAtomRadiusScale(atomNumber));
                }
            });
        }

        const applyAppearanceSettings = () => {
            const atomNumber = Number(this.getSelectedAppearanceAtomNumber());
            if (Number.isFinite(atomNumber)) {
                if (domAtomColorInput && domAtomColorInput.length) {
                    const rawAtomColor = domAtomColorInput.val();
                    if (rawAtomColor) {
                        const defaultHex = this.getDefaultAtomColor(atomNumber);
                        const selectedHex = this.normalizeColorHex(rawAtomColor, defaultHex);
                        if (selectedHex === defaultHex) {
                            this.clearAtomColorOverride(atomNumber);
                        } else {
                            this.atomColorOverrides[atomNumber] = selectedHex;
                        }
                    }
                }

                if (domAtomRadiusInput && domAtomRadiusInput.length) {
                    const atomScale = Math.max(0.1, parseFloat(domAtomRadiusInput.val()) || this.defaultAtomRadiusScale);
                    this.setAtomRadiusScaleOverride(atomNumber, atomScale);
                    domAtomRadiusInput.val(atomScale);
                }
            }

            if (!this.bondColorByAtom && domBondColorInput && domBondColorInput.length) {
                this.bondscolor = this.normalizeColorHex(domBondColorInput.val(), this.bondscolor);
            }
            if (domBondColorByAtomCheckbox && domBondColorByAtomCheckbox.length) {
                this.bondColorByAtom = !!domBondColorByAtomCheckbox.prop('checked');
            }
            updateBondColorInputState();

            if (domBondRadiusInput && domBondRadiusInput.length) {
                this.bondRadius = Math.max(0.01, parseFloat(domBondRadiusInput.val()) || this.bondRadius);
                domBondRadiusInput.val(this.bondRadius);
            }

            this.updateStructure();
        };

        if (domAtomColorInput && domAtomColorInput.length) {
            domAtomColorInput.on('change', applyAppearanceSettings);
        }

        if (domBondColorInput && domBondColorInput.length) {
            domBondColorInput.val(this.colorToInputHex(this.bondscolor));
            domBondColorInput.on('change', applyAppearanceSettings);
        }

        if (domBondColorByAtomCheckbox && domBondColorByAtomCheckbox.length) {
            domBondColorByAtomCheckbox.prop('checked', this.bondColorByAtom);
            domBondColorByAtomCheckbox.on('change', applyAppearanceSettings);
        }

        if (domAtomRadiusInput && domAtomRadiusInput.length) {
            domAtomRadiusInput.attr('min', 0.1);
            domAtomRadiusInput.attr('max', 5.0);
            domAtomRadiusInput.attr('step', 0.05);
            domAtomRadiusInput.on('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyAppearanceSettings();
                }
            });
        }

        if (domBondRadiusInput && domBondRadiusInput.length) {
            domBondRadiusInput.attr('min', 0.01);
            domBondRadiusInput.attr('max', 1.0);
            domBondRadiusInput.attr('step', 0.01);
            domBondRadiusInput.val(this.bondRadius);
            domBondRadiusInput.on('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    applyAppearanceSettings();
                }
            });
        }

        if (domBondRulesList && domBondRulesList.length) {
            domBondRulesList.on('click', 'button[data-remove-key]', (event) => {
                const key = event.currentTarget.getAttribute('data-remove-key');
                if (key && this.bondRules[key]) {
                    delete this.bondRules[key];
                    this.refreshAppearanceControls();
                    this.updateStructure();
                }
            });
        }

        const updateBondCutoffInput = () => {
            if (!domBondAddCutoffInput || !domBondAddCutoffInput.length) {
                return;
            }
            const a = Number(domBondAddAtomA.val());
            const b = Number(domBondAddAtomB.val());
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
                return;
            }
            const key = this.getBondRuleKey(a, b);
            const value = this.bondRules[key] ? this.bondRules[key].cutoff : this.getDefaultBondCutoff(a, b);
            domBondAddCutoffInput.val(Number(value).toFixed(2));
        };

        const addBondRuleFromControls = () => {
            const a = Number(domBondAddAtomA.val());
            const b = Number(domBondAddAtomB.val());
            if (!Number.isFinite(a) || !Number.isFinite(b)) {
                return;
            }
            let cutoff = this.getDefaultBondCutoff(a, b);
            if (domBondAddCutoffInput && domBondAddCutoffInput.length) {
                const parsed = parseFloat(domBondAddCutoffInput.val());
                if (Number.isFinite(parsed) && parsed > 0) {
                    cutoff = parsed;
                }
                domBondAddCutoffInput.val(cutoff.toFixed(2));
            }
            this.setBondRule(a, b, cutoff);
            this.refreshAppearanceControls();
            this.updateStructure();
        };

        if (domBondAddAtomA && domBondAddAtomA.length) {
            domBondAddAtomA.on('change', updateBondCutoffInput);
        }
        if (domBondAddAtomB && domBondAddAtomB.length) {
            domBondAddAtomB.on('change', updateBondCutoffInput);
        }
        if (domBondAddCutoffInput && domBondAddCutoffInput.length) {
            domBondAddCutoffInput.on('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    addBondRuleFromControls();
                }
            });
        }

        if (domResetAtomButton && domResetAtomButton.length) {
            domResetAtomButton.on('click', () => {
                const atomNumber = this.getSelectedAppearanceAtomNumber();
                if (Number.isFinite(atomNumber)) {
                    this.clearAtomColorOverride(atomNumber);
                    delete this.atomRadiusScaleOverrides[atomNumber];
                }
                this.refreshAppearanceControls();
                this.updateStructure();
            });
        }

        if (domResetBondsButton && domResetBondsButton.length) {
            domResetBondsButton.on('click', () => {
                this.bondscolor = this.defaultBondsColor;
                this.bondColorByAtom = this.defaultBondColorByAtom;
                this.bondRadius = this.defaultBondRadius;
                this.initializeBondRulesFromAtoms();
                this.refreshAppearanceControls();
                this.updateStructure();
            });
        }

        updateBondColorInputState();
    }

    refreshAppearanceControls() {
        if (!this.atom_numbers || !this.atom_numbers.length) {
            return;
        }

        const uniqueAtomNumbers = this.atom_numbers.filter((value, index, array) => array.indexOf(value) === index);
        let selected = Number(this.getSelectedAppearanceAtomNumber());
        if (!Number.isFinite(selected) || !uniqueAtomNumbers.includes(selected)) {
            selected = uniqueAtomNumbers[0];
        }

        if (this.domAppearanceAtomList && this.domAppearanceAtomList.length) {
            this.domAppearanceAtomList.empty();
            for (let i = 0; i < uniqueAtomNumbers.length; i++) {
                const atomNumber = uniqueAtomNumbers[i];
                this.domAppearanceAtomList.append(
                    `<button type="button" data-atom-number="${atomNumber}">${createAtomBadgeHtml(atomic_symbol[atomNumber], atomNumber, this.getAtomColorHex.bind(this))}</button>`
                );
            }
        }

        this.setSelectedAppearanceAtomNumber(selected);

        if (this.domDisplaySelect && this.domDisplaySelect.length) {
            this.domDisplaySelect.val(this.display);
        }
        if (this.domAtomColorInput && this.domAtomColorInput.length) {
            this.domAtomColorInput.val(this.colorToInputHex(this.getAtomColorHex(selected)));
        }
        if (this.domAtomRadiusInput && this.domAtomRadiusInput.length) {
            this.domAtomRadiusInput.val(this.getAtomRadiusScale(selected));
        }
        if (this.domBondColorInput && this.domBondColorInput.length) {
            this.domBondColorInput.val(this.colorToInputHex(this.bondscolor));
            this.domBondColorInput.prop('disabled', this.bondColorByAtom);
        }
        if (this.domBondColorByAtomCheckbox && this.domBondColorByAtomCheckbox.length) {
            this.domBondColorByAtomCheckbox.prop('checked', this.bondColorByAtom);
        }
        if (this.domBondRadiusInput && this.domBondRadiusInput.length) {
            this.domBondRadiusInput.val(this.bondRadius);
        }
        if (this.domBondAddAtomA && this.domBondAddAtomA.length) {
            const previous = this.domBondAddAtomA.val();
            this.domBondAddAtomA.empty();
            for (let i = 0; i < uniqueAtomNumbers.length; i++) {
                const atomNumber = uniqueAtomNumbers[i];
                this.domBondAddAtomA.append(`<option value="${atomNumber}">${atomic_symbol[atomNumber]}</option>`);
            }
            if (previous !== null && uniqueAtomNumbers.includes(Number(previous))) {
                this.domBondAddAtomA.val(previous);
            }
        }
        if (this.domBondAddAtomB && this.domBondAddAtomB.length) {
            const previous = this.domBondAddAtomB.val();
            this.domBondAddAtomB.empty();
            for (let i = 0; i < uniqueAtomNumbers.length; i++) {
                const atomNumber = uniqueAtomNumbers[i];
                this.domBondAddAtomB.append(`<option value="${atomNumber}">${atomic_symbol[atomNumber]}</option>`);
            }
            if (previous !== null && uniqueAtomNumbers.includes(Number(previous))) {
                this.domBondAddAtomB.val(previous);
            }
        }
        if (this.domBondAddCutoffInput && this.domBondAddCutoffInput.length && this.domBondAddAtomA && this.domBondAddAtomB) {
            const a = Number(this.domBondAddAtomA.val());
            const b = Number(this.domBondAddAtomB.val());
            if (Number.isFinite(a) && Number.isFinite(b)) {
                const key = this.getBondRuleKey(a, b);
                const value = this.bondRules[key] ? this.bondRules[key].cutoff : this.getDefaultBondCutoff(a, b);
                this.domBondAddCutoffInput.val(Number(value).toFixed(2));
            }
        }
        this.refreshBondRulesUI();
    }

    getBondRuleKey(atomNumberA, atomNumberB) {
        const a = Math.min(atomNumberA, atomNumberB);
        const b = Math.max(atomNumberA, atomNumberB);
        return `${a}-${b}`;
    }

    getDefaultBondCutoff(atomNumberA, atomNumberB) {
        return covalent_radii[atomNumberA] + covalent_radii[atomNumberB];
    }

    setBondRule(atomNumberA, atomNumberB, cutoff) {
        const key = this.getBondRuleKey(atomNumberA, atomNumberB);
        const a = Math.min(atomNumberA, atomNumberB);
        const b = Math.max(atomNumberA, atomNumberB);
        this.bondRules[key] = {
            a,
            b,
            cutoff: Number.isFinite(cutoff) ? cutoff : this.getDefaultBondCutoff(a, b),
        };
    }

    initializeBondRulesFromAtoms() {
        this.bondRules = {};
        if (!this.atoms || !this.atom_numbers) {
            return;
        }
        const tmpAtoms = [];
        for (let i = 0; i < this.atoms.length; i++) {
            tmpAtoms.push({
                atom_number: this.atom_numbers[this.atoms[i][0]],
                position: new THREE.Vector3(this.atoms[i][1], this.atoms[i][2], this.atoms[i][3]),
            });
        }
        const combinations = getCombinations(tmpAtoms);
        for (let i = 0; i < combinations.length; i++) {
            const a = combinations[i][0];
            const b = combinations[i][1];
            const length = a.position.distanceTo(b.position);
            const cutoff = this.getDefaultBondCutoff(a.atom_number, b.atom_number);
            if (length < cutoff) {
                this.setBondRule(a.atom_number, b.atom_number, cutoff);
            }
        }
    }

    refreshBondRulesUI() {
        if (!this.domBondRulesList || !this.domBondRulesList.length) {
            return;
        }
        this.domBondRulesList.empty();
        const keys = Object.keys(this.bondRules).sort();
        if (!keys.length) {
            this.domBondRulesList.append('<div>none</div>');
            return;
        }
        for (let i = 0; i < keys.length; i++) {
            const rule = this.bondRules[keys[i]];
            const label =
                `<span class="atom-badge-pair">` +
                `${createAtomBadgeHtml(atomic_symbol[rule.a], rule.a, this.getAtomColorHex.bind(this))}` +
                `<span class="atom-badge-separator">-</span>` +
                `${createAtomBadgeHtml(atomic_symbol[rule.b], rule.b, this.getAtomColorHex.bind(this))}` +
                `</span>`;
            const cutoff = Number(rule.cutoff).toFixed(2);
            this.domBondRulesList.append(
                `<div class="appearance-controls"><span>${label} ${cutoff}</span><button type="button" data-remove-key="${keys[i]}">remove</button></div>`
            );
        }
    }

    getAtomMaterials() {
        this.materials = [];
        for (let i = 0; i < this.atom_numbers.length; i++) {
            const number = this.atom_numbers[i];
            const atomColor = this.getAtomColor(number);
            let material;

            if (!this.shading) {
                material = new THREE.MeshBasicMaterial({ blending: THREE.NormalBlending });
            } else if (this.display === 'vesta') {
                material = new THREE.MeshPhongMaterial({ reflectivity: 1, shininess: 80 });
            } else {
                material = new THREE.MeshLambertMaterial({ blending: THREE.NormalBlending });
            }
            material.color.copy(atomColor);
            this.materials.push(material);
        }
    }

    updateViewParameters() {
        if (!this.atoms || !this.atoms.length) {
            return;
        }

        let maxRadius = 0;

        for (let i = 0; i < this.atoms.length; i++) {
            const atomI = this.atoms[i];
            const posI = new THREE.Vector3(atomI[1], atomI[2], atomI[3]).sub(this.geometricCenter);
            maxRadius = Math.max(maxRadius, posI.length());
        }

        const halfFov = (this.cameraViewAngle * Math.PI / 180) / 2;
        this.cameraDistance = Math.max(45, (maxRadius / Math.tan(halfFov)) * 1.25);
        this.setCameraDirection('z');
    }

    addStructure() {
        this.atomobjects = [];
        this.bondobjects = [];
        this.bonds = [];

        const sphereGeometries = new Map();

        for (let i = 0; i < this.atoms.length; i++) {
            const atomTypeIndex = this.atoms[i][0];
            const atomNumber = this.atom_numbers[atomTypeIndex];
            if (!sphereGeometries.has(atomTypeIndex)) {
                const atomScale = this.getAtomRadiusScale(atomNumber);
                const radius = this.display === 'vesta'
                    ? (covalent_radii[atomNumber] / 2.3) * atomScale
                    : this.sphereRadius * atomScale;
                sphereGeometries.set(
                    atomTypeIndex,
                    new THREE.SphereGeometry(radius, this.sphereLat, this.sphereLon),
                );
            }

            const object = new THREE.Mesh(sphereGeometries.get(atomTypeIndex), this.materials[atomTypeIndex]);
            const pos = new THREE.Vector3(this.atoms[i][1], this.atoms[i][2], this.atoms[i][3]);
            pos.sub(this.geometricCenter);

            object.position.copy(pos);
            object.name = 'atom';
            object.atom_number = this.atom_numbers[this.atoms[i][0]];

            this.scene.add(object);
            this.atomobjects.push(object);
        }

        const combinations = getCombinations(this.atomobjects);
        for (let i = 0; i < combinations.length; i++) {
            const atomA = combinations[i][0];
            const atomB = combinations[i][1];
            const distance = atomA.position.distanceTo(atomB.position);
            const key = this.getBondRuleKey(atomA.atom_number, atomB.atom_number);
            const cutoff = this.bondRules[key] ? this.bondRules[key].cutoff : this.getDefaultBondCutoff(atomA.atom_number, atomB.atom_number);
            if (distance < cutoff) {
                const bond = getBond(atomA.position, atomB.position);
                const createBondSegment = (length, midpoint, colorHex) => {
                    const geometry = new THREE.CylinderGeometry(
                        this.bondRadius,
                        this.bondRadius,
                        length,
                        this.bondSegments,
                        this.bondVertical,
                        true,
                    );
                    let material;
                    if (!this.shading) {
                        material = new THREE.MeshBasicMaterial({ color: colorHex });
                    } else if (this.display === 'vesta') {
                        material = new THREE.MeshPhongMaterial({ color: colorHex, reflectivity: 1, shininess: 50 });
                    } else {
                        material = new THREE.MeshLambertMaterial({ color: colorHex });
                    }
                    const object = new THREE.Mesh(geometry, material);
                    object.setRotationFromQuaternion(bond.quaternion);
                    object.position.copy(midpoint);
                    object.name = 'bond';
                    this.scene.add(object);
                    this.bondobjects.push(object);
                };

                if (this.bondColorByAtom) {
                    const direction = new THREE.Vector3().subVectors(atomB.position, atomA.position).normalize();
                    const halfLength = distance / 2;
                    const midpointA = atomA.position.clone().addScaledVector(direction, halfLength / 2);
                    const midpointB = atomB.position.clone().addScaledVector(direction, -halfLength / 2);
                    createBondSegment(halfLength, midpointA, this.getAtomColorHex(atomA.atom_number));
                    createBondSegment(halfLength, midpointB, this.getAtomColorHex(atomB.atom_number));
                } else {
                    createBondSegment(distance, bond.midpoint, this.bondscolor);
                }
            }
        }
    }

    addLights() {
        this.scene.add(this.camera);
        this.scene.add(new THREE.AmbientLight(0x333333));
    }

    updateLightStyle() {
        if (!this.pointLight) {
            return;
        }

        if (this.display === 'vesta') {
            this.pointLight.color.setHex(0xffffff);
            this.pointLight.intensity = 1.2;
            this.pointLight.position.set(1, 1, 1);
        } else {
            this.pointLight.color.setHex(0xdddddd);
            this.pointLight.intensity = 1.0;
            this.pointLight.position.set(1, 1, 2);
        }
    }

    removeStructure() {
        if (!this.scene) {
            return;
        }

        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            this.disposeSceneObject(this.scene.children[i]);
            this.scene.remove(this.scene.children[i]);
        }
    }

    disposeSceneObject(object) {
        if (!object) {
            return;
        }
        if (object.geometry) {
            object.geometry.dispose();
        }
        if (object.material) {
            if (Array.isArray(object.material)) {
                for (let i = 0; i < object.material.length; i++) {
                    if (object.material[i] && object.material[i].dispose) {
                        object.material[i].dispose();
                    }
                }
            } else if (object.material.dispose) {
                object.material.dispose();
            }
        }
    }

    removeNamedSceneObjects(name) {
        if (!this.scene) {
            return;
        }

        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            const child = this.scene.children[i];
            if (child && child.name === name) {
                this.disposeSceneObject(child);
                this.scene.remove(child);
            }
        }
    }

    getMarchingCubesOptions() {
        return { insideIsAbove: true };
    }

    getPreviewStride() {
        const voxelCount = (this.sizex || 1) * (this.sizey || 1) * (this.sizez || 1);
        const minSize = Math.min(this.sizex || 1, this.sizey || 1, this.sizez || 1);
        if (minSize < 12) {
            return 1;
        }
        if (voxelCount > 800000 && minSize >= 24) {
            return 4;
        }
        if (voxelCount > 250000 && minSize >= 18) {
            return 3;
        }
        if (voxelCount > 80000 && minSize >= 12) {
            return 2;
        }
        return 1;
    }

    buildDownsampledField(values, sizex, sizey, sizez, stride, periodic) {
        if (stride <= 1) {
            return {
                values,
                sizex,
                sizey,
                sizez,
            };
        }

        const reducedX = periodic ? Math.max(2, Math.floor(sizex / stride)) : Math.max(2, Math.floor((sizex - 1) / stride) + 1);
        const reducedY = periodic ? Math.max(2, Math.floor(sizey / stride)) : Math.max(2, Math.floor((sizey - 1) / stride) + 1);
        const reducedZ = periodic ? Math.max(2, Math.floor((sizez) / stride)) : Math.max(2, Math.floor((sizez - 1) / stride) + 1);
        const reducedValues = new Float32Array(reducedX * reducedY * reducedZ);
        let writeIndex = 0;

        for (let z = 0; z < reducedZ; z++) {
            const sourceZ = periodic ? (z * stride) % sizez : Math.min(z * stride, sizez - 1);
            for (let y = 0; y < reducedY; y++) {
                const sourceY = periodic ? (y * stride) % sizey : Math.min(y * stride, sizey - 1);
                for (let x = 0; x < reducedX; x++) {
                    const sourceX = periodic ? (x * stride) % sizex : Math.min(x * stride, sizex - 1);
                    reducedValues[writeIndex] = values[sourceX + sizex * sourceY + sizex * sizey * sourceZ];
                    writeIndex += 1;
                }
            }
        }

        return {
            values: reducedValues,
            sizex: reducedX,
            sizey: reducedY,
            sizez: reducedZ,
        };
    }

    getInteractiveMarchingCubesInput() {
        const stride = this.getPreviewStride();
        if (stride <= 1) {
            return {
                values: this.values,
                sizex: this.sizex,
                sizey: this.sizey,
                sizez: this.sizez,
            };
        }

        const options = this.getMarchingCubesOptions();
        const periodic = !!options.periodic;
        const cacheKey = `${stride}:${this.sizex}:${this.sizey}:${this.sizez}:${periodic ? 'p' : 'n'}`;
        if (!this.isosurfacePreviewCache || this.isosurfacePreviewCache.key !== cacheKey) {
            this.isosurfacePreviewCache = {
                key: cacheKey,
                data: this.buildDownsampledField(this.values, this.sizex, this.sizey, this.sizez, stride, periodic),
            };
        }

        return this.isosurfacePreviewCache.data;
    }

    getMarchingCubesWorker() {
        if (this.marchingCubesWorkerFailed || typeof Worker === 'undefined') {
            return null;
        }
        if (this.marchingCubesWorker) {
            return this.marchingCubesWorker;
        }

        try {
            this.marchingCubesWorker = new Worker(
                new URL('./marchingcubesworker.js', import.meta.url),
                { type: 'module' },
            );
            this.marchingCubesWorker.onmessage = (event) => {
                this.marchingCubesWorkerBusy = false;
                const { requestId, positions, normals } = event.data;
                this.applyMarchingCubesBuffers(
                    requestId,
                    new Float32Array(positions),
                    new Float32Array(normals),
                );
            };
            this.marchingCubesWorker.onerror = () => {
                this.marchingCubesWorkerBusy = false;
                this.marchingCubesWorkerFailed = true;
                if (this.marchingCubesWorker) {
                    this.marchingCubesWorker.terminate();
                    this.marchingCubesWorker = null;
                }
            };
        } catch (error) {
            this.marchingCubesWorkerFailed = true;
            this.marchingCubesWorker = null;
        }

        return this.marchingCubesWorker;
    }

    resetMarchingCubesWorker() {
        this.marchingCubesWorkerBusy = false;
        if (this.marchingCubesWorker) {
            this.marchingCubesWorker.terminate();
            this.marchingCubesWorker = null;
        }
    }

    createMarchingCubesGeometry(positions, normals) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        return geometry;
    }

    applyMarchingCubesBuffers(requestId, positions, normals) {
        if (requestId !== this.marchingCubesRequestId || !this.scene) {
            return;
        }

        this.removeNamedSceneObjects('isosurface');
        const geometry = this.createMarchingCubesGeometry(positions, normals);
        this.addMarchingCubesGeometry(geometry);
        this.render();
    }

    requestMarchingCubesUpdate() {
        if (!Array.isArray(this.values) || !this.values.length || !this.scene) {
            return;
        }

        const requestId = ++this.marchingCubesRequestId;
        const payload = {
            requestId,
            values: Float32Array.from(this.values),
            sizex: this.sizex,
            sizey: this.sizey,
            sizez: this.sizez,
            gridCell: this.gridCell,
            isolevel: this.isolevel,
            options: this.getMarchingCubesOptions(),
        };

        const worker = this.getMarchingCubesWorker();
        if (worker) {
            if (this.marchingCubesWorkerBusy) {
                this.resetMarchingCubesWorker();
            }
            const activeWorker = this.getMarchingCubesWorker();
            if (activeWorker) {
                this.marchingCubesWorkerBusy = true;
                activeWorker.postMessage(
                    payload,
                    [payload.values.buffer],
                );
                return;
            }
        }

        const geometry = buildMarchingCubesGeometry(
            this.values,
            this.sizex,
            this.sizey,
            this.sizez,
            this.gridCell,
            this.isolevel,
            this.getMarchingCubesOptions(),
        );
        this.removeNamedSceneObjects('isosurface');
        this.addMarchingCubesGeometry(geometry);
        this.render();
    }

    updateIsosurfaceSync() {
        if (!this.scene || !Array.isArray(this.values) || !this.values.length) {
            return;
        }

        this.marchingCubesRequestId += 1;
        if (this.marchingCubesWorkerBusy) {
            this.resetMarchingCubesWorker();
        }

        const geometry = buildMarchingCubesGeometry(
            this.values,
            this.sizex,
            this.sizey,
            this.sizez,
            this.gridCell,
            this.isolevel,
            this.getMarchingCubesOptions(),
        );
        this.removeNamedSceneObjects('isosurface');
        this.addMarchingCubesGeometry(geometry);
        this.render();
    }

    updateIsosurfacePreview() {
        if (!this.scene || !Array.isArray(this.values) || !this.values.length) {
            return;
        }

        this.marchingCubesRequestId += 1;
        if (this.marchingCubesWorkerBusy) {
            this.resetMarchingCubesWorker();
        }

        const preview = this.getInteractiveMarchingCubesInput();
        const geometry = buildMarchingCubesGeometry(
            preview.values,
            preview.sizex,
            preview.sizey,
            preview.sizez,
            this.gridCell,
            this.isolevel,
            this.getMarchingCubesOptions(),
        );
        this.removeNamedSceneObjects('isosurface');
        this.addMarchingCubesGeometry(geometry);
        this.render();
    }

    updateIsosurface() {
        this.requestMarchingCubesUpdate();
    }

    changeIsolevel(isolevel) {
        this.isolevel = Number(isolevel);
        this.updateIsosurfaceSync();
    }

    previewIsolevel(isolevel) {
        this.isolevel = Number(isolevel);
        this.updateIsosurfacePreview();
    }

    setCameraDirection(direction) {
        if (!this.camera) {
            return;
        }

        if (direction === 'x') {
            this.camera.position.set(this.cameraDistance, 0, 0);
            this.camera.up.set(0, 0, 1);
        }
        if (direction === 'y') {
            this.camera.position.set(0, this.cameraDistance, 0);
            this.camera.up.set(0, 0, 1);
        }
        if (direction === 'z') {
            this.camera.position.set(0, 0, this.cameraDistance);
            this.camera.up.set(0, 1, 0);
        }
    }

    updateStructure() {
        if (!this.scene || !this.excitons || !this.excitons.length) {
            return;
        }

        this.values = this.excitons[this.excitonIndex].datagrid;
        this.marchingCubesRequestId += 1;
        this.removeStructure();

        this.addLights();
        this.addMarchingCubes();
        this.getAtomMaterials();
        this.addStructure();
        this.render();
    }

    addMarchingCubes() {
        this.requestMarchingCubesUpdate();
    }

    addMarchingCubesGeometry(geometry) {
        const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshLambertMaterial({
                color: 0xffff00,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.18,
                depthWrite: false,
            }),
        );
        mesh.name = 'isosurface';
        mesh.position.sub(this.geometricCenter);
        this.scene.add(mesh);
    }

    onWindowResize() {
        if (!this.container || !this.camera || !this.renderer) {
            return;
        }

        this.dimensions = this.getContainerDimensions();
        if (!this.dimensions.width || !this.dimensions.height) {
            return;
        }
        this.camera.aspect = this.dimensions.ratio;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.dimensions.width, this.dimensions.height, false);
        this.controls.handleResize();
        this.render();
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));
        this.render();
        this.update();
    }

    update() {
        if (this.controls) {
            this.controls.update();
        }
    }

    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}
