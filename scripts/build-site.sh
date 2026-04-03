#!/bin/sh
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 python/phononweb/scripts/render_homepage.py

rm -rf build
mkdir -p build/test

rollup -c

terser build/main.js -c -m --source-map "content=build/main.js.map,url=main.min.js.map" -o build/main.min.js
terser build/exciton.js -c -m --source-map "content=build/exciton.js.map,url=exciton.min.js.map" -o build/exciton.min.js
terser build/structure.js -c -m --source-map "content=build/structure.js.map,url=structure.min.js.map" -o build/structure.min.js

cp -r figures css libs data phonondb2018 README.md index.html phonon.html exciton.html structure.html favicon.svg favicon.ico build/
rm -f build/data/phonondb2017/.gitignore
cp -r test/fixtures build/test/

test -f build/main.min.js
test -f build/exciton.min.js
test -f build/structure.min.js
