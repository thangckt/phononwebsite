import { LocalDB } from './localdb.js';
import { ContribDB } from './contribdb.js';
import { PhononDB2015 } from './phonondb2015.js';
import { PhononDB2018 } from './phonondb2018.js';
import { LocalPhononDB2015 } from './localphonondb2015.js';
import { LocalPhononDB2018 } from './localphonondb2018.js';
import { MaterialsProjectDB } from './mpdb.js';
import { LocalMaterialsProjectDB } from './localmpdb.js';
import { PhononJson } from './phononjson.js';
import { PhononYaml } from './phononyaml.js';
import { exportXSF, exportPOSCAR }  from './exportfiles.js';
import * as atomic_data from './atomic_data.js';
import * as mat from './mat.js';
import * as utils from './utils.js';

export class PhononWebpage {

    constructor(visualizer, dispersion) {
        this.k = 0;
        this.n = 0;
        this.nx = 1;
        this.ny = 1;
        this.nz = 1;

        //select visualization
        this.visualizer = visualizer;

        //select dispersion
        this.dispersion = dispersion;

        //bind some functions (TODO: improve this)
        this.exportXSF    = exportXSF.bind(this);
        this.exportPOSCAR = exportPOSCAR.bind(this);

        //bind click event from highcharts with action
        dispersion.setClickEvent(this);

        // set null materials project API key
        this.mpapikey = null;
        this.showModeWeightsOnPlot = false;
        this.materialFilterQuery = '';
        this.materialsIndex = [];
    }

    //functions to link the DOM buttons with this class
    setMaterialsList(dom_mat)      { this.dom_mat = dom_mat; }
    setMaterialsFilterInput(dom_input) {
        this.dom_material_filter = dom_input;
        this.materialFilterQuery = '';
        this.materialsIndex = [];
        if (!dom_input || !dom_input.length) {
            return;
        }

        dom_input.on('input', () => {
            this.materialFilterQuery = dom_input.val() || '';
            this.renderMaterialsMenu();
        });
    }
    setReferencesList(dom_ref)     { this.dom_ref = dom_ref; }
    setAtomPositions(dom_atompos)  { this.dom_atompos = dom_atompos; }
    setLattice(dom_lattice)        { this.dom_lattice = dom_lattice; }
    setTitle(dom_title)            { this.dom_title = dom_title; }

    setUpdateButton(dom_button) {
        self = this;
        dom_button.click( function() { self.update(); } );
    }

    setExportXSFButton(dom_button) {
        dom_button.click(this.exportXSF.bind(this));
    }

    setExportPOSCARButton(dom_button) {
        dom_button.click(this.exportPOSCAR.bind(this));
    }

    setRepetitionsInput(dom_nx,dom_ny,dom_nz) {

        this.dom_nx = dom_nx;
        this.dom_ny = dom_ny;
        this.dom_nz = dom_nz;

        function keyup(event) {
            if(event.keyCode == 13) {
                this.update(false);
            }
        }

        dom_nx.keyup( keyup.bind(this) );
        dom_ny.keyup( keyup.bind(this) );
        dom_nz.keyup( keyup.bind(this) );
    }

    setModeSelectionInput(dom_k, dom_n, dom_button) {
        this.dom_k = dom_k;
        this.dom_n = dom_n;
        this.dom_mode_button = dom_button;

        function keyup(event) {
            if(event.keyCode == 13) {
                this.selectModeFromInputs();
            }
        }

        if (this.dom_k) { this.dom_k.keyup( keyup.bind(this) ); }
        if (this.dom_n) { this.dom_n.keyup( keyup.bind(this) ); }
        if (this.dom_mode_button) { this.dom_mode_button.click( this.selectModeFromInputs.bind(this) ); }
    }

    setModeWeightsToggle(dom_checkbox) {
        this.dom_mode_weights_toggle = dom_checkbox;
        if (!dom_checkbox || !dom_checkbox.length) {
            return;
        }

        dom_checkbox.prop('checked', this.showModeWeightsOnPlot);
        dom_checkbox.on('change', () => {
            this.showModeWeightsOnPlot = !!dom_checkbox.prop('checked');
            this.refreshDispersionAppearance();
        });
    }

