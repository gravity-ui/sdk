import sdkFactory = require('@gravity-ui/sdk');

const sdk = sdkFactory.default();
sdk.setDefaultHeader({name: 'x-test', value: 'test'});

export const result: sdkFactory.CancellablePromise<unknown> = sdk({url: '/api'});
