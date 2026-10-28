import sdkFactory, {CancellablePromise} from '@gravity-ui/sdk';

const sdk = sdkFactory();
sdk.setDefaultHeader({name: 'x-test', value: 'test'});

export const result: CancellablePromise<unknown> = sdk({url: '/api'});