    setFileInput(dom_input) {
        /* Load a custom file button
        */
        dom_input.change( this.loadCustomFile.bind(this) );
        dom_input.click( function() { this.value = '';} );
    }

    setMaterialsProjectAPIKey(dom_input, dom_button) {
        let self = this;

        // Handle button click
        dom_button.click(function () {
            self.mpapikey = dom_input[0].value;
            self.updateMenu();
        });

        // Handle Enter key press
        dom_input.keypress(function (event) {
            if (event.keyCode === 13) { // Check if Enter key is pressed
                self.mpapikey = dom_input[0].value;
                //self.updateMenu();
            }
        });
    }

    loadCustomFile(event) {
        /*
        find the type of file and call the corresponding function to read it

        two formats available:
            1. band.yaml generated with phonopy with eigenvectors
            2. internal .json format description available in
            http://henriquemiranda.github.io/phononwebsite/
            3. pymatgen phononBS format
        */
        this.k = 0;
        this.n = 0;
        self = this;

        function set_name() {
            delete self.link;
            self.name = utils.subscript_numbers(self.phonon.name);
            self.loadCallback();
        }

        let file = event.target.files[0];
        if (file.name.indexOf(".yaml") > -1) {
            this.phonon = new PhononYaml();
            this.phonon.getFromFile(file, set_name );
         }
        else if (file.name.indexOf(".json") > -1) {
            this.phonon = new PhononJson();
            this.phonon.getFromFile(file, set_name );
        }
        else {
            alert("Ivalid file");
        }
    }

    loadURL(url_vars,callback) {
        /*
        load file from post request in the url
        */

        this.k = 0;
        this.n = 0;
        delete this.link;
        if (callback == null) {
            callback = this.loadCallback.bind(this);
        }

        if ( "name" in url_vars ) {
            this.name = url_vars.name;
        }
        if ( "link" in url_vars ) {
            this.link = url_vars.link;
        }

        if ("yaml" in url_vars) {
            this.phonon = new PhononYaml();
            this.phonon.getFromURL(url_vars.yaml,callback);
        }
        else if ("json" in url_vars) {
            this.phonon = new PhononJson();
            this.phonon.getFromURL(url_vars.json,callback);
        }
        else if ("rest" in url_vars) {
            this.phonon = new PhononJson();
            this.phonon.getFromREST(url_vars.rest,url_vars.apikey,callback);
        }
        else {
            //alert("Ivalid url");
        }
    }

    getUrlVars(default_vars) {
        /*
        get variables from the url
        from http://stackoverflow.com/questions/4656843/jquery-get-querystring-from-url

        currently the possible options are:
            json : load a json file from location
            yaml : load a yaml file from location
            name : change the display name of the material
        */
        let hash;
        let vars = {};

        if (location.search) {
            let hashes = location.search.slice(1).split('&');
            for(let i = 0; i < hashes.length; i++) {
                hash = hashes[i].split('=');
                vars[hash[0]] = hash[1];
            }
        }

        //if no argument is present use the default vars
        if (Object.keys(vars).length < 1) {
            vars = default_vars;
        }

        this.loadURL(vars);
    }

    loadCallback() {
        /*
        Fuunction to be called once the file is loaded
        */
        this.name = utils.subscript_numbers(this.phonon.name);
        this.setRepetitions(this.phonon.repetitions);
        this.updateModeSelectionInputs();
        if (!this.enforceVisualizationLimits(true)) {
            return;
        }
        this.update();
    }

    getRepetitions() {
        /*
        read the number of repetitions in each direction and update it
        */
        if (this.dom_nx) { this.nx = this.dom_nx.val(); }
        if (this.dom_ny) { this.ny = this.dom_ny.val(); }
        if (this.dom_nz) { this.nz = this.dom_nz.val(); }
    }

