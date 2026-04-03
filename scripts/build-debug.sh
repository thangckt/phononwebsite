#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 python/phononweb/scripts/render_homepage.py

rm -rf build
mkdir -p build

rollup -c

cp -r figures css libs data phonondb2018 README.md index.html phonon.html exciton.html structure.html favicon.svg favicon.ico build/
rm -f build/data/phonondb2017/.gitignore
cp build/main.js build/main.min.js
cp build/exciton.js build/exciton.min.js
cp build/structure.js build/structure.min.js
