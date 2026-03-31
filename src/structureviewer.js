import * as THREE from 'three';

import { ExcitonWf } from './excitonwf.js';
import { covalent_radii } from './atomic_data.js';
import { getCombinations } from './utils.js';
import { buildMarchingCubesGeometry } from './marchingcubesgeometry.js';

export class StructureViewer extends ExcitonWf {

    constructor() {
        super();
        this.cell = true;
        this.nx = 1;
        this.ny = 1;
        this.nz = 1;
        this.structureData = null;
        this.baseAtoms = [];
        this.baseLattice = null;
        this.gridCell = null;
        this.isosurfaceValue = null;
        this.currentLattice = null;
        this.shouldAutoFitCamera = true;
    }

    setData(data) {
        this.structureData = data;
        this.baseAtoms = Array.isArray(data.atoms) ? data.atoms.map((atom) => atom.slice()) : [];
        this.baseLattice = Array.isArray(data.lat) ? data.lat.map((vector) => vector.slice()) : null;
        this.gridCell = Array.isArray(data.gridCell) ? data.gridCell.map((vector) => vector.slice()) : this.baseLattice;
        this.atom_numbers = Array.isArray(data.atom_numbers) ? data.atom_numbers.slice() : [];
        this.values = Array.isArray(data.values) ? data.values.slice() : null;
        this.sizex = data.sizex || 1;
        this.sizey = data.sizey || 1;
        this.sizez = data.sizez || 1;
        this.isolevel = Number.isFinite(data.isolevel) ? data.isolevel : this.isolevel;
        this.initializeBondRulesFromAtoms();
        this.refreshAppearanceControls();
        this.shouldAutoFitCamera = true;
        this.updateStructure();
    }

    setRepetitions(nx, ny, nz) {
        this.nx = Math.max(1, parseInt(nx, 10) || 1);
        this.ny = Math.max(1, parseInt(ny, 10) || 1);
        this.nz = Math.max(1, parseInt(nz, 10) || 1);
        this.updateStructure();
    }

    hasChargeDensity() {
        return Array.isArray(this.values) && this.values.length > 0 && this.gridCell;
    }

    setCellCheckbox(domCheckbox) {
        if (!domCheckbox || !domCheckbox.length) {
            return;
        }
        this.cell = !!domCheckbox.prop('checked');
        domCheckbox.on('change', () => {
            this.cell = !!domCheckbox.prop('checked');
            this.updateStructure();
        });
    }

    setShadingCheckbox(domCheckbox) {
        if (!domCheckbox || !domCheckbox.length) {
            return;
        }
        this.shading = !!domCheckbox.prop('checked');
        domCheckbox.on('change', () => {
            this.shading = !!domCheckbox.prop('checked');
            this.updateStructure();
        });
    }

    getCovalentBondLength(atomNumberA, atomNumberB) {
        return (covalent_radii[atomNumberA] || 0) + (covalent_radii[atomNumberB] || 0);
    }

    getBondSearchLimit(atomNumberA, atomNumberB) {
        const chemical = this.getChemicalBondLimit(atomNumberA, atomNumberB);
        return chemical + Math.max(0.5, chemical * 0.2);
    }

    getChemicalBondLimit(atomNumberA, atomNumberB) {
        const covalent = this.getCovalentBondLength(atomNumberA, atomNumberB);
        return Math.max(0.4, covalent + 0.45);
    }

    getDefaultBondCutoff(atomNumberA, atomNumberB) {
        return this.getChemicalBondLimit(atomNumberA, atomNumberB);
    }

    getEffectiveCoordinationCandidates(siteNeighbors) {
        if (!siteNeighbors || !siteNeighbors.length) {
            return [];
        }

        const sorted = siteNeighbors
            .filter((neighbor) => Number.isFinite(neighbor.distance) && neighbor.distance >= 0.4)
            .sort((a, b) => a.distance - b.distance);
        if (!sorted.length) {
            return [];
        }

        const shortest = sorted[0].distance;
        const accepted = [];

        for (let i = 0; i < sorted.length; i++) {
            const neighbor = sorted[i];
            if (neighbor.distance > shortest + Math.max(1.0, shortest * 0.6)) {
                break;
            }

            const relative = neighbor.distance / shortest;
            const weight = Math.exp(1.0 - Math.pow(relative, 6));
            if (weight < 0.35) {
                continue;
            }

            accepted.push({
                index: neighbor.index,
                atom_number: neighbor.atom_number,
                distance: neighbor.distance,
                weight,
            });
        }

        return accepted;
    }

