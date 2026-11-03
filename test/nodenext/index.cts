import sdkFactory = require('@gravity-ui/sdk');

const sdk = sdkFactory.default();
sdk.setDefaultHeader({name: 'x-test', value: 'test'});
sdk.setDefaultHeader({name: 'x-method', value: 'test', methods: ['post']});
sdk.setLang(sdkFactory.Lang.En);
sdk.setLang('ru');
// @ts-expect-error unsupported language
sdk.setLang('de');

export const result: sdkFactory.CancellablePromise<unknown> = sdk({url: '/api'});
