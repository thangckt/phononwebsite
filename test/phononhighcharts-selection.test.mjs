import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PhononHighcharts } from '../src/phononhighcharts.js';

describe('PhononHighcharts selection sync', () => {
  it('selects points using bandIndex metadata instead of series name', () => {
    const chartHelper = new PhononHighcharts(null);
    let deselected = false;
    let selected = false;
    const previousPoint = {
      select(value) {
        if (value === false) {
          deselected = true;
        }
      },
    };
    const targetPoint = {
      x: 1.25,
      select(value) {
        if (value === true) {
          selected = true;
        }
      },
    };

    chartHelper.selectedPoint = previousPoint;
    chartHelper.selectedBandIndex = 0;
    chartHelper.selectedX = 0.0;
    chartHelper.chart = {
      series: [
        {
          name: 'custom-label',
          options: {
            bandIndex: 4,
          },
          points: [targetPoint],
        },
      ],
    };

    chartHelper.selectModePoint({ distances: [1.25] }, 0, 4);

    assert.equal(deselected, true);
    assert.equal(selected, true);
    assert.equal(chartHelper.selectedPoint, targetPoint);
    assert.equal(chartHelper.selectedBandIndex, 4);
    assert.equal(chartHelper.selectedX, 1.25);
  });
});
