
export class PhononHighcharts {

    constructor(container) {
        this.container = container;
        this.phonon = { highsym_qpts: [] };
        this.highcharts = [];
        this.showModeWeights = false;
        this.atomTypeLegend = [];
        this.getAtomColorHex = null;
        this.getAtomLabel = null;
        this.weightLineWidthMin = 1.5;
        this.weightLineWidthScale = 8.0;
        this.legendVisibility = {};
        this.currentOptions = {};

        let phonon = this.phonon;

        this.labels_formatter = function(phonon) {
            return function() {
                if ( phonon.highsym_qpts[this.value] ) {
                    let label = phonon.highsym_qpts[this.value];
                    label = label.replace("$","").replace("$","");
                    label = label.replace("\\Gamma","Γ");
                    label = label.replace("GAMMA","Γ");
                    label = label.replace("DELTA","Δ");
                    label = label.replace("\\Sigma","Σ");
                    label = label.replace("_","");
                    return label;
                }
                return ''
            }
        }

        this.HighchartsOptions = {
            chart: { type: 'line',
                     zoomType: 'xy' },
            accessibility: { enabled: false },
            title: { text: null },
            xAxis: { plotLines: [],
                     lineWidth: 0,
                     minorGridLineWidth: 0,
                     lineColor: 'transparent',
                     minorTickLength: 0,
                     tickLength: 0,
                     labels: {
                        style: { fontSize:'20px' }
                     }
                   },
            yAxis: { title: { text: 'Frequency (cm<sup>-1</sup>)' },
                     plotLines: [ {value: 0, color: '#000000', width: 2} ]
                   },
            tooltip: { formatter: function(x) { return Math.round(this.y*100)/100+' cm<sup>-1</sup>' } },
            legend: {
                enabled: false,
                floating: true,
                layout: 'horizontal',
                align: 'center',
                verticalAlign: 'top',
                y: 8,
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderWidth: 0,
                itemStyle: { fontWeight: 'normal' },
                symbolRadius: 0
            },
            series: [],
            plotOptions: { line:   { animation: false },
                           series: { allowPointSelect: true,
                                     marker: { states: { select: { fillColor: 'red',
                                                                   radius: 5,
                                                                   lineWidth: 0 }
                                                       }
                                             },
                                     cursor: 'pointer',
                                     point: { events: { } }
                                   }
                         }
        };
        this.HighchartsOptions.__phononHighcharts = this;
    }

    setClickEvent( phononweb ) {
        let click_event = function () {
            if (this.series.options.isLegendSeries || this.series.options.isWeightSeries) { return; }
            let k = phononweb.phonon.qindex[this.x];
            let n = this.series.options.bandIndex;
            if (!Number.isFinite(n)) {
                n = Number(this.series.name);
            }
            phononweb.selectModeByBandIndex(k, n, false);
        }
        this.HighchartsOptions.plotOptions.series.point.events.click = click_event
    }

    selectModePoint(phonon, k, n) {
        if (!this.chart || !this.chart.series || !phonon || !phonon.distances) { return; }
        let targetX = phonon.distances[k];
        if (!Number.isFinite(targetX)) { return; }

        for (let i=0; i<this.chart.series.length; i++) {
            let series = this.chart.series[i];
            for (let j=0; j<series.points.length; j++) {
                let point = series.points[j];
                point.select(false, false);
            }
        }

        for (let i=0; i<this.chart.series.length; i++) {
            let series = this.chart.series[i];
            if (String(series.name) !== String(n)) { continue; }
            for (let j=0; j<series.points.length; j++) {
                let point = series.points[j];
                if (Math.abs(point.x - targetX) < 1e-12) {
                    point.select(true, false);
                    return;
                }
            }
        }
    }

    setModeWeightsOptions(options = {}) {
        this.currentOptions = options;
        this.showModeWeights = !!options.enabled;
        this.getAtomColorHex = typeof options.getAtomColorHex === 'function' ? options.getAtomColorHex : null;
        this.getAtomLabel = typeof options.getAtomLabel === 'function' ? options.getAtomLabel : null;
    }