    getReplicatedAtoms(nx, ny, nz) {
        if (!this.baseAtoms || !this.baseLattice) {
            return [];
        }

        const atoms = [];
        for (let ix = 0; ix < nx; ix++) {
            for (let iy = 0; iy < ny; iy++) {
                for (let iz = 0; iz < nz; iz++) {
                    for (let i = 0; i < this.baseAtoms.length; i++) {
                        const atom = this.baseAtoms[i];
                        atoms.push([
                            atom[0],
                            atom[1] + ix * this.baseLattice[0][0] + iy * this.baseLattice[1][0] + iz * this.baseLattice[2][0],
                            atom[2] + ix * this.baseLattice[0][1] + iy * this.baseLattice[1][1] + iz * this.baseLattice[2][1],
                            atom[3] + ix * this.baseLattice[0][2] + iy * this.baseLattice[1][2] + iz * this.baseLattice[2][2],
                        ]);
                    }
                }
            }
        }

        return atoms;
    }

    initializeBondRulesFromAtoms() {
        this.bondRules = {};
        if (!this.baseAtoms || !this.baseAtoms.length || !this.atom_numbers || !this.atom_numbers.length) {
            return;
        }

        const probeAtoms = this.getReplicatedAtoms(2, 2, 2).map((atom, index) => ({
            index,
            atom_number: this.atom_numbers[atom[0]],
            position: new THREE.Vector3(atom[1], atom[2], atom[3]),
        }));

        const pairDistances = {};
        const siteNeighbors = probeAtoms.map(() => []);
        const combinations = getCombinations(probeAtoms);

        for (let i = 0; i < combinations.length; i++) {
            const a = combinations[i][0];
            const b = combinations[i][1];
            const length = a.position.distanceTo(b.position);
            const searchLimit = this.getBondSearchLimit(a.atom_number, b.atom_number);
            if (length <= searchLimit && length >= 0.4) {
                siteNeighbors[a.index].push({
                    index: b.index,
                    atom_number: b.atom_number,
                    distance: length,
                });
                siteNeighbors[b.index].push({
                    index: a.index,
                    atom_number: a.atom_number,
                    distance: length,
                });
            }
        }

        const acceptedNeighbors = siteNeighbors.map((neighbors) => this.getEffectiveCoordinationCandidates(neighbors));
        const acceptedNeighborMaps = acceptedNeighbors.map((neighbors) => {
            const lookup = {};
            for (let i = 0; i < neighbors.length; i++) {
                lookup[neighbors[i].index] = neighbors[i];
            }
            return lookup;
        });

        for (let i = 0; i < combinations.length; i++) {
            const a = combinations[i][0];
            const b = combinations[i][1];
            const length = a.position.distanceTo(b.position);
            const chemicalLimit = this.getChemicalBondLimit(a.atom_number, b.atom_number);
            const acceptedByA = acceptedNeighborMaps[a.index][b.index];
            const acceptedByB = acceptedNeighborMaps[b.index][a.index];

            if (!acceptedByA || !acceptedByB || length > chemicalLimit) {
                continue;
            }

            const key = this.getBondRuleKey(a.atom_number, b.atom_number);
            if (!pairDistances[key]) {
                pairDistances[key] = {
                    a: Math.min(a.atom_number, b.atom_number),
                    b: Math.max(a.atom_number, b.atom_number),
                    distances: [],
                };
            }
            pairDistances[key].distances.push(length);
        }

        const keys = Object.keys(pairDistances);
        for (let i = 0; i < keys.length; i++) {
            const pair = pairDistances[keys[i]];
            if (!pair.distances.length) {
                continue;
            }
            let cutoff = Math.max.apply(null, pair.distances) + 0.04;
            cutoff = Math.min(cutoff, this.getChemicalBondLimit(pair.a, pair.b));
            if (Number.isFinite(cutoff) && cutoff >= 0.4) {
                this.setBondRule(pair.a, pair.b, cutoff);
            }
        }
    }

    getSupercellLattice() {
        if (!this.baseLattice) {
            return null;
        }
        return [
            this.baseLattice[0].map((value) => value * this.nx),
            this.baseLattice[1].map((value) => value * this.ny),
            this.baseLattice[2].map((value) => value * this.nz),
        ];
    }

