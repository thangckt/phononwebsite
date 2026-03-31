import * as THREE from 'three';

import { edgeTable, triTable } from './static_libs/MarchingCubesData.js';

function interpolateVertex(pointA, pointB, valueA, valueB, isolevel) {
    const delta = valueB - valueA;
    const mu = delta === 0 ? 0.5 : (isolevel - valueA) / delta;
    return pointA.clone().lerp(pointB, mu);
}

export function buildMarchingCubesGeometry(values, sizex, sizey, sizez, gridCell, isolevel) {
    const size2 = sizex * sizey;
    const points = new Array(sizex * sizey * sizez);
    const vertices = [];
    const vlist = new Array(12);

    for (let z = 0; z < sizez; z++) {
        for (let y = 0; y < sizey; y++) {
            for (let x = 0; x < sizex; x++) {
                const fx = sizex > 1 ? x / (sizex - 1) : 0;
                const fy = sizey > 1 ? y / (sizey - 1) : 0;
                const fz = sizez > 1 ? z / (sizez - 1) : 0;
                const index = x + sizex * y + size2 * z;

                points[index] = new THREE.Vector3(
                    fx * gridCell[0][0] + fy * gridCell[1][0] + fz * gridCell[2][0],
                    fx * gridCell[0][1] + fy * gridCell[1][1] + fz * gridCell[2][1],
                    fx * gridCell[0][2] + fy * gridCell[1][2] + fz * gridCell[2][2],
                );
            }
        }
    }

    for (let z = 0; z < sizez - 1; z++) {
        for (let y = 0; y < sizey - 1; y++) {
            for (let x = 0; x < sizex - 1; x++) {
                const p = x + sizex * y + size2 * z;
                const px = p + 1;
                const py = p + sizex;
                const pxy = py + 1;
                const pz = p + size2;
                const pxz = px + size2;
                const pyz = py + size2;
                const pxyz = pxy + size2;

                const value0 = values[p];
                const value1 = values[px];
                const value2 = values[py];
                const value3 = values[pxy];
                const value4 = values[pz];
                const value5 = values[pxz];
                const value6 = values[pyz];
                const value7 = values[pxyz];

                let cubeindex = 0;
                if (value0 < isolevel) cubeindex |= 1;
                if (value1 < isolevel) cubeindex |= 2;
                if (value2 < isolevel) cubeindex |= 8;
                if (value3 < isolevel) cubeindex |= 4;
                if (value4 < isolevel) cubeindex |= 16;
                if (value5 < isolevel) cubeindex |= 32;
                if (value6 < isolevel) cubeindex |= 128;
                if (value7 < isolevel) cubeindex |= 64;

                const bits = edgeTable[cubeindex];
                if (bits === 0) {
                    continue;
                }

                if (bits & 1) {
                    vlist[0] = interpolateVertex(points[p], points[px], value0, value1, isolevel);
                }
                if (bits & 2) {
                    vlist[1] = interpolateVertex(points[px], points[pxy], value1, value3, isolevel);
                }
                if (bits & 4) {
                    vlist[2] = interpolateVertex(points[py], points[pxy], value2, value3, isolevel);
                }
                if (bits & 8) {
                    vlist[3] = interpolateVertex(points[p], points[py], value0, value2, isolevel);
                }
                if (bits & 16) {
                    vlist[4] = interpolateVertex(points[pz], points[pxz], value4, value5, isolevel);
                }
                if (bits & 32) {
                    vlist[5] = interpolateVertex(points[pxz], points[pxyz], value5, value7, isolevel);
                }
                if (bits & 64) {
                    vlist[6] = interpolateVertex(points[pyz], points[pxyz], value6, value7, isolevel);
                }
                if (bits & 128) {
                    vlist[7] = interpolateVertex(points[pz], points[pyz], value4, value6, isolevel);
                }
                if (bits & 256) {
                    vlist[8] = interpolateVertex(points[p], points[pz], value0, value4, isolevel);
                }
                if (bits & 512) {
                    vlist[9] = interpolateVertex(points[px], points[pxz], value1, value5, isolevel);
                }
                if (bits & 1024) {
                    vlist[10] = interpolateVertex(points[pxy], points[pxyz], value3, value7, isolevel);
                }
                if (bits & 2048) {
                    vlist[11] = interpolateVertex(points[py], points[pyz], value2, value6, isolevel);
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
