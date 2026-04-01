import { DataTexture3D, FloatType, LinearFilter, RedFormat } from 'three';

export function createVolumeTexture(values, sizex, sizey, sizez) {
    const textureValues = values instanceof Float32Array ? values : Float32Array.from(values);
    const texture = new DataTexture3D(textureValues, sizex, sizey, sizez);
    texture.format = RedFormat;
    texture.type = FloatType;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    return texture;
}

export function disposeVolumeTexture(texture) {
    if (texture && typeof texture.dispose === 'function') {
        texture.dispose();
    }
}