    updateViewParameters() {
        if (!this.atoms || !this.atoms.length) {
            return;
        }

        let maxRadius = 0;
        for (let i = 0; i < this.atoms.length; i++) {
            const atom = this.atoms[i];
            const position = new THREE.Vector3(atom[1], atom[2], atom[3]).sub(this.geometricCenter);
            maxRadius = Math.max(maxRadius, position.length());
        }

        const halfFov = (this.cameraViewAngle * Math.PI / 180) / 2;
        this.cameraDistance = Math.max(45, (maxRadius / Math.tan(halfFov)) * 1.25);
        this.setCameraDirection('z');
    }

    addCell(lat) {
        if (!this.cell || !lat) {
            return;
        }

        const material = new THREE.LineBasicMaterial({ color: 0x000000 });
        const points = [];
        const zero = new THREE.Vector3(0, 0, 0);
        const cursor = new THREE.Vector3(0, 0, 0);
        const shift = this.geometricCenter;
        const x = new THREE.Vector3(lat[0][0], lat[0][1], lat[0][2]);
        const y = new THREE.Vector3(lat[1][0], lat[1][1], lat[1][2]);
        const z = new THREE.Vector3(lat[2][0], lat[2][1], lat[2][2]);

        cursor.copy(zero);
        cursor.sub(shift); points.push(cursor.clone());
        cursor.add(x); points.push(cursor.clone());
        cursor.add(y); points.push(cursor.clone());
        cursor.sub(x); points.push(cursor.clone());
        cursor.sub(y); points.push(cursor.clone());

        cursor.copy(zero).add(z);
        cursor.sub(shift); points.push(cursor.clone());
        cursor.add(x); points.push(cursor.clone());
        cursor.add(y); points.push(cursor.clone());
        cursor.sub(x); points.push(cursor.clone());
        cursor.sub(y); points.push(cursor.clone());

        cursor.copy(zero);
        cursor.sub(shift); points.push(cursor.clone());
        cursor.add(z); points.push(cursor.clone());

        cursor.add(x); points.push(cursor.clone());
        cursor.sub(z); points.push(cursor.clone());

        cursor.add(y); points.push(cursor.clone());
        cursor.add(z); points.push(cursor.clone());

        cursor.sub(x); points.push(cursor.clone());
        cursor.sub(z); points.push(cursor.clone());

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.scene.add(new THREE.Line(geometry, material));
    }

    addMarchingCubes() {
        if (!this.hasChargeDensity()) {
            return;
        }

        const geometry = buildMarchingCubesGeometry(
            this.values,
            this.sizex,
            this.sizey,
            this.sizez,
            this.gridCell,
            this.isolevel,
            {
                periodic: true,
                insideIsAbove: true,
            },
        );

        const material = new THREE.MeshLambertMaterial({
            color: 0xffff00,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.18,
            depthWrite: false,
        });

        for (let ix = 0; ix < this.nx; ix++) {
            for (let iy = 0; iy < this.ny; iy++) {
                for (let iz = 0; iz < this.nz; iz++) {
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.name = 'isosurface';
                    mesh.position.set(
                        ix * this.baseLattice[0][0] + iy * this.baseLattice[1][0] + iz * this.baseLattice[2][0] - this.geometricCenter.x,
                        ix * this.baseLattice[0][1] + iy * this.baseLattice[1][1] + iz * this.baseLattice[2][1] - this.geometricCenter.y,
                        ix * this.baseLattice[0][2] + iy * this.baseLattice[1][2] + iz * this.baseLattice[2][2] - this.geometricCenter.z,
                    );
                    this.scene.add(mesh);
                }
            }
        }
    }

    updateStructure() {
        if (!this.scene || !this.structureData || !this.baseLattice || !this.baseAtoms.length) {
            return;
        }

        this.atoms = this.getReplicatedAtoms(this.nx, this.ny, this.nz);
        this.currentLattice = this.getSupercellLattice();

        this.geometricCenter = new THREE.Vector3(0, 0, 0);
        for (let i = 0; i < this.atoms.length; i++) {
            this.geometricCenter.add(new THREE.Vector3(this.atoms[i][1], this.atoms[i][2], this.atoms[i][3]));
        }
        this.geometricCenter.multiplyScalar(1 / this.atoms.length);

        if (this.shouldAutoFitCamera) {
            this.updateViewParameters();
        }
        this.removeStructure();
        this.addLights();
        this.addMarchingCubes();
        this.getAtomMaterials();
        this.addStructure();
        this.addCell(this.currentLattice);
        this.render();
        this.shouldAutoFitCamera = false;
    }
}
