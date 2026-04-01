export class LocalPhononDB {
    /*
    Interact with locally generated PhononDB materials stored in data/phonondb2017.
    The visible list comes from the historical PhononDB 2018 catalog, but only
    entries with locally generated files are exposed in the menu.
    */

    constructor() {
        this.name = "phonondb";
        this.author = "A. Togo";
        this.year = 2018;
        this.url = "https://github.com/atztogo/phonondb";
        this.catalog = "phonondb2018/phonondb.json";
        this.generated = "data/phonondb2017/models.json";
        this.root = "data/phonondb2017";
    }

    get_materials(callback) {
        let reference = this.author + ", " + "<a href=" + this.url + ">" + this.name + "</a> (" + this.year + ")";
        let name = this.name;
        let root = this.root;
        let generated = this.generated;
        let finishEmpty = function() {
            callback([]);
        };

        function dothings(catalog) {
            let request;
            try {
                request = $.get(generated, function(localEntries) {
                let localById = {};
                for (let i = 0; i < localEntries.length; i++) {
                    let entry = localEntries[i];
                    if (typeof entry === "string") {
                        localById[String(entry)] = {
                            id: String(entry),
                            file: entry + ".json.gz"
                        };
                    } else if (entry && entry.id != null) {
                        let id = String(entry.id);
                        localById[id] = Object.assign({
                            id: id,
                            file: entry.file || (id + ".json.gz")
                        }, entry);
                    }
                }

                let materials = [];
                for (let i = 0; i < catalog.length; i++) {
                    let catalogEntry = catalog[i];
                    let localEntry = localById[String(catalogEntry.id)];
                    if (!localEntry) {
                        continue;
                    }

                    let m = Object.assign({}, catalogEntry, localEntry);
                    m.source = name;
                    m.type = "json";
                    m.reference = reference;
                    m.url = root + "/" + m.file;
                    m.link = catalogEntry.url || m.link || ("https://materialsproject.org/materials/mp-" + m.id);
                    materials.push(m);
                }

                callback(materials);
                });
            } catch (error) {
                finishEmpty();
                return;
            }

            if (request && typeof request.fail === "function") {
                request.fail(function() {
                    finishEmpty();
                });
            }
        }

        let request;
        try {
            request = $.get(this.catalog, dothings);
        } catch (error) {
            finishEmpty();
            return;
        }

        if (request && typeof request.fail === "function") {
            request.fail(function() {
                finishEmpty();
            });
        }
    }
}