    setRepetitions(repetitions) {
        /*
        set the number of repetitions on the interface
        */

        if (repetitions) {
            this.nx = repetitions[0];
            this.ny = repetitions[1];
            this.nz = repetitions[2];
        }

        if (this.dom_nx) { this.dom_nx.val(this.nx); }
        if (this.dom_ny) { this.dom_ny.val(this.ny); }
        if (this.dom_nz) { this.dom_nz.val(this.nz); }
    }

    getStructure(nx,ny,nz) {
        let lat = this.phonon.lat;
        let apc = this.phonon.atom_pos_car;
        let atoms = [];

        for (let ix=0;ix<nx;ix++) {
            for (let iy=0;iy<ny;iy++) {
                for (let iz=0;iz<nz;iz++) {
                    for (let i=0;i<this.phonon.natoms;i++) {

                        //postions of the atoms
                        let x = apc[i][0] + ix*lat[0][0] + iy*lat[1][0] + iz*lat[2][0];
                        let y = apc[i][1] + ix*lat[0][1] + iy*lat[1][1] + iz*lat[2][1];
                        let z = apc[i][2] + ix*lat[0][2] + iy*lat[1][2] + iz*lat[2][2];

                        atoms.push( [i,x,y,z] );
                    }
                }
            }
        }

        return atoms;
    }

    getBondingDistance() {
        /*
        replicate the unit cell two times in each direction
        and clauclate the minimum bonding distance
        */
        let atoms = this.getStructure(2,2,2);

        let combinations = utils.getCombinations( atoms );
        let min = 1e9;
        for (let i=0; i<combinations.length; i++ ) {
            let a = combinations[i][0];
            let b = combinations[i][1];

            let dist = mat.distance(a.slice(1),b.slice(1));
            if (min > dist) {
                min = dist;
            }
        }
        return min;
    }

    getVibrations(nx,ny,nz) {
        /*
        Calculate the vibration patterns for all the atoms
        */
        let phonon = this.phonon;
        let veckn = phonon.vec[this.k][this.n];
        let vibrations = [];
        let kpt = phonon.kpoints[this.k];

        //additional phase if necessary
        let atom_phase = [];
        if (phonon.addatomphase) {
            for (let i=0; i<phonon.natoms; i++) {
                let phase = mat.vec_dot(kpt,phonon.atom_pos_red[i]);
                atom_phase.push(phase);
            }
        }
        else {
            for (let i=0; i<phonon.natoms; i++) {
                atom_phase.push(0);
            }
        }

        for (let ix=0; ix<nx; ix++) {
            for (let iy=0; iy<ny; iy++) {
                for (let iz=0; iz<nz; iz++) {

                    for (let i=0; i<phonon.natoms; i++) {
                        let sprod = mat.vec_dot(kpt,[ix,iy,iz]) + atom_phase[i];
                        let phase = Complex.Polar(1.0,sprod*2.0*mat.pi);

                        //Displacements of the atoms
                        let x = Complex(veckn[i][0][0],veckn[i][0][1]).mult(phase);
                        let y = Complex(veckn[i][1][0],veckn[i][1][1]).mult(phase);
                        let z = Complex(veckn[i][2][0],veckn[i][2][1]).mult(phase);

                        vibrations.push( [x,y,z] );
                    }
                }
            }
        }

        return vibrations;
    }

    setVibrations() {
        this.vibrations = this.getVibrations(this.nx,this.ny,this.nz);
    }

    getModeSelectionLimits() {
        if (!this.phonon || !this.phonon.eigenvalues || !this.phonon.distances) {
            return { maxK: 0, maxN: 0 };
        }
        let maxK = Math.max(0, this.phonon.distances.length - 1);
        let maxN = Math.max(0, this.phonon.eigenvalues[0].length - 1);
        return { maxK: maxK, maxN: maxN };
    }

    getEnergyOrderedBandIndices(k) {
        if (!this.phonon || !this.phonon.eigenvalues || !this.phonon.eigenvalues[k]) {
            return [];
        }
        let values = this.phonon.eigenvalues[k];
        let indexed = values.map((value, index) => ({ value: value, index: index }));
        indexed.sort((a, b) => a.value - b.value);
        return indexed.map((item) => item.index);
    }