    resetLegendVisibility() {
        this.legendVisibility = {};
        for (let i = 0; i < this.atomTypeLegend.length; i++) {
            this.legendVisibility[this.atomTypeLegend[i].atomNumber] = true;
        }
    }

    ensureAtomTypeWeights(phonon) {
        if (!phonon || !phonon.vec || !phonon.atom_numbers) {
            return { atomNumbers: [], weights: [] };
        }
        if (phonon.atomTypeWeightsCache) {
            return phonon.atomTypeWeightsCache;
        }

        let uniqueAtomNumbers = [];
        let atomTypeIndex = {};
        for (let i = 0; i < phonon.atom_numbers.length; i++) {
            let atomNumber = phonon.atom_numbers[i];
            if (!(atomNumber in atomTypeIndex)) {
                atomTypeIndex[atomNumber] = uniqueAtomNumbers.length;
                uniqueAtomNumbers.push(atomNumber);
            }
        }

        let weights = [];
        for (let k = 0; k < phonon.vec.length; k++) {
            let qpointWeights = [];
            for (let n = 0; n < phonon.vec[k].length; n++) {
                let mode = phonon.vec[k][n];
                let totals = new Array(uniqueAtomNumbers.length).fill(0);
                let totalWeight = 0;

                for (let atomIndex = 0; atomIndex < mode.length; atomIndex++) {
                    let components = mode[atomIndex];
                    let atomWeight = 0;
                    for (let axis = 0; axis < components.length; axis++) {
                        let component = components[axis];
                        let re = component[0];
                        let im = component[1];
                        atomWeight += re * re + im * im;
                    }
                    let typeIndex = atomTypeIndex[phonon.atom_numbers[atomIndex]];
                    totals[typeIndex] += atomWeight;
                    totalWeight += atomWeight;
                }

                if (totalWeight > 0) {
                    for (let i = 0; i < totals.length; i++) {
                        totals[i] /= totalWeight;
                    }
                }
                qpointWeights.push(totals);
            }
            weights.push(qpointWeights);
        }

        phonon.atomTypeWeightsCache = {
            atomNumbers: uniqueAtomNumbers,
            weights: weights
        };
        return phonon.atomTypeWeightsCache;
    }

    getAtomTypeLegend(phonon) {
        let cache = this.ensureAtomTypeWeights(phonon);
        return cache.atomNumbers.map((atomNumber) => ({
            atomNumber: atomNumber,
            label: this.getAtomLabel ? this.getAtomLabel(atomNumber) : String(atomNumber),
            color: this.getAtomColorHex ? ('#' + Number(this.getAtomColorHex(atomNumber)).toString(16).padStart(6, '0')) : '#0066FF'
        }));
    }

    reflow() {
        if (this.chart && this.chart.reflow) {
            this.chart.reflow();
        }
    }

    handleLegendToggle(atomNumber) {
        if (!this.phonon || !this.chart) {
            return false;
        }

        this.legendVisibility[atomNumber] = this.legendVisibility[atomNumber] === false;
        this.updateWeightedSeriesStyles();
        this.applyLegendStyles();
        return false;
    }

    applyLegendStyles() {
        if (!this.chart || !this.chart.legend || !this.chart.legend.allItems) {
            return;
        }

        for (let i = 0; i < this.chart.legend.allItems.length; i++) {
            let item = this.chart.legend.allItems[i];
            if (!item || !item.options || !item.options.isLegendSeries || !item.legendItem) {
                continue;
            }

            let atomNumber = item.options.atomNumber;
            item.legendItem.css({
                textDecoration: this.legendVisibility[atomNumber] === false ? 'line-through' : 'none',
                opacity: this.legendVisibility[atomNumber] === false ? 0.65 : 1
            });
        }
    }

    getVisibleAtomTypeIndices() {
        let visible = [];
        for (let i = 0; i < this.atomTypeLegend.length; i++) {
            let atomNumber = this.atomTypeLegend[i].atomNumber;
            let isVisible = this.legendVisibility[atomNumber] !== false;
            if (isVisible) {
                visible.push(i);
            }
        }
        return visible;
    }

