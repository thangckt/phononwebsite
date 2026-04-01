import * as THREE from 'three';
import { TrackballControls } from './static_libs/TrackballControls.js';
import { atomic_symbol, covalent_radii } from './atomic_data.js';
import { createAtomBadgeHtml } from './atomcolors.js';
import { IsosurfaceController } from './isosurfacecontroller.js';
import { getCombinations } from './utils.js';
import { getSharedLightConfig, sharedViewerMethods } from './viewercommon.js';

const vecY = new THREE.Vector3(0, 1, 0);

function getBond(point1, point2) {
    const direction = new THREE.Vector3().subVectors(point2, point1);

    return {
        quaternion: new THREE.Quaternion().setFromUnitVectors(vecY, direction.clone().normalize()),
        midpoint: point1.clone().add(direction.multiplyScalar(0.5)),
    };
}

export class StructureViewerBase {

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
        this.isosurfaceOpacity = 0.18;
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
        this.isosurfaceController = new IsosurfaceController(this);
    }

    init(container = this.container, options = {}) {
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

        const lightConfig = getSharedLightConfig();
        this.pointLight = new THREE.PointLight(lightConfig.color, lightConfig.intensity);
        this.pointLight.position.set(...lightConfig.position);
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

        const controlsElement = options.controlsElement || this.renderer.domElement;
        this.controls = new TrackballControls(this.camera, controlsElement);
        this.controls.rotateSpeed = 1.0;
        this.controls.zoomSpeed = 1.0;
        this.controls.panSpeed = 0.3;
        this.controls.staticMoving = true;
        this.controls.dynamicDampingFactor = 0.3;
        if (typeof options.configureControls === 'function') {
            options.configureControls(this.controls);
        }

        window.addEventListener('resize', this.onWindowResize.bind(this), false);

        this.isInitialized = true;
        if (typeof options.afterInit === 'function') {
            options.afterInit();
        }
        this.onWindowResize();
        if (options.startAnimation !== false) {
            this.animate();
        }
    }

    clearIsosurfacePreviewCache() {
        this.isosurfaceController.clearPreviewCache();
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

        return { width, height, ratio: width / height };
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

    getDefaultBondCutoff(atomNumberA, atomNumberB) {
        return covalent_radii[atomNumberA] + covalent_radii[atomNumberB];
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

    getAtomMaterials() {
        this.materials = [];
        for (let i = 0; i < this.atom_numbers.length; i++) {
            const number = this.atom_numbers[i];
            const atomColor = this.getAtomColor(number);
            let material = this.createShadedMaterial({ blending: THREE.NormalBlending });
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
                    let material = this.createShadedMaterial({ color: colorHex });
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

    removeStructure() {
        if (!this.scene) {
            return;
        }

        for (let i = this.scene.children.length - 1; i >= 0; i--) {
            this.disposeSceneObject(this.scene.children[i]);
            this.scene.remove(this.scene.children[i]);
        }
    }

    getMarchingCubesOptions() {
        return { insideIsAbove: true };
    }

    requestMarchingCubesUpdate() {
        this.isosurfaceController.requestUpdate();
    }

    updateIsosurfaceSync() {
        this.isosurfaceController.updateSync();
    }

    updateIsosurfacePreview() {
        this.isosurfaceController.updatePreview();
    }

    updateIsosurface() {
        this.requestMarchingCubesUpdate();
    }

    changeIsolevel(isolevel) {
        this.isolevel = Number(isolevel);
        this.updateIsosurfaceSync();
    }

    changeIsosurfaceOpacity(opacity) {
        const numericOpacity = Number(opacity);
        if (!Number.isFinite(numericOpacity)) {
            return;
        }

        this.isosurfaceOpacity = Math.max(0, Math.min(1, numericOpacity));
        this.forEachNamedSceneObject('isosurface', (mesh) => {
            if (mesh.material) {
                mesh.material.opacity = this.isosurfaceOpacity;
                mesh.material.transparent = true;
                mesh.material.depthWrite = this.isosurfaceOpacity >= 0.999;
                mesh.material.needsUpdate = true;
            }
        });
        this.render();
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

    addMarchingCubes() {
        this.requestMarchingCubesUpdate();
    }

    createIsosurfaceMaterial() {
        return new THREE.MeshLambertMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: this.isosurfaceOpacity,
            depthWrite: this.isosurfaceOpacity >= 0.999,
        });
    }

    addMarchingCubesGeometry(geometry) {
        const mesh = new THREE.Mesh(geometry, this.createIsosurfaceMaterial());
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

Object.assign(StructureViewerBase.prototype, sharedViewerMethods);
