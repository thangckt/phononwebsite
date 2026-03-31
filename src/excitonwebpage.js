import $ from 'jquery';

import { format_formula_html } from './utils.js';

export class ExcitonWebpage {

    constructor(viewer, spectra) {
        this.viewer = viewer;
        this.spectra = spectra;
        this.materials = {
            bn: {
                name: 'Boron Nitride',
                file: 'data/excitondb/bn/absorptionspectra.json',
                visible: true,
            },
            mos2: {
                name: 'MoS2',
                file: 'data/excitondb/mos2/absorptionspectra.json',
                visible: false,
            },
            mote2: {
                name: 'MoTe2',
                file: 'data/excitondb/mote2/absorptionspectra.json',
                visible: false,
            },
        };
        this.currentMaterial = 'bn';

        this.spectra.setSelectionHandler((index) => {
            this.selectExciton(index);
        });
    }

    setTitle(domTitle) {
        this.domTitle = domTitle;
    }

    setMaterialsList(domList) {
        this.domMaterials = domList;
    }

    setFileInput(domInput) {
        this.domFileInput = domInput;
        domInput.change(this.loadCustomFile.bind(this));
        domInput.click(function () { this.value = ''; });
    }

    setIsolevelInput(domInput, domValue = null) {
        this.domIsolevelInput = domInput;
        this.domIsolevelValue = domValue;

        const handler = () => {
            const value = Number(domInput.val());
            if (this.domIsolevelValue) {
                this.domIsolevelValue.text(value.toFixed(3));
            }
            this.viewer.changeIsolevel(value);
        };

        domInput.on('input change', handler);
        handler();
    }

    setCameraDirectionButton(domButton, direction) {
        domButton.click(() => this.viewer.setCameraDirection(direction));
    }

    init() {
        this.updateMaterialsMenu();
        return this.loadMaterial(this.currentMaterial);
    }

    updateMaterialsMenu() {
        if (!this.domMaterials) {
            return;
        }

        this.domMaterials.empty();

        Object.keys(this.materials).forEach((key) => {
            const material = this.materials[key];
            if (material.visible === false) {
                return;
            }
            const link = $('<a href="#"></a>');
            link.html(format_formula_html(material.name));
            link.on('click', (event) => {
                event.preventDefault();
                this.loadMaterial(key);
            });

            const item = $('<li></li>');
            if (key === this.currentMaterial) {
                item.addClass('active');
            }
            item.append(link);
            this.domMaterials.append(item);
        });
    }

    loadMaterial(key) {
        const material = this.materials[key];
        if (!material) {
            return Promise.resolve();
        }

        this.currentMaterial = key;
        this.updateMaterialsMenu();
        this.setTitleText(material.name);

        return this.spectra.getDataFilename(material.file).then(() => {
            this.viewer.setData(this.spectra);
            this.viewer.updateStructure();
        });
    }

    loadCustomFile(event) {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.readAsText(file);
        reader.onloadend = () => {
            const data = JSON.parse(reader.result);
            this.currentMaterial = '';
            this.updateMaterialsMenu();
            this.setTitleText(file.name.replace(/\.json$/i, ''));
            this.spectra.getDataObject(data);
            this.spectra.render();
            this.viewer.setData(this.spectra);
            this.viewer.updateStructure();
        };
    }

    selectExciton(index) {
        this.spectra.setExcitonIndex(index, false);
        this.viewer.setExcitonIndex(index);
        this.viewer.updateStructure();
    }

    setTitleText(title) {
        if (this.domTitle) {
            this.domTitle.html(format_formula_html(title));
        }
    }
}
