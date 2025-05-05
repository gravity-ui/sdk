/* eslint-env node */
const path = require('path');

const utils = require('@gravity-ui/gulp-utils');
const {task, src, dest, series, parallel} = require('gulp');
const sourcemaps = require('gulp-sourcemaps');
const {rimrafSync} = require('rimraf');

const BUILD_DIR = path.resolve('build');

async function compileTs(modules = false) {
    const tsProject = await utils.createTypescriptProject({
        compilerOptions: {
            declaration: true,
            module: modules ? 'esnext' : 'nodenext',
            moduleResolution: modules ? 'bundler' : 'nodenext',
            ...(modules ? undefined : {verbatimModuleSyntax: false}),
        },
    });

    const transformers = [tsProject.customTransformers.transformLocalModules];

    return src([
        'lib/**/*.{ts,tsx}',
        '!lib/**/__tests__/**/*',
        '!lib/**/__mocks__/**/*',
        '!lib/**/*.test.{ts,tsx}',
    ])
        .pipe(sourcemaps.init())
        .pipe(
            tsProject({
                customTransformers: {
                    before: transformers,
                    afterDeclarations: transformers,
                },
            }),
        )
        .pipe(sourcemaps.write('.', {includeContent: true, sourceRoot: '../../lib'}))
        .pipe(
            utils.addVirtualFile({
                fileName: 'package.json',
                text: JSON.stringify({type: modules ? 'module' : 'commonjs'}),
            }),
        )
        .pipe(dest(path.resolve(BUILD_DIR, modules ? 'esm' : 'cjs')));
}

task('clean', (done) => {
    rimrafSync(BUILD_DIR);
    done();
});

task('compile-to-esm', () => {
    return compileTs(true);
});

task('compile-to-cjs', () => {
    return compileTs();
});

task('build', series(['clean', parallel(['compile-to-esm', 'compile-to-cjs'])]));
task('default', series(['build']));