    getBandIndexFromEnergyOrder(k, order) {
        let orderMap = this.getEnergyOrderedBandIndices(k);
        if (orderMap.length === 0) { return 0; }
        order = Math.max(0, Math.min(orderMap.length - 1, order));
        return orderMap[order];
    }

    getEnergyOrderFromBandIndex(k, bandIndex) {
        let orderMap = this.getEnergyOrderedBandIndices(k);
        let order = orderMap.indexOf(bandIndex);
        return order >= 0 ? order : 0;
    }

    updateModeSelectionInputs() {
        if (!this.dom_k || !this.dom_n) { return; }
        let limits = this.getModeSelectionLimits();

        this.dom_k.attr('min', 0);
        this.dom_k.attr('max', limits.maxK);
        this.dom_k.attr('step', 1);
        this.dom_k.val(this.k);

        this.dom_n.attr('min', 0);
        this.dom_n.attr('max', limits.maxN);
        this.dom_n.attr('step', 1);
        this.dom_n.val(this.getEnergyOrderFromBandIndex(this.k, this.n));
    }

    selectModeByBandIndex(k, n, syncChart=true) {
        if (!this.phonon) { return; }
        let limits = this.getModeSelectionLimits();

        k = parseInt(k, 10);
        n = parseInt(n, 10);
        if (!Number.isFinite(k)) { k = this.k; }
        if (!Number.isFinite(n)) { n = this.n; }

        this.k = Math.max(0, Math.min(limits.maxK, k));
        this.n = Math.max(0, Math.min(limits.maxN, n));
        this.updateModeSelectionInputs();

        this.setVibrations();
        this.visualizer.update(this);
        if (syncChart && this.dispersion && this.dispersion.selectModePoint) {
            this.dispersion.selectModePoint(this.phonon, this.k, this.n);
        }
    }

    selectMode(k, nOrder, syncChart=true) {
        if (!this.phonon) { return; }
        let limits = this.getModeSelectionLimits();

        k = parseInt(k, 10);
        nOrder = parseInt(nOrder, 10);
        if (!Number.isFinite(k)) { k = this.k; }
        if (!Number.isFinite(nOrder)) { nOrder = this.getEnergyOrderFromBandIndex(this.k, this.n); }

        k = Math.max(0, Math.min(limits.maxK, k));
        nOrder = Math.max(0, Math.min(limits.maxN, nOrder));
        let n = this.getBandIndexFromEnergyOrder(k, nOrder);
        this.selectModeByBandIndex(k, n, syncChart);
    }

    selectModeFromInputs() {
        if (!this.dom_k || !this.dom_n) { return; }
        this.selectMode(this.dom_k.val(), this.dom_n.val(), true);
    }

    update(dispersion = true) {
        /*
        Update all the aspects fo the webpage
        */

        //update structure
        this.getRepetitions();
        if (!this.enforceVisualizationLimits(false)) {
            return;
        }
        this.atoms = this.getStructure(this.nx,this.ny,this.nz);
        this.vibrations = this.getVibrations(this.nx,this.ny,this.nz);
        this.phonon.nndist = this.getBondingDistance();

        //update page
        this.updatePage();

        //update visualizer first so material changes show immediately in Three.js
        this.visualizer.update(this);

        //update dispersion
        if (dispersion) {
            const dispersionOptions = this.getDispersionOptions();
            dispersionOptions.resetLegendVisibility = true;
            this.dispersion.update(this.phonon, dispersionOptions);
            if (this.dispersion.selectModePoint) {
                this.dispersion.selectModePoint(this.phonon, this.k, this.n);
            }
        }
    }

    getDispersionOptions() {
        return {
            enabled: this.showModeWeightsOnPlot,
            getAtomColorHex: (atomNumber) => this.getAtomColorHex(atomNumber),
            getAtomLabel: (atomNumber) => atomic_data.atomic_symbol[atomNumber] || String(atomNumber),
            resetLegendVisibility: false,
        };
    }

    getAtomColorHex(atomNumber) {
        if (this.visualizer && typeof this.visualizer.getAtomColorHex === 'function') {
            return this.visualizer.getAtomColorHex(atomNumber);
        }
        return 0x0066ff;
    }

