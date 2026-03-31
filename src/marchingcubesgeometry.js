import * as THREE from 'three';

import { edgeTable, triTable } from './static_libs/MarchingCubesData.js';

function interpolateVertex(pointA, pointB, valueA, valueB, isolevel) {
    const delta = valueB - valueA;
    const mu = delta === 0 ? 0.5 : (isolevel - valueA) / delta;
    return pointA.clone().lerp(pointB, mu);
}

function getWrappedIndexAndShift(index, size) {
    if (size <= 0) {
        return { index: 0, shift: 0 };
    }
    const shift = Math.floor(index / size);
    const wrappedIndex = ((index % size) + size) % size;
    return { index: wrappedIndex, shift };
}

function getGridPoint(points, x, y, z, sizex, sizey, sizez, size2, periodic, gridCell) {
    if (!periodic) {
        return points[x + sizex * y + size2 * z];
    }

    const wx = getWrappedIndexAndShift(x, sizex);
    const wy = getWrappedIndexAndShift(y, sizey);
    const wz = getWrappedIndexAndShift(z, sizez);
    const point = points[wx.index + sizex * wy.index + size2 * wz.index].clone();
    point.add(new THREE.Vector3(
        wx.shift * gridCell[0][0] + wy.shift * gridCell[1][0] + wz.shift * gridCell[2][0],
        wx.shift * gridCell[0][1] + wy.shift * gridCell[1][1] + wz.shift * gridCell[2][1],
        wx.shift * gridCell[0][2] + wy.shift * gridCell[1][2] + wz.shift * gridCell[2][2],
    ));
    return point;
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

export function buildMarchingCubesGeometry(values, sizex, sizey, sizez, gridCell, isolevel, options = {}) {
    const periodic = !!options.periodic;
    const insideIsAbove = !!options.insideIsAbove;
    const size2 = sizex * sizey;
    const points = new Array(sizex * sizey * sizez);
    const vertices = [];
    const vlist = new Array(12);

    for (let z = 0; z < sizez; z++) {
        for (let y = 0; y < sizey; y++) {
            for (let x = 0; x < sizex; x++) {
                const fx = periodic ? x / sizex : (sizex > 1 ? x / (sizex - 1) : 0);
                const fy = periodic ? y / sizey : (sizey > 1 ? y / (sizey - 1) : 0);
                const fz = periodic ? z / sizez : (sizez > 1 ? z / (sizez - 1) : 0);
                const index = x + sizex * y + size2 * z;

                points[index] = new THREE.Vector3(
                    fx * gridCell[0][0] + fy * gridCell[1][0] + fz * gridCell[2][0],
                    fx * gridCell[0][1] + fy * gridCell[1][1] + fz * gridCell[2][1],
                    fx * gridCell[0][2] + fy * gridCell[1][2] + fz * gridCell[2][2],
                );
            }
        }
    }

    const xLimit = periodic ? sizex : sizex - 1;
    const yLimit = periodic ? sizey : sizey - 1;
    const zLimit = periodic ? sizez : sizez - 1;

    for (let z = 0; z < zLimit; z++) {
        for (let y = 0; y < yLimit; y++) {
            for (let x = 0; x < xLimit; x++) {
                const point0 = getGridPoint(points, x, y, z, sizex, sizey, sizez, size2, periodic, gridCell);
                const point1 = getGridPoint(points, x + 1, y, z, sizex, sizey, sizez, size2, periodic, gridCell);
                const point2 = getGridPoint(points, x, y + 1, z, sizex, sizey, sizez, size2, periodic, gridCell);
                const point3 = getGridPoint(points, x + 1, y + 1, z, sizex, sizey, sizez, size2, periodic, gridCell);
                const point4 = getGridPoint(points, x, y, z + 1, sizex, sizey, sizez, size2, periodic, gridCell);
                const point5 = getGridPoint(points, x + 1, y, z + 1, sizex, sizey, sizez, size2, periodic, gridCell);
                const point6 = getGridPoint(points, x, y + 1, z + 1, sizex, sizey, sizez, size2, periodic, gridCell);
                const point7 = getGridPoint(points, x + 1, y + 1, z + 1, sizex, sizey, sizez, size2, periodic, gridCell);

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
                    vlist[0] = interpolateVertex(point0, point1, value0, value1, isolevel);
                }
                if (bits & 2) {
                    vlist[1] = interpolateVertex(point1, point3, value1, value3, isolevel);
                }
                if (bits & 4) {
                    vlist[2] = interpolateVertex(point2, point3, value2, value3, isolevel);
                }
                if (bits & 8) {
                    vlist[3] = interpolateVertex(point0, point2, value0, value2, isolevel);
                }
                if (bits & 16) {
                    vlist[4] = interpolateVertex(point4, point5, value4, value5, isolevel);
                }
                if (bits & 32) {
                    vlist[5] = interpolateVertex(point5, point7, value5, value7, isolevel);
                }
                if (bits & 64) {
                    vlist[6] = interpolateVertex(point6, point7, value6, value7, isolevel);
                }
                if (bits & 128) {
                    vlist[7] = interpolateVertex(point4, point6, value4, value6, isolevel);
                }
                if (bits & 256) {
                    vlist[8] = interpolateVertex(point0, point4, value0, value4, isolevel);
                }
                if (bits & 512) {
                    vlist[9] = interpolateVertex(point1, point5, value1, value5, isolevel);
                }
                if (bits & 1024) {
                    vlist[10] = interpolateVertex(point3, point7, value3, value7, isolevel);
                }
                if (bits & 2048) {
                    vlist[11] = interpolateVertex(point2, point6, value2, value6, isolevel);
                }

                let i = 0;
                const triOffset = cubeindex << 4;

                while (triTable[triOffset + i] !== -1) {
                    const vertex1 = vlist[triTable[triOffset + i]];
                    const vertex2 = vlist[triTable[triOffset + i + 1]];
                    const vertex3 = vlist[triTable[triOffset + i + 2]];

                    vertices.push(
                        vertex1.x, vertex1.y, vertex1.z,
                        vertex2.x, vertex2.y, vertex2.z,
                        vertex3.x, vertex3.y, vertex3.z,
                    );

                    i += 3;
                }
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();

    return geometry;
}
