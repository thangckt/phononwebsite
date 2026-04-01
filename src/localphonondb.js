export class LocalPhononDB {
    /*
    Interact with locally generated PhononDB materials stored in data/phonondb2017.
    */

    constructor() {
        this.name = "phonondb";
        this.author = "A. Togo";
        this.year = 2017;
        this.url = "https://github.com/atztogo/phonondb";
        this.list = "data/phonondb2017/models.json";
        this.root = "data/phonondb2017";
    }

    get_materials(callback) {
        let reference = this.author + ", " + "<a href=" + this.url + ">" + this.name + "</a> (" + this.year + ")";
        let name = this.name;
        let root = this.root;

        function dothings(materials) {
            for (let i = 0; i < materials.length; i++) {
                let m = materials[i];
                m.source = name;
                m.type = "json";
                m.reference = reference;
                m.url = root + "/" + m.file;
            }
            callback(materials);
        }

        $.get(this.list, dothings);
    }
}