    getAtomColorCss(atomNumber) {
        return '#' + Number(this.getAtomColorHex(atomNumber)).toString(16).padStart(6, '0');
    }

    getAtomBadgeTextColor(atomNumber) {
        let color = Number(this.getAtomColorHex(atomNumber));
        let red = (color >> 16) & 255;
        let green = (color >> 8) & 255;
        let blue = color & 255;
        let luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
        return luminance > 0.6 ? '#111827' : '#ffffff';
    }

    refreshAppearanceUI() {
        this.updatePage();
        this.refreshDispersionAppearance();
    }

    refreshDispersionAppearance() {
        if (!this.phonon || !this.dispersion) {
            return;
        }
        this.dispersion.update(this.phonon, this.getDispersionOptions());
        if (this.dispersion.selectModePoint) {
            this.dispersion.selectModePoint(this.phonon, this.k, this.n);
        }
        if (this.dispersion.reflow) {
            this.dispersion.reflow();
        }
    }

    estimateDisplayedAtoms() {
        if (!this.phonon || !this.phonon.natoms) {
            return 0;
        }
        return Number(this.phonon.natoms) * Number(this.nx) * Number(this.ny) * Number(this.nz);
    }

    enforceVisualizationLimits(fromLoadCallback) {
        const maxDisplayedAtoms = 5000;
        const displayedAtoms = this.estimateDisplayedAtoms();

        if (displayedAtoms <= maxDisplayedAtoms) {
            return true;
        }

        if (fromLoadCallback && this.phonon && this.phonon.natoms <= maxDisplayedAtoms) {
            this.setRepetitions([1, 1, 1]);
            return true;
        }

        alert(
            'This structure is too large to render interactively (' +
            displayedAtoms +
            ' atoms after repetitions). Please reduce repetitions or use a smaller structure.'
        );
        return false;
    }

    updatePage() {
        /*
        lattice vectors table
        */

        if (this.dom_lattice)  {
            this.dom_lattice.empty();
            for (let i=0; i<3; i++) {
                let tr = document.createElement("TR");
                for (let j=0; j<3; j++) {
                    let td = document.createElement("TD");
                    let x = document.createTextNode(this.phonon.lat[i][j].toPrecision(4));
                    td.appendChild(x);
                    tr.append(td);
                }
                this.dom_lattice.append(tr);
            }
        }

        //atomic positions table
        if (this.dom_atompos) {
            this.dom_atompos.empty();
            let pos = this.phonon.atom_pos_red;
            for (let i=0; i<pos.length; i++) {
                let tr = document.createElement("TR");

                let td = document.createElement("TD");
                let atomNumber = this.phonon.atom_numbers ? this.phonon.atom_numbers[i] : null;
                let badge = document.createElement("SPAN");
                badge.className = "atom-type-badge";
                badge.textContent = this.phonon.atom_types[i];
                if (atomNumber !== null) {
                    badge.style.setProperty('--atom-badge-bg', this.getAtomColorCss(atomNumber));
                    badge.style.setProperty('--atom-badge-fg', this.getAtomBadgeTextColor(atomNumber));
                }
                td.className = "ap atom-type-cell";
                td.appendChild(badge);
                tr.append(td);

                for (let j=0; j<3; j++) {
                    let td = document.createElement("TD");
                    let x = document.createTextNode(pos[i][j].toFixed(4));
                    td.appendChild(x);
                    tr.append(td);
                }
                this.dom_atompos.append(tr);
            }
        }

        //update title
        if (this.dom_title) {
            let title = this.dom_title[0];
            while (title.hasChildNodes()) {
                title.removeChild(title.lastChild);
            }

            //make link
            if ("link" in this) {
                let a = document.createElement("A");
                a.href = this.link;
                a.innerHTML = this.name;
                title.appendChild(a);
            }
            else {
                title.innerHTML = this.name;
            }

        }
    }

