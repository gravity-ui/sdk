import type {
    ApiActionParams,
    ApiActionResponseType,
    BaseSchema,
    SchemasByScope,
} from '@gravity-ui/gateway';
import type {AxiosRequestConfig} from 'axios';

import {CancellablePromise} from './CancellablePromise';
import {Lang} from './constants';
import Api from './utils/api';

export interface SdkConfig {
    axiosConfig?: AxiosRequestConfig;
    csrfToken?: string;
    endpoint?: string;
    handleRequestError?: (error: unknown) => any;
    prepareRequestOptions?: (
        scope: string | null,
        service: string | null,
        action: string | null,
        options?: SdkActionOptions,
    ) => SdkActionOptions | undefined;
}

export interface SdkActionOptions {
    concurrentId?: string;
    collectRequest?: boolean;
    retries?: number;
    timeout?: number;
    headers?: Record<string, unknown>;
    signal?: AbortSignal;
}

export const generateConcurrentId = (() => {
    let concurrentId = 0;

    return () => `sdk-id-${concurrentId++}`;
})();

const DEFAULT_ENDPOINT = '/api';
const DEFAULT_METHOD = 'POST';

function getRequestOptions(options?: SdkActionOptions, axiosConfig?: AxiosRequestConfig) {
    const requestOptions = {
        concurrentId: generateConcurrentId(),
        requestConfig: {},
    };

    if (options) {
        if (axiosConfig) {
            Object.assign(requestOptions, {
                requestConfig: axiosConfig,
            });
        }

        if (Object.prototype.hasOwnProperty.call(options, 'concurrentId')) {
            Object.assign(requestOptions, {concurrentId: options.concurrentId});
        }

        if (Object.prototype.hasOwnProperty.call(options, 'collectRequest')) {
            Object.assign(requestOptions, {collectRequest: options.collectRequest});
        }

        if (Object.prototype.hasOwnProperty.call(options, 'retries') && options.retries) {
            Object.assign(requestOptions, {
                requestConfig: {
                    ...requestOptions.requestConfig,
                    'axios-retry': {retries: options.retries},
                },
            });
        }

        if (Object.prototype.hasOwnProperty.call(options, 'signal') && options.signal) {
            Object.assign(requestOptions, {
                requestConfig: {
                    ...requestOptions.requestConfig,
                    signal: options.signal,
                },
            });
        }

        if (Object.prototype.hasOwnProperty.call(options, 'timeout')) {
            Object.assign(requestOptions, {timeout: options.timeout});
        }

        if (Object.prototype.hasOwnProperty.call(options, 'headers')) {
            Object.assign(requestOptions, {headers: options.headers});
        }
    }

    return requestOptions;
}

function createSdkAction<TRequestData, TResponseData>(
    sdkConfig: SdkConfig,
    api: Api,
    endpoint: string,
    scope: string,
    service: string,
    action: string,
) {
    return function sdkAction(data: TRequestData, initialOptions?: SdkActionOptions) {
        const options = sdkConfig.prepareRequestOptions
            ? sdkConfig.prepareRequestOptions(scope, service, action, initialOptions)
            : initialOptions;

        const actionURL = `${endpoint}/${scope}/${service}/${action}`;
        const requestOptions = getRequestOptions(options);

        return new CancellablePromise(
            api.request<TResponseData>({
                url: actionURL,
                method: DEFAULT_METHOD,
                data: data,
                options: requestOptions,
            }),
            () => api.cancelRequest(requestOptions.concurrentId),
        );
    };
}

type SdkAction<TAction> = unknown extends ApiActionParams<TAction>
    ? (
          params?: ApiActionParams<TAction>,
          options?: SdkActionOptions,
      ) => CancellablePromise<ApiActionResponseType<TAction>>
    : undefined extends ApiActionParams<TAction>
    ? (
          params?: ApiActionParams<TAction>,
          options?: SdkActionOptions,
      ) => CancellablePromise<ApiActionResponseType<TAction>>
    : (
          params: ApiActionParams<TAction>,
          options?: SdkActionOptions,
      ) => CancellablePromise<ApiActionResponseType<TAction>>;

export type ApiByScope<R extends SchemasByScope> = {
    [scope in keyof R]: ExtendedProperties<R[scope]>;
};

export type ExtendedPropertiesWithScope<R extends SchemasByScope> = ApiByScope<R>['root'] &
    ApiByScope<R>;

export type ExtendedProperties<T extends BaseSchema> = {
    [S in keyof T]: {
        [A in keyof T[S]['actions']]: SdkAction<T[S]['actions'][A]>;
    };
};

export {CancellablePromise} from './CancellablePromise';

let concurrentId = 0;

