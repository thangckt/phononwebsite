import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/main.js',
    output: [
        {
            format: 'es',
            file: 'build/main.js',
            sourcemap: true,
        }
    ],
    plugins: [
        resolve(),
        commonjs()
    ]
};