    getWeightedColorForIndices(atomIndices, weights) {
        let total = 0;
        let red = 0;
        let green = 0;
        let blue = 0;

        for (let i = 0; i < atomIndices.length; i++) {
            let index = atomIndices[i];
            let weight = weights[index];
            let color = this.getAtomColorHex
                ? this.getAtomColorHex(this.atomTypeLegend[index].atomNumber)
                : 0x0066ff;
            let r = (color >> 16) & 255;
            let g = (color >> 8) & 255;
            let b = color & 255;
            red += r * weight;
            green += g * weight;
            blue += b * weight;
            total += weight;
        }

        if (total <= 0) {
            let fallback = this.getAtomColorHex
                ? this.getAtomColorHex(this.atomTypeLegend[atomIndices[0]].atomNumber)
                : 0x0066ff;
            return '#' + Number(fallback).toString(16).padStart(6, '0');
        }

        red = Math.round(red / total);
        green = Math.round(green / total);
        blue = Math.round(blue / total);
        return '#' + ((red << 16) | (green << 8) | blue).toString(16).padStart(6, '0');
    }

    updateWeightedSeriesStyles() {
        if (!this.chart || !this.phonon || !this.showModeWeights) {
            return;
        }

        let weightCache = this.ensureAtomTypeWeights(this.phonon);
        let visibleTypeIndices = this.getVisibleAtomTypeIndices();
        let singleVisibleType = visibleTypeIndices.length === 1 ? visibleTypeIndices[0] : null;

        for (let i = 0; i < this.chart.series.length; i++) {
            let series = this.chart.series[i];
            if (!series.options.isWeightSeries) {
                continue;
            }

            let bandIndex = series.options.bandIndex;
            let segmentStartK = series.options.segmentStartK;
            if (!Number.isFinite(bandIndex) || !Number.isFinite(segmentStartK)) {
                continue;
            }

            let visible = visibleTypeIndices.length > 0;
            let color = '#0066ff';
            let lineWidth = this.weightLineWidthMin + this.weightLineWidthScale;

            if (visible) {
                let weights0 = weightCache.weights[segmentStartK][bandIndex];
                let weights1 = weightCache.weights[segmentStartK + 1][bandIndex];
                let avgWeights = weights0.map((value, index) => (value + weights1[index]) / 2);
                color = this.getWeightedColorForIndices(visibleTypeIndices, avgWeights);

                if (singleVisibleType !== null) {
                    lineWidth = this.weightLineWidthMin + avgWeights[singleVisibleType] * this.weightLineWidthScale;
                    color = '#' + Number(this.getAtomColorHex(this.atomTypeLegend[singleVisibleType].atomNumber)).toString(16).padStart(6, '0');
                }
            }

            series.update({
                visible: visible,
                color: color,
                lineWidth: lineWidth
            }, false);
        }

        this.chart.redraw(false);
    }

    update(phonon, options = {}) {
        /*
        update phonon dispersion plot
        */

        this.phonon = phonon;
        this.setModeWeightsOptions(options);
        this.atomTypeLegend = this.getAtomTypeLegend(phonon);
        if (options.resetLegendVisibility) {
            this.resetLegendVisibility();
        }

        //set the minimum of the plot with the smallest phonon frequency
        let minVal = 0;
        for (let i=0; i<phonon.eigenvalues.length; i++) {
            let min = Math.min.apply(null, phonon.eigenvalues[i])
            if ( minVal > min ) {
                minVal = min;
            }
        }
        if (minVal > -1) minVal = 0;


        //get positions of high symmetry qpoints
        let ticks = Object.keys(phonon.highsym_qpts)
            .map((k) => Number(k))
            .filter((k) => Number.isFinite(k))
            .sort((a, b) => a - b);

        //get the high symmetry qpoints for highcharts
        let plotLines = []
        for (let i=0; i<ticks.length ; i++ ) {
            plotLines.push({ value: ticks[i],
                             color: '#555555',
                             width: 1,
                             zIndex: 6 })
        }

        //actually set the eigenvalues
        this.getGraph(phonon);

        this.HighchartsOptions.series = this.highcharts;
        this.HighchartsOptions.legend.enabled = this.showModeWeights && this.atomTypeLegend.length > 0;
        this.HighchartsOptions.xAxis.tickPositions = ticks;
        this.HighchartsOptions.xAxis.plotLines = plotLines;
        this.HighchartsOptions.xAxis.labels.formatter = this.labels_formatter(phonon)
        this.HighchartsOptions.yAxis.min = minVal;
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
        this.chart = globalThis.Highcharts.chart(this.container[0], this.HighchartsOptions);
        this.applyLegendStyles();
    }