export default function sdkFactory<TSchema extends SchemasByScope>(config?: SdkConfig) {
    const sdkConfig = config || {};
    const axiosConfig = sdkConfig.axiosConfig;
    const endpoint = sdkConfig.endpoint || DEFAULT_ENDPOINT;

    const api = new Api({config: axiosConfig}, sdkConfig?.handleRequestError);
    if (sdkConfig.csrfToken) {
        api.setCSRFToken(sdkConfig.csrfToken);
    }

    const baseSdk = <T>(
        requestConfig: AxiosRequestConfig,
        initialOptions?: SdkActionOptions,
    ): Promise<T> => {
        const options = sdkConfig.prepareRequestOptions
            ? sdkConfig.prepareRequestOptions(null, null, null, initialOptions)
            : initialOptions;

        const {
            url = DEFAULT_ENDPOINT,
            method = DEFAULT_METHOD,
            data,
            params,
            ...restAxiosConfig
        } = requestConfig;
        const requestOptions = getRequestOptions(options, restAxiosConfig);

        return new CancellablePromise<T>(
            api.request({
                url,
                method,
                data,
                params,
                options: requestOptions,
            }),
            () => api.cancelRequest(requestOptions.concurrentId),
        );
    };

    const baseSdkMethods = {
        cancelRequest(id: string) {
            if (id) {
                return api.cancelRequest(id);
            }
        },

        setLang(lang: Lang) {
            if (lang) {
                const languageHeader = {
                    name: 'accept-language',
                    value: lang,
                };

                api.setDefaultHeader(languageHeader);
            }
        },

        setDefaultHeader: (...args: Parameters<Api['setDefaultHeader']>) => {
            api.setDefaultHeader(...args);
        },

        setCSRFToken(csrfToken: string) {
            api.setCSRFToken(csrfToken);
        },

        getConcurrentId() {
            return String(++concurrentId);
        },

        isCancel(value: any) {
            return value?.['isCancelled'] === true;
        },
    };

    Object.assign(baseSdk, baseSdkMethods);

    const scopes: Record<string, any> = {};

    const sdkProxy = new Proxy(baseSdk, {
        get: (sdk, scopeOrRootServiceName, scopeReceiver) => {
            if (scopeOrRootServiceName in baseSdk || typeof scopeOrRootServiceName !== 'string') {
                return Reflect.get(sdk, scopeOrRootServiceName, scopeReceiver);
            }
            if (!(scopeOrRootServiceName in scopes)) {
                scopes[scopeOrRootServiceName] = new Proxy(
                    {},
                    {
                        get: (
                            scope: Record<string, any>,
                            serviceOrRootActionName,
                            serviceReceiver,
                        ) => {
                            if (typeof serviceOrRootActionName !== 'string') {
                                return Reflect.get(scope, serviceOrRootActionName, serviceReceiver);
                            }
                            if (!(serviceOrRootActionName in scope)) {
                                const actions: Record<string, unknown> = {};

                                scope[serviceOrRootActionName] = new Proxy(() => {}, {
                                    get: (service, actionName, actionReciever) => {
                                        if (typeof actionName !== 'string') {
                                            return Reflect.get(service, actionName, actionReciever);
                                        }

                                        // shotcut call for root scope witch call/apply
                                        if (actionName === 'apply' || actionName === 'call') {
                                            return (...args: any[]) => {
                                                let realThis, realArgs;
                                                if (actionName === 'apply') {
                                                    [realThis, realArgs] = args;
                                                } else {
                                                    [realThis, ...realArgs] = args;
                                                }
                                                return Reflect.apply(
                                                    sdkProxy.root[scopeOrRootServiceName][
                                                        serviceOrRootActionName
                                                    ],
                                                    realThis,
                                                    realArgs,
                                                );
                                            };
                                        } else if (actionName === 'bind') {
                                            return (...bindArgs: any[]) =>
                                                (...args: any[]) =>
                                                    Reflect.apply(
                                                        sdkProxy.root[scopeOrRootServiceName][
                                                            serviceOrRootActionName
                                                        ],
                                                        bindArgs[0],
                                                        bindArgs.slice(1).concat(args),
                                                    );
                                        }

                                        if (!(actionName in actions)) {
                                            actions[actionName] = createSdkAction(
                                                sdkConfig,
                                                api,
                                                endpoint,
                                                scopeOrRootServiceName,
                                                serviceOrRootActionName,
                                                actionName,
                                            );
                                        }

                                        return actions[actionName];
                                    },
                                    apply(_target: Function, thisArg, args) {
                                        // shortcut call for root scope
                                        return Reflect.apply(
                                            sdkProxy.root[scopeOrRootServiceName][
                                                serviceOrRootActionName
                                            ],
                                            thisArg,
                                            args,
                                        );
                                    },
                                });
                            }
                            return scope[serviceOrRootActionName];
                        },
                    },
                );
            }
            return scopes[scopeOrRootServiceName];
        },
    }) as typeof baseSdk & typeof baseSdkMethods & ExtendedPropertiesWithScope<TSchema>;
    return sdkProxy;
}
