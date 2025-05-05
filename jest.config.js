module.exports = {
    verbose: true,
    moduleFileExtensions: ['js', 'ts'],
    rootDir: '.',
    transform: {
        '^.+\\.ts?$': ['@swc/jest'],
    },
    transformIgnorePatterns: ['node_modules/(?!(@gravity-ui)/)'],
    coverageDirectory: './coverage',
    collectCoverageFrom: ['lib/**/*.{js,ts}'],
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
};