    getGraph(phonon) {
        /*
        From a phonon object containing:
            distances : distance between the k-points
            eigenvalues : eigenvalues
        put the data in the highcharts format
        */

        let eival = phonon.eigenvalues;
        let dists = phonon.distances;
        let line_breaks = phonon.line_breaks;

        let nbands = eival[0].length;
        this.highcharts = [];
        let weightCache = this.ensureAtomTypeWeights(phonon);
        let baseColor = this.showModeWeights ? '#94a3b8' : '#0066FF';
        let visibleTypeIndices = this.getVisibleAtomTypeIndices();
        let singleVisibleType = visibleTypeIndices.length === 1 ? visibleTypeIndices[0] : null;

        //go through the eigenvalues and create eival list
        for (let n=0; n<nbands; n++) {
            //iterate over the line breaks
            for (let i=0; i<line_breaks.length; i++) {
                let startk = line_breaks[i][0];
                let endk = line_breaks[i][1];

                let eig = [];

                //iterate over the q-points
                for (let k=startk; k<endk; k++) {
                    eig.push([dists[k],eival[k][n]]);
                }

                //add data
                this.highcharts.push({
                    name:  n+"",
                    bandIndex: n,
                    color: baseColor,
                    lineWidth: this.showModeWeights ? 0.8 : 2,
                    zIndex: 5,
                    showInLegend: false,
                    marker: { radius: 1, symbol: "circle"},
                    data: eig
                   });

                if (this.showModeWeights) {
                    for (let k=startk; k<endk - 1; k++) {
                        if (!visibleTypeIndices.length) {
                            continue;
                        }

                        let weights0 = weightCache.weights[k][n];
                        let weights1 = weightCache.weights[k + 1][n];
                        let avgWeights = weights0.map((value, index) => (value + weights1[index]) / 2);
                        let lineWidth = this.weightLineWidthMin + this.weightLineWidthScale;
                        let color = this.getWeightedColorForIndices(visibleTypeIndices, avgWeights);

                        if (singleVisibleType !== null) {
                            lineWidth = this.weightLineWidthMin + avgWeights[singleVisibleType] * this.weightLineWidthScale;
                            color = '#' + Number(this.getAtomColorHex(this.atomTypeLegend[singleVisibleType].atomNumber)).toString(16).padStart(6, '0');
                        }

                        this.highcharts.push({
                            name: 'weights',
                            isWeightSeries: true,
                            bandIndex: n,
                            segmentStartK: k,
                            color: color,
                            lineWidth: lineWidth,
                            zIndex: 3,
                            enableMouseTracking: false,
                            showInLegend: false,
                            states: { inactive: { opacity: 1 } },
                            marker: { enabled: false },
                            data: [
                                [dists[k], eival[k][n]],
                                [dists[k + 1], eival[k + 1][n]]
                            ]
                        });
                    }
                }
            }
        }

        if (this.showModeWeights) {
            for (let i = 0; i < this.atomTypeLegend.length; i++) {
                let atomType = this.atomTypeLegend[i];
                if (!(atomType.atomNumber in this.legendVisibility)) {
                    this.legendVisibility[atomType.atomNumber] = true;
                }
                this.highcharts.push({
                    id: 'legend-' + atomType.atomNumber,
                    name: atomType.label,
                    atomNumber: atomType.atomNumber,
                    isLegendSeries: true,
                    color: atomType.color,
                    data: [],
                    enableMouseTracking: false,
                    showInLegend: true,
                    lineWidth: 8,
                    marker: { enabled: false },
                    states: { inactive: { opacity: 1 } },
                    events: {
                        legendItemClick: function() {
                            return this.chart.userOptions.__phononHighcharts.handleLegendToggle(atomType.atomNumber);
                        }
                    }
                });
            }
        }
    }
}
