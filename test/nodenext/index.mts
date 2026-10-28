import sdkFactory, {CancellablePromise, Lang} from '@gravity-ui/sdk';

const sdk = sdkFactory();
sdk.setDefaultHeader({name: 'x-test', value: 'test'});
sdk.setLang(Lang.En);
sdk.setLang('ru');
// @ts-expect-error unsupported language
sdk.setLang('de');

export const result: CancellablePromise<unknown> = sdk({url: '/api'});