    updateMenu() {
        /*
        create menu with:
            1. local files (files distributed with the website)
            2. files from the phonodb database 2015 and 2017
            3. potentially more sources of data can be added
        */

        let self = this;

        this.materialsIndex = [];
        if (this.dom_mat) { this.dom_mat.empty(); }
        if (this.dom_ref) { this.dom_ref.empty(); }

        function addMaterials(materials) {
            for (let i=0; i<materials.length; i++) {
                self.materialsIndex.push(materials[i]);
            }
            self.renderMaterialsMenu();
        }

        //local database
        let source = new LocalDB();
        source.get_materials(addMaterials);

        //contributions database
        source = new ContribDB();
        source.get_materials(addMaterials);

        //materials project database
        source = new MaterialsProjectDB(self.mpapikey);
        source.checkAvailability(function(isAvailable) {
            if (isAvailable) {
                source.get_materials(addMaterials);
            } else {
                console.log("Skipping Materials Project phonons because the OpenData bucket is unreachable from this browser.");
            }
        });

        /*
        //phonondb2015 database
        for (let sourceclass of [PhononDB2015, LocalPhononDB2015 ]) {
            source = new sourceclass;
            if (source.isAvailable()) {
                source.get_materials(addMaterials);
                break;
            }
        }

        //phonondb2018 database
        for (let sourceclass of [PhononDB2018, LocalPhononDB2018 ]) {
            source = new sourceclass;
            if (source.isAvailable()) {
                source.get_materials(addMaterials);
                break;
            }
        }

        //mp databse
        for (let sourceclass of [MaterialsProjectDB, LocalMaterialsProjectDB ]) {
            source = new sourceclass(self.mpapikey);
            if (source.isAvailable()) {
                source.get_materials(addMaterials);
                break;
            }
        }*/

    }

    getMaterialFilterTokens() {
        let query = this.materialFilterQuery || '';
        return query
            .toLowerCase()
            .split(/[\s,]+/)
            .map(function(token) { return token.trim(); })
            .filter(function(token) { return token.length > 0; });
    }

    getMaterialElements(materialName) {
        let matches = materialName.match(/[A-Z][a-z]?/g);
        if (!matches) {
            return [];
        }
        return matches.map(function(symbol) {
            return symbol.toLowerCase();
        });
    }

    materialMatchesFilter(material, tokens) {
        if (!tokens.length) {
            return true;
        }

        let materialName = material.name || '';
        let formulaText = materialName.toLowerCase();
        let elementTokens = this.getMaterialElements(materialName);

        return tokens.every(function(token) {
            if (/^[a-z]{1,2}$/.test(token)) {
                return elementTokens.indexOf(token) !== -1;
            }
            return formulaText.indexOf(token) !== -1;
        });
    }

    renderMaterialsMenu() {
        let dom_mat = this.dom_mat;
        let dom_ref = this.dom_ref;
        if (!dom_mat) {
            return;
        }

        dom_mat.empty();
        if (dom_ref) {
            dom_ref.empty();
        }

        let tokens = this.getMaterialFilterTokens();
        let unique_references = {};
        let filteredMaterials = this.materialsIndex.filter((material) => this.materialMatchesFilter(material, tokens));
        let nreferences = 1;

        for (let i=0; i<filteredMaterials.length; i++) {
            let m = filteredMaterials[i];
            let ref = m["reference"];
            if (!unique_references.hasOwnProperty(ref)) {
                unique_references[ref] = nreferences;
                nreferences += 1;
            }

            let name = utils.subscript_numbers(m.name);
            let name_ref = name + " ["+unique_references[ref]+"]";

            let li = document.createElement("LI");
            let a = document.createElement("A");
            a.onclick = () => {
                let url_vars = {};
                url_vars[m.type] = m.url;
                url_vars.name = name_ref;
                url_vars.apikey = m.apikey;
                if ("link" in m) { url_vars.link = m.link }
                this.loadURL(url_vars);
            };
            a.innerHTML = name;
            li.appendChild(a);
            dom_mat.append(li);
        }

        if (dom_ref) {
            for (let ref in unique_references) {
                let refIndex = unique_references[ref];
                let li = document.createElement("LI");
                li.innerHTML = "["+refIndex+"] "+ref;
                dom_ref.append(li);
            }
        }
    }

}
