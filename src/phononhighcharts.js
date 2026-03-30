
export class PhononHighcharts {

    constructor(container) {

        this.container = container;

        this.phonon = { highsym_qpts: [] }
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
            title: { text: 'Phonon dispersion' },
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
            legend: { enabled: false },
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
    }

    setClickEvent( phononweb ) {
        let click_event = function () {
            let k = phononweb.phonon.qindex[this.x];
            let n = this.series.name;
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

    update(phonon) {
        /*
        update phonon dispersion plot
        */

        this.phonon = phonon;

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
        this.HighchartsOptions.xAxis.tickPositions = ticks;
        this.HighchartsOptions.xAxis.plotLines = plotLines;
        this.HighchartsOptions.xAxis.labels.formatter = this.labels_formatter(phonon)
        this.HighchartsOptions.yAxis.min = minVal;
        this.chart = globalThis.Highcharts.chart(this.container[0], this.HighchartsOptions);
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
                    color: "#0066FF",
                    marker: { radius: 1, symbol: "circle"},
                    data: eig
                   });
            }
        }
    }
}
