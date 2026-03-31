import * as THREE from 'three';

import { edgeTable, triTable } from './static_libs/MarchingCubesData.js';

function getWrappedIndexAndShift(index, size) {
    if (size <= 0) {
        return { index: 0, shift: 0 };
    }
    const shift = Math.floor(index / size);
    const wrappedIndex = ((index % size) + size) % size;
    return { index: wrappedIndex, shift };
}

function getGridValue(values, x, y, z, sizex, sizey, sizez, size2, periodic) {
    if (!periodic) {
        return values[x + sizex * y + size2 * z];
    }

    const wx = getWrappedIndexAndShift(x, sizex);
    const wy = getWrappedIndexAndShift(y, sizey);
    const wz = getWrappedIndexAndShift(z, sizez);
    return values[wx.index + sizex * wy.index + size2 * wz.index];
}

function getGridPointCoords(target, x, y, z, sizex, sizey, sizez, periodic, gridCell) {
    if (!periodic) {
        const fx = sizex > 1 ? x / (sizex - 1) : 0;
        const fy = sizey > 1 ? y / (sizey - 1) : 0;
        const fz = sizez > 1 ? z / (sizez - 1) : 0;
        target[0] = fx * gridCell[0][0] + fy * gridCell[1][0] + fz * gridCell[2][0];
        target[1] = fx * gridCell[0][1] + fy * gridCell[1][1] + fz * gridCell[2][1];
        target[2] = fx * gridCell[0][2] + fy * gridCell[1][2] + fz * gridCell[2][2];
        return;
    }

    const wx = getWrappedIndexAndShift(x, sizex);
    const wy = getWrappedIndexAndShift(y, sizey);
    const wz = getWrappedIndexAndShift(z, sizez);
    const fx = wx.index / sizex + wx.shift;
    const fy = wy.index / sizey + wy.shift;
    const fz = wz.index / sizez + wz.shift;
    target[0] = fx * gridCell[0][0] + fy * gridCell[1][0] + fz * gridCell[2][0];
    target[1] = fx * gridCell[0][1] + fy * gridCell[1][1] + fz * gridCell[2][1];
    target[2] = fx * gridCell[0][2] + fy * gridCell[1][2] + fz * gridCell[2][2];
}

function interpolateVertex(target, pointA, pointB, valueA, valueB, isolevel) {
    const delta = valueB - valueA;
    const mu = delta === 0 ? 0.5 : (isolevel - valueA) / delta;
    target[0] = pointA[0] + (pointB[0] - pointA[0]) * mu;
    target[1] = pointA[1] + (pointB[1] - pointA[1]) * mu;
    target[2] = pointA[2] + (pointB[2] - pointA[2]) * mu;
}

function pushTriangle(positions, normals, vertex1, vertex2, vertex3) {
    positions.push(
        vertex1[0], vertex1[1], vertex1[2],
        vertex2[0], vertex2[1], vertex2[2],
        vertex3[0], vertex3[1], vertex3[2],
    );

    const abx = vertex2[0] - vertex1[0];
    const aby = vertex2[1] - vertex1[1];
    const abz = vertex2[2] - vertex1[2];
    const acx = vertex3[0] - vertex1[0];
    const acy = vertex3[1] - vertex1[1];
    const acz = vertex3[2] - vertex1[2];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;

    normals.push(
        nx, ny, nz,
        nx, ny, nz,
        nx, ny, nz,
    );
}

