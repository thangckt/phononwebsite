import * as THREE from 'three';
import { TrackballControls } from './static_libs/TrackballControls.js';
import { Stats } from './static_libs/stats.min.js';
import * as atomic_data from './atomic_data.js';
import * as utils from './utils.js';
import * as mat from './mat.js';

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
        this.paused = false;
        this.initialized = false;

        this.container = container;
        this.container0 = container.get(0);
        this.dimensions = this.getContainerDimensions();

        this.stats = null;
        this.camera = null;
        this.controls = null;
        this.scene = null;
        this.renderer = null;
        this.capturer = null;
        this.captureState = 'idle';
        this.vibrationComponents = [];

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
        this.minArrowScale = 0.0;
        this.maxArrowScale = 5.0;
        this.stepArrowScale = 0.01;

        //amplitude
        this.amplitude = 0.2;
        this.minAmplitude = 0.0;
        this.maxAmplitude = 1.0;
        this.stepAmplitude = 0.01;

        //speed
        this.speed = 1.0;
        this.minSpeed = 0.01;
        this.maxSpeed = 3.0;
        this.stepSpeed = 0.01;

        this.fps = 60;

        this.arrowcolor = 0xbbffbb;
        this.bondscolor = 0xffffff;
        this.arrowobjects = [];
        this.atomobjects = [];
        this.atommeshes = [];
        this.atomInstanceRefs = [];
        this.bondobjects = [];
        this.bondmesh = null;
        this.bonds = [];
        this.instanceDummy = new THREE.Object3D();
        this.captureK = null;
        this.captureN = null;
		this.modified_covalent_radii = JSON.parse(JSON.stringify(atomic_data.covalent_radii));
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
            self.updatelocal();
        }
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
        this.arrows = dom_checkbox.checked;
        dom_checkbox.click( function() {
            self.arrows = this.checked;
            self.updatelocal();
        });
    }

    setArrowsInput(dom_range) {
        let self = this;

        dom_range.val(self.arrowScale);
        dom_range.attr('min',self.minArrowScale);
        dom_range.attr('max',self.maxArrowScale);
        dom_range.attr('step',self.stepArrowScale);
        dom_range.change( function () {
            self.arrowScale = this.value;
        });
    }

   setAmplitudeInput(dom_number,dom_range) {
        let self = this;

        dom_number.val(self.amplitude);
        dom_number.keyup( function () {
            if (this.value < dom_range.min) { dom_range.attr('min', this.value); }
            if (this.value > dom_range.max) { dom_range.attr('max', this.value); }
            self.amplitude = this.value;
            dom_range.val(this.value)
        });

        dom_range.val(self.amplitude);
        dom_range.attr('min',self.minAmplitude);
        dom_range.attr('max',self.maxAmplitude);
        dom_range.attr('step',self.stepAmplitude);
        dom_range.change( function () {
            self.amplitude = this.value;
            dom_number.val(this.value);
        });
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
        let self = this;
        this.dom_covalent_radii_select = dom_select;
        this.dom_covalent_radii_input = dom_input;
        dom_select.change( function() {
            dom_input.val(self.modified_covalent_radii[this.value]);
        });
    }

    adjustCovalentRadiiSelect() {
        let unique_atom_numbers = this.atom_numbers.filter((v, i, a) => a.indexOf(v) === i);

        this.dom_covalent_radii_select.empty();
        for (let i=0; i<unique_atom_numbers.length; i++) {
            this.dom_covalent_radii_select.append('<option value="' + unique_atom_numbers[i] + '">' + atomic_data.atomic_symbol[unique_atom_numbers[i]] + '</option>');
        }
        this.dom_covalent_radii_input.val(this.modified_covalent_radii[this.dom_covalent_radii_select.val()]);
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
            let pointLight = new THREE.PointLight(  0xffffff, 1.2 );
            pointLight.position.set(1, 1, 1);
            this.camera.add(pointLight);
        } else {
            let pointLight = new THREE.PointLight( 0xdddddd );
            pointLight.position.set(1,1,2);
            this.camera.add(pointLight);
        }

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
            if (this.display == 'vesta') {
                 let r = atomic_data.vesta_colors[n][0];
                 let g = atomic_data.vesta_colors[n][1];
                 let b = atomic_data.vesta_colors[n][2];

                 let material = new THREE.MeshPhongMaterial( {reflectivity:1, shininess: 80} );
                 material.color.setRGB (r, g, b);
                 this.materials.push( material );
            } else {
                let r = atomic_data.jmol_colors[n][0];
                let g = atomic_data.jmol_colors[n][1];
                let b = atomic_data.jmol_colors[n][2];

                let material = new THREE.MeshLambertMaterial( { blending: THREE.NormalBlending } );
                material.color.setRGB (r, g, b);
                this.materials.push( material );
            }
        }
    }

    addCell(lat) {
        /*
        Represent the unit cell
        */
        if (this.cell) {
          let material = new THREE.LineBasicMaterial({ color: 0x000000 });
          let geometry = new THREE.Geometry();

          let o = this.geometricCenter;
          let zero = new THREE.Vector3(0,0,0);
          let c = new THREE.Vector3(0,0,0);
          let x = new THREE.Vector3(lat[0][0], lat[0][1], lat[0][2]);
          let y = new THREE.Vector3(lat[1][0], lat[1][1], lat[1][2]);
          let z = new THREE.Vector3(lat[2][0], lat[2][1], lat[2][2]);

          //lower part
          c.copy(zero);
          c.sub(o); geometry.vertices.push(c.clone());
          c.add(x); geometry.vertices.push(c.clone());
          c.add(y); geometry.vertices.push(c.clone());
          c.sub(x); geometry.vertices.push(c.clone());
          c.sub(y); geometry.vertices.push(c.clone());

          //upper part
          c.copy(zero); c.add(z);
          c.sub(o); geometry.vertices.push(c.clone());
          c.add(x); geometry.vertices.push(c.clone());
          c.add(y); geometry.vertices.push(c.clone());
          c.sub(x); geometry.vertices.push(c.clone());
          c.sub(y); geometry.vertices.push(c.clone());

          //vertical lines
          c.copy(zero);
          c.sub(o); geometry.vertices.push(c.clone());
          c.add(z); geometry.vertices.push(c.clone());

          c.add(x); geometry.vertices.push(c.clone());
          c.sub(z); geometry.vertices.push(c.clone());

          c.add(y); geometry.vertices.push(c.clone());
          c.add(z); geometry.vertices.push(c.clone());

          c.sub(x); geometry.vertices.push(c.clone());
          c.sub(z); geometry.vertices.push(c.clone());

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
        this.atomInstanceRefs = [];
        this.bondobjects  = [];
        this.bondmesh = null;
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
            if (this.display == 'vesta') {
                sphereGeometry = new THREE.SphereGeometry(
                    atomic_data.covalent_radii[atom_numbers[typeIndex]]/2.3,
                    this.sphereLat,
                    this.sphereLon
                );
            } else {
                sphereGeometry = new THREE.SphereGeometry(
                    this.sphereRadius,
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

            let AxisMaterial  = new THREE.MeshLambertMaterial( { color: this.arrowcolor,
                                                                 blending: THREE.NormalBlending } );

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
        let bondColors = [];

        //collect bonds first
        for (let i=0; i<combinations.length; i++) {
            a = combinations[i][0];
            b = combinations[i][1];
            let ad = a.position;
            let bd = b.position;

            //if the separation is smaller than the sum of the bonding radius create a bond
            length = ad.distanceTo(bd);
            let cra = this.modified_covalent_radii[a.atom_number];
            let crb = this.modified_covalent_radii[b.atom_number];
            if (length < cra + crb || length < this.nndist ) {
                this.bonds.push({ a: ad, b: bd, baseLength: length });
                if (this.display == 'vesta') {
                    let cr = (atomic_data.vesta_colors[a.atom_number][0] + atomic_data.vesta_colors[b.atom_number][0]) / 2;
                    let cg = (atomic_data.vesta_colors[a.atom_number][1] + atomic_data.vesta_colors[b.atom_number][1]) / 2;
                    let cb = (atomic_data.vesta_colors[a.atom_number][2] + atomic_data.vesta_colors[b.atom_number][2]) / 2;
                    bondColors.push([cr, cg, cb]);
                } else {
                    bondColors.push(null);
                }
            }
        }

        //build one instanced mesh for all bonds
        if (this.bonds.length > 0) {
            let bondGeometry = new THREE.CylinderGeometry(
                this.bondRadius, this.bondRadius, 1.0, this.bondSegments, this.bondVertical, true
            );
            let bondMaterial = new THREE.MeshLambertMaterial({
                color: this.bondscolor,
                blending: THREE.NormalBlending,
                vertexColors: this.display == 'vesta'
            });

            this.bondmesh = new THREE.InstancedMesh(bondGeometry, bondMaterial, this.bonds.length);
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

                if (this.display == 'vesta' && this.bondmesh.setColorAt && bondColors[i]) {
                    this.bondmesh.setColorAt(
                        i,
                        new THREE.Color(bondColors[i][0], bondColors[i][1], bondColors[i][2])
                    );
                }
            }

            this.bondmesh.instanceMatrix.needsUpdate = true;
            if (this.display == 'vesta' && this.bondmesh.instanceColor) {
                this.bondmesh.instanceColor.needsUpdate = true;
            }
            this.scene.add(this.bondmesh);
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

        //check if it is initialized
        if (!this.initialized) {
            this.init(phononweb)
            this.initialized = true;
        }

        this.updatelocal();
    }

    updatelocal() {
        this.removeStructure();
        this.addLights();
        this.getAtypes(this.phonon.atom_numbers);
        this.addStructure(this.atoms,this.phonon.atom_numbers);
        this.addCell(this.phonon.lat);
        this.adjustCovalentRadiiSelect();
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
                this.instanceDummy.position.copy(bonddata.midpoint);
                this.instanceDummy.quaternion.copy(bonddata.quaternion);
                this.instanceDummy.scale.set(1, bond.a.distanceTo(bond.b), 1);
                this.instanceDummy.updateMatrix();
                this.bondmesh.setMatrixAt(i, this.instanceDummy.matrix);
            }

            for (let i=0; i<this.atommeshes.length; i++) {
                this.atommeshes[i].instanceMatrix.needsUpdate = true;
            }
            if (this.bondmesh) {
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
