Phonon website
==============

#### Visualize phonon vibrational modes

This project aims to provide a simple way to visualize the lattice vibrations of different materials.
The temperature of a material is related to the agitation of its atoms.
The atoms can move in any of the three cartesian directions.
Combining the different possible ways the atoms can vibrate we obtain the eigenvectors.
Each mode has associated a frequency of vibration that is related with the forces between the atoms.

How to use?
===========

In the phonon section you can click on any point in the phonon dispersion and see an animation of how the atoms vibrate according to that particular mode.
By default you can visualize the phonon dispersion of a few selected materials we calculated plus the ones calculated by A. Togo for [phonodb](http://phonondb.mtl.kyoto-u.ac.jp/).
If you want to see your own calculations, we currently support phonon calculations from `Abinit`, `Quantum Espresso` and `phononpy`.

phonopy
-------
You can visualize your own `phonopy` files by clicking on the `Choose files` button and selecting a `band.yaml` file. The following options should be present in the `band.conf` file:

    EIGENVECTORS = .TRUE.
    BAND_CONNECTION = .TRUE.
    BAND_LABELS = Gamma M K
    BAND = (x1,y1,z1) (x2,y2,z2) (x3,y3,z3)

This only works with the newer versions of phonopy as new tags were added to 'band.yaml' to have information about the atomic positions and the supercell.

Preparing PhononDB archives
---------------------------
The repository also ships a permanent conversion script for raw PhononDB-style `tar.lzma` archives containing `phonon.yaml` and `FORCE_SETS`. It generates the same compressed `.json.gz` format used for the Materials Project OpenData files and the internal browser loader.

After installing the Python package:

    $ pip install -e ./python

You can convert one archive or a full directory with:

    $ prepare_phonondb /path/to/phonondb2017 --output-dir data/phonondb2017 --band-points 15

or directly from the repository checkout with:

    $ python3 python/phononweb/scripts/prepare_phonondb.py /path/to/phonondb2017 --output-dir data/phonondb2017 --band-points 15

There is also an npm wrapper for local use. This writes the generated files into `data/phonondb2017`, updates `data/phonondb2017/models.json`, and makes the converted materials appear in the website menu:

    $ npm run prepare:phonondb:local -- /path/to/phonondb2017 --limit 10

The local npm command is resumable by default and skips archives whose `.json.gz` output already exists.

You can also use the generic passthrough command if you want full control over the output location:

    $ npm run prepare:phonondb -- /path/to/phonondb2017 --output-dir data/phonondb2017 --manifest data/phonondb2017/models.json --band-points 15 --limit 10

To control parallelism, pass `--jobs`:

    $ npm run prepare:phonondb:local -- /path/to/phonondb2017 --limit 10 --jobs 4

The converter uses a seekpath high-symmetry path with:

    BAND_CONNECTION = .TRUE.

and a fixed number of q-points per segment to keep the generated files reasonably small.

Abinit
------
To read a phonon dispersion from `Abinit` you need python scripts to convert the phonon dispersion data to the internal `.json` format used by the website.

The recommended way to do so is to use [abipy](https://github.com/abinit/abipy).
Once you have generated a `DDB` file, you can create a JSON file with:

    $ abiopen.py mp-149_DDB

    In [1]: phbst, phdos = abifile.anaget_phbst_and_phdos_files()
    In [2]: phbst.phbands.view_phononwebsite()

If you already have a PHBST.nc netcdf file produced by anaddb you can visualize it with:

    $ abiview.py phbands example_PHBST.nc -web

Alternatively you can use the scripts provided in the [Github](https://github.com/henriquemiranda/phononwebsite/) page. To install them just do:

    $ pip install -e ./python

In the folder where you ran `anaddb` you will find a netCDF file (if you compiled `Abinit` with netCDF support) with the name `anaddb.out_PHBST.nc`. To convert it to `.json` format just run:

    $ read_anaddb_phonon.py anaddb.out_PHBST.nc <name_of_your_material>

You can then select the resulting `.json` file with the `Choose files` button on the `phononwebsite`.

Quantum Espresso
----------------
To read a Quantum Espresso calculation you need two files `<prefix>.scf` and `<prefix>.modes`.
The first one is the input file for `pw.x` the second one can be generated with `dynmat.x`.
The file that should be used is the one set with the `'filout'` tag in the dynmat input file as in it the modes are normalized with the atomic masses.
After installing the python scripts (same as in the case of an `Abinit` calculation) you can obtain the `.json` files:

    $ read_qe_phonon.py prefix <name_of_your_material>

You can then select the resulting `.json` file with the `Choose files` button.

VASP
----------
To read a VASP calculation you need the `vaspout.h5` file containing a phonon dispersion calculation.
You can find the instructions of how to compute the phonon dispersion from a supercell calculation in the [VASP wiki](https://www.vasp.at/wiki/index.php/Computing_the_phonon_dispersion_and_DOS)

    $ read_vasp_phonon.py vaspout.h5 <name_of_your_material>

You can then select the resulting `.json` file with the `Choose files` button.

Pages using this visualization tool
========================================

This visualization tool is currently being used in other websites:

- <https://materialsproject.org/>
- <https://www.materialscloud.org/>

Features
========
You can export a animated `.gif` with a particular mode using the `gif` button in the Export movie section.

If you want to share your own data with someone else you can add to the url tags with the following format:

    http://henriquemiranda.github.io/phononwebsite/phonon.html?tag1=a&tag2=b

The available tags are:

    json = link to a json file
    yaml = link to a yaml file
    name = name of the material

Here are some examples of what can be added to the website link:

  - [?yaml=http://henriquemiranda.github.io/phononwebsite/test/fixtures/phonopy/band.yaml](http://henriquemiranda.github.io/phononwebsite/phonon.html?yaml=http://henriquemiranda.github.io/phononwebsite/test/fixtures/phonopy/band.yaml)
  - [?json=http://henriquemiranda.github.io/phononwebsite/data/localdb/graphene/data.json](http://henriquemiranda.github.io/phononwebsite/phonon.html?json=http://henriquemiranda.github.io/phononwebsite/data/localdb/graphene/data.json)

You are free to use all the images generated with this website in your publications and presentations as long as you cite this work (a link to the website is enough). For the license terms of the data from [phonodb](http://phonondb.mtl.kyoto-u.ac.jp/) please refer to their website.

In polar materials the LO-TO splitting is missing in the phonodb.

Modify the website
===================

Repository layout
-----------------

Main directories and what they are for:

- `src/`: JavaScript source code (rendering, UI wiring, parsers, utilities).
- `src/static_libs/`: vendored browser-side helper libs used by source modules.
- `css/`: stylesheets for website pages.
- `python/`: Python package (`phononweb`) and Python tests.
- `test/`: JavaScript tests and shared test fixtures.
- `build/`: generated output for deployment (`npm run build:site`).
- `data/localdb/`, `data/contribdb/`, `data/mpdb/`: data sources consumed by the website.
- `.github/workflows/`: CI/deploy workflows.

Naming and placement conventions:

- Add new browser app code under `src/`.
- Keep legacy/static vendored browser libs in `src/static_libs/` (ES module friendly) or `libs/` when required by external runtime tools.
- Add new JS tests as `*.test.mjs` in `test/`.
- Put reusable test sample data under `test/fixtures/`.
- Put Python tests under `python/phononweb/tests/`.
- Do not commit generated artifacts except expected deploy output under `build/` when explicitly needed by workflow.

**Change the colors**

The default colors of the atoms are the same ones used in [jmol](http://jmol.sourceforge.net/).
Currently we don't provide a web interface to change them.
If you still would like to change the colors, you can checkout locally the git repository from [Github](https://github.com/henriquemiranda/phononwebsite/).
The colors of the atoms can be changed in `src/atomic_data.js`.
The colors of the bonds and arrows can be changed in `vibcrystal.js` in the variables `this.arrowcolor` and `this.bondscolor` respectively.

**Compile and run locally**

Install dependencies:

    npm install

Build a local/debug site bundle:

    npm run build

Build deployable website into `build/`:

    npm run build:site

Regenerate just the homepage (`index.html`) from `README.md` using the template in `ref_index.html`:

    npm run generate:index

Run JavaScript tests:

    npm test

Run Python tests:

    npm run test:py

Run a local HTTP server (from repo root) and open:
<http://localhost:8000/phonon.html>

    python3 -m http.server

File Format
=================
Here you can find a short description of the internal .json format used to show the
phonon dispersions and animations on the website.

    name:             name of the material that will be displayed on the website (string)
    natoms:           number of atoms (integer)
    lattice:          lattice vectors (3x3 float array)
    atom_types:       atom type   for each atom in the system (array strings)
    atom_numbers:     atom number for each atom in the system (array integers)
    formula:          chemical formula (string)
    repetitions:      default value for the repetititions (array 3 integers)
    atom_pos_car:     atomic positions in cartesian coordinates (Nx3 float array)
    atom_pos_red:     atomic positions in reduced coordinates (Nx3 float array)
    highsym_qpts:     list of high symmetry qpoints (Nx3 float arraay)
    qpoints:          list of q-point in the reciprocal space (Nx3 float array)
    distances:        list distances between the qpoints (Nq float array)
    eigenvalues:      eigenvalues in units of cm-1 (Nqx(N\*3))
    vectors:          eigenvectors (NqxN)
    line_breaks:      list of tuples with start and end of each segment (Optional)

Authors
=======

This project is the continuation of the work of Raoul Weber during an internship in the University of Luxembourg for 2 months in the Theoretical Solid State Physics group under the supervision of Ludger Wirtz and technical help from me.

I decided to continue the project by optimizing the implementation, cleaning up the design and replacing JSmol by a self made applet using Three.js and WebGL called VibCrystal.
Currently the website works also as a web application which means the user can visualize his own calculations made with `phonopy`.

My personal webpage:  
<http://henriquemiranda.github.io>

Contact me:  
miranda.henrique at gmail.com

Aknowledgments & Funding
==========================
[Ludger Wirtz](http://wwwen.uni.lu/recherche/fstc/physics_and_materials_science_research_unit/research_areas/theoretical_solid_state_physics) for the original idea and important scientific advices.
[Atsushi Togo](http://atztogo.github.io) the creator of [phonopy](http://atztogo.github.io/phonopy/) for providing phonon dispersion data from his [phonodb](http://phonondb.mtl.kyoto-u.ac.jp/) phonon database.
[José Pedro Silva](http://jpsfs.com/) for very helpful advices on technical issues and the best web technologies to use.
[Guido Petreto](https://scholar.google.com/citations?user=EaD98BIAAAAJ&hl=en) and [Matteo Giantomassi](https://scholar.google.be/citations?user=kW8FQgkAAAAJ&hl=en) for many insightful comments, debugging, feature suggestions and the interface with [abipy](https://github.com/abinit/abipy).
[Nikolas Garofil](mailto:nikolas.garofil@uantwerpen.be) and [Annelinde Strobbe](mailto:annelinde.strobbe@uantwerpen.be) from the for the implementation of the Vesta mode.
[José María Castelo](https://github.com/jmcastelo) for adding the possibility to change the covalent radii of the atomic species which is used to draw the bonds between the atoms.

VASP Software GmbH (2019-present): <http://www.vasp.at>

<img src="figures/vasp.png" width="150px">

Fonds National de la Recherche Scientifique (2017-2019): <http://www.fnrs.be/>

<img src="figures/fnrs.png" width="150px">

Université Catholique de Louvain (2017-2019): <https://uclouvain.be>

<img src="figures/ucl.jpg" width="150px">

Fonds National de la Recherche Luxembourg (2013-2017): <http://www.fnr.lu/>

<img src="figures/fnr.jpg" width="300px">

University of Luxembourg (2013-2017): <http://wwwen.uni.lu/>

<img src="figures/unilu.png" width="150px">

Contribute
==========
The project is under development!

For repository organization and contribution conventions, see:
`doc/CONTRIBUTING.md`

You can leave your suggestions and feature requests here:  
<https://github.com/henriquemiranda/phononwebsite/issues>

If you would like to see some of your calculations published on this website please contact me.

Software used for this project
==============================

- WebGL visualization using `Three.js`: <http://threejs.org/>
- phonon dispersion using `highcharts`: <http://www.highcharts.com/>
- export animation using `CCapture.js`: <https://github.com/spite/ccapture.js>
- gif animation is uses `gif.js`: <http://jnordberg.github.io/gif.js/>
- `Abinit`: <http://www.abinit.org/>
- `Abipy`: <https://github.com/abinit/abipy>
- `Quantum Espresso`: <http://www.quantum-espresso.org/>
- `phonopy`: <http://atztogo.github.io/phonopy/>
- `VASP`: <http://www.vasp.at>