export function buildMarchingCubesBuffers(values, sizex, sizey, sizez, gridCell, isolevel, options = {}) {
    const periodic = !!options.periodic;
    const insideIsAbove = !!options.insideIsAbove;
    const size2 = sizex * sizey;
    const positions = [];
    const normals = [];
    const vlist = Array.from({ length: 12 }, () => [0, 0, 0]);
    const points = Array.from({ length: 8 }, () => [0, 0, 0]);

    const xLimit = periodic ? sizex : sizex - 1;
    const yLimit = periodic ? sizey : sizey - 1;
    const zLimit = periodic ? sizez : sizez - 1;

    for (let z = 0; z < zLimit; z++) {
        for (let y = 0; y < yLimit; y++) {
            for (let x = 0; x < xLimit; x++) {
                getGridPointCoords(points[0], x, y, z, sizex, sizey, sizez, periodic, gridCell);
                getGridPointCoords(points[1], x + 1, y, z, sizex, sizey, sizez, periodic, gridCell);
                getGridPointCoords(points[2], x, y + 1, z, sizex, sizey, sizez, periodic, gridCell);
                getGridPointCoords(points[3], x + 1, y + 1, z, sizex, sizey, sizez, periodic, gridCell);
                getGridPointCoords(points[4], x, y, z + 1, sizex, sizey, sizez, periodic, gridCell);
                getGridPointCoords(points[5], x + 1, y, z + 1, sizex, sizey, sizez, periodic, gridCell);
                getGridPointCoords(points[6], x, y + 1, z + 1, sizex, sizey, sizez, periodic, gridCell);
                getGridPointCoords(points[7], x + 1, y + 1, z + 1, sizex, sizey, sizez, periodic, gridCell);

                const value0 = getGridValue(values, x, y, z, sizex, sizey, sizez, size2, periodic);
                const value1 = getGridValue(values, x + 1, y, z, sizex, sizey, sizez, size2, periodic);
                const value2 = getGridValue(values, x, y + 1, z, sizex, sizey, sizez, size2, periodic);
                const value3 = getGridValue(values, x + 1, y + 1, z, sizex, sizey, sizez, size2, periodic);
                const value4 = getGridValue(values, x, y, z + 1, sizex, sizey, sizez, size2, periodic);
                const value5 = getGridValue(values, x + 1, y, z + 1, sizex, sizey, sizez, size2, periodic);
                const value6 = getGridValue(values, x, y + 1, z + 1, sizex, sizey, sizez, size2, periodic);
                const value7 = getGridValue(values, x + 1, y + 1, z + 1, sizex, sizey, sizez, size2, periodic);

                let cubeindex = 0;
                const valueInside = insideIsAbove
                    ? (value) => value > isolevel
                    : (value) => value < isolevel;

                if (valueInside(value0)) cubeindex |= 1;
                if (valueInside(value1)) cubeindex |= 2;
                if (valueInside(value2)) cubeindex |= 8;
                if (valueInside(value3)) cubeindex |= 4;
                if (valueInside(value4)) cubeindex |= 16;
                if (valueInside(value5)) cubeindex |= 32;
                if (valueInside(value6)) cubeindex |= 128;
                if (valueInside(value7)) cubeindex |= 64;

                const bits = edgeTable[cubeindex];
                if (bits === 0) {
                    continue;
                }

                if (bits & 1) {
                    interpolateVertex(vlist[0], points[0], points[1], value0, value1, isolevel);
                }
                if (bits & 2) {
                    interpolateVertex(vlist[1], points[1], points[3], value1, value3, isolevel);
                }
                if (bits & 4) {
                    interpolateVertex(vlist[2], points[2], points[3], value2, value3, isolevel);
                }
                if (bits & 8) {
                    interpolateVertex(vlist[3], points[0], points[2], value0, value2, isolevel);
                }
                if (bits & 16) {
                    interpolateVertex(vlist[4], points[4], points[5], value4, value5, isolevel);
                }
                if (bits & 32) {
                    interpolateVertex(vlist[5], points[5], points[7], value5, value7, isolevel);
                }
                if (bits & 64) {
                    interpolateVertex(vlist[6], points[6], points[7], value6, value7, isolevel);
                }
                if (bits & 128) {
                    interpolateVertex(vlist[7], points[4], points[6], value4, value6, isolevel);
                }
                if (bits & 256) {
                    interpolateVertex(vlist[8], points[0], points[4], value0, value4, isolevel);
                }
                if (bits & 512) {
                    interpolateVertex(vlist[9], points[1], points[5], value1, value5, isolevel);
                }
                if (bits & 1024) {
                    interpolateVertex(vlist[10], points[3], points[7], value3, value7, isolevel);
                }
                if (bits & 2048) {
                    interpolateVertex(vlist[11], points[2], points[6], value2, value6, isolevel);
                }

                let i = 0;
                const triOffset = cubeindex << 4;

                while (triTable[triOffset + i] !== -1) {
                    const vertex1 = vlist[triTable[triOffset + i]];
                    const vertex2 = vlist[triTable[triOffset + i + 1]];
                    const vertex3 = vlist[triTable[triOffset + i + 2]];
                    pushTriangle(positions, normals, vertex1, vertex2, vertex3);
                    i += 3;
                }
            }
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
    };
}

export function buildMarchingCubesGeometry(values, sizex, sizey, sizez, gridCell, isolevel, options = {}) {
    const buffers = buildMarchingCubesBuffers(values, sizex, sizey, sizez, gridCell, isolevel, options);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normals, 3));
    return geometry;
}
