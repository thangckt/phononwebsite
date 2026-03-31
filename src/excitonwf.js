import * as THREE from 'three';
import { TrackballControls } from './static_libs/TrackballControls.js';
import { edgeTable, triTable } from './static_libs/MarchingCubesData.js';
import { atomic_symbol, covalent_radii, jmol_colors, vesta_colors } from './atomic_data.js';
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
        this.points = [];
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
        this.bondColorByAtom = false;
        this.defaultBondColorByAtom = this.bondColorByAtom;
        this.defaultBondRadius = this.bondRadius;
        this.atomColorOverrides = {};
        this.atomRadiusScaleOverrides = {};
        this.defaultAtomRadiusScale = 1.0;
        this.appearanceSelectedAtomNumber = null;
        this.bondRules = {};
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

        this.controls = new TrackballControls(this.camera, this.renderer.domElement);
        this.controls.rotateSpeed = 1.0;
        this.controls.zoomSpeed = 1.0;
        this.controls.panSpeed = 0.3;
        this.controls.staticMoving = true;
        this.controls.dynamicDampingFactor = 0.3;

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.isInitialized = true;
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
        }
    }

    getContainerDimensions() {
        const width = this.container.width();
        const height = this.container.height();

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
                    `<button type="button" data-atom-number="${atomNumber}">${atomic_symbol[atomNumber]}</button>`
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
            const label = `${atomic_symbol[rule.a]}-${atomic_symbol[rule.b]}`;
            const cutoff = Number(rule.cutoff).toFixed(2);
            this.domBondRulesList.append(
                `<div class="appearance-controls"><span>${label} (${cutoff})</span><button type="button" data-remove-key="${keys[i]}">remove</button></div>`
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
                    const material = this.display === 'vesta'
                        ? new THREE.MeshPhongMaterial({ color: colorHex, reflectivity: 1, shininess: 50 })
                        : new THREE.MeshLambertMaterial({ color: colorHex });
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
            this.scene.remove(this.scene.children[i]);
        }
    }

    changeIsolevel(isolevel) {
        this.isolevel = Number(isolevel);
        this.updateStructure();
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
        this.removeStructure();

        this.points = [];
        for (let k = 0; k < this.sizez; k++) {
            for (let j = 0; j < this.sizey; j++) {
                for (let i = 0; i < this.sizex; i++) {
                    const x = i / (this.sizex - 1);
                    const y = j / (this.sizey - 1);
                    const z = k / (this.sizez - 1);

                    this.points.push(new THREE.Vector3(
                        x * this.gridCell[0][0] + y * this.gridCell[1][0] + z * this.gridCell[2][0],
                        x * this.gridCell[0][1] + y * this.gridCell[1][1] + z * this.gridCell[2][1],
                        x * this.gridCell[0][2] + y * this.gridCell[1][2] + z * this.gridCell[2][2],
                    ));
                }
            }
        }

        this.addLights();
        this.addMarchingCubes();
        this.getAtomMaterials();
        this.addStructure();
    }

    addMarchingCubes() {
        const size2 = this.sizex * this.sizey;
        const vlist = new Array(12);
        const geometry = new THREE.Geometry();
        let vertexIndex = 0;

        for (let z = 0; z < this.sizez - 1; z++) {
            for (let y = 0; y < this.sizey - 1; y++) {
                for (let x = 0; x < this.sizex - 1; x++) {
                    const p = x + this.sizex * y + size2 * z;
                    const px = p + 1;
                    const py = p + this.sizex;
                    const pxy = py + 1;
                    const pz = p + size2;
                    const pxz = px + size2;
                    const pyz = py + size2;
                    const pxyz = pxy + size2;

                    const value0 = this.values[p];
                    const value1 = this.values[px];
                    const value2 = this.values[py];
                    const value3 = this.values[pxy];
                    const value4 = this.values[pz];
                    const value5 = this.values[pxz];
                    const value6 = this.values[pyz];
                    const value7 = this.values[pxyz];

                    let cubeindex = 0;
                    if (value0 < this.isolevel) cubeindex |= 1;
                    if (value1 < this.isolevel) cubeindex |= 2;
                    if (value2 < this.isolevel) cubeindex |= 8;
                    if (value3 < this.isolevel) cubeindex |= 4;
                    if (value4 < this.isolevel) cubeindex |= 16;
                    if (value5 < this.isolevel) cubeindex |= 32;
                    if (value6 < this.isolevel) cubeindex |= 128;
                    if (value7 < this.isolevel) cubeindex |= 64;

                    const bits = edgeTable[cubeindex];
                    if (bits === 0) {
                        continue;
                    }

                    let mu = 0.5;
                    if (bits & 1) {
                        mu = (this.isolevel - value0) / (value1 - value0);
                        vlist[0] = this.points[p].clone().lerp(this.points[px], mu);
                    }
                    if (bits & 2) {
                        mu = (this.isolevel - value1) / (value3 - value1);
                        vlist[1] = this.points[px].clone().lerp(this.points[pxy], mu);
                    }
                    if (bits & 4) {
                        mu = (this.isolevel - value2) / (value3 - value2);
                        vlist[2] = this.points[py].clone().lerp(this.points[pxy], mu);
                    }
                    if (bits & 8) {
                        mu = (this.isolevel - value0) / (value2 - value0);
                        vlist[3] = this.points[p].clone().lerp(this.points[py], mu);
                    }
                    if (bits & 16) {
                        mu = (this.isolevel - value4) / (value5 - value4);
                        vlist[4] = this.points[pz].clone().lerp(this.points[pxz], mu);
                    }
                    if (bits & 32) {
                        mu = (this.isolevel - value5) / (value7 - value5);
                        vlist[5] = this.points[pxz].clone().lerp(this.points[pxyz], mu);
                    }
                    if (bits & 64) {
                        mu = (this.isolevel - value6) / (value7 - value6);
                        vlist[6] = this.points[pyz].clone().lerp(this.points[pxyz], mu);
                    }
                    if (bits & 128) {
                        mu = (this.isolevel - value4) / (value6 - value4);
                        vlist[7] = this.points[pz].clone().lerp(this.points[pyz], mu);
                    }
                    if (bits & 256) {
                        mu = (this.isolevel - value0) / (value4 - value0);
                        vlist[8] = this.points[p].clone().lerp(this.points[pz], mu);
                    }
                    if (bits & 512) {
                        mu = (this.isolevel - value1) / (value5 - value1);
                        vlist[9] = this.points[px].clone().lerp(this.points[pxz], mu);
                    }
                    if (bits & 1024) {
                        mu = (this.isolevel - value3) / (value7 - value3);
                        vlist[10] = this.points[pxy].clone().lerp(this.points[pxyz], mu);
                    }
                    if (bits & 2048) {
                        mu = (this.isolevel - value2) / (value6 - value2);
                        vlist[11] = this.points[py].clone().lerp(this.points[pyz], mu);
                    }

                    let i = 0;
                    cubeindex <<= 4;

                    while (triTable[cubeindex + i] !== -1) {
                        const index1 = triTable[cubeindex + i];
                        const index2 = triTable[cubeindex + i + 1];
                        const index3 = triTable[cubeindex + i + 2];

                        geometry.vertices.push(vlist[index1].clone());
                        geometry.vertices.push(vlist[index2].clone());
                        geometry.vertices.push(vlist[index3].clone());
                        geometry.faces.push(new THREE.Face3(vertexIndex, vertexIndex + 1, vertexIndex + 2));
                        geometry.faceVertexUvs[0].push([
                            new THREE.Vector2(0, 0),
                            new THREE.Vector2(0, 1),
                            new THREE.Vector2(1, 1),
                        ]);

                        vertexIndex += 3;
                        i += 3;
                    }
                }
            }
        }

        geometry.computeFaceNormals();
        geometry.computeVertexNormals();

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
