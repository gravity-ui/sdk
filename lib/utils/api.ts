import AxiosWrapperModule, {type AxiosWrapperOptions} from '@gravity-ui/axios-wrapper';
import axiosRetry from 'axios-retry';

import type {GatewayError} from '../models/common';

import {parseError} from './common';

// axios-wrapper has no "exports": native Node ESM gets its CJS module object instead of the class
type AxiosWrapperClass = typeof AxiosWrapperModule extends {default: infer T}
    ? T
    : typeof AxiosWrapperModule;
const AxiosWrapper: AxiosWrapperClass =
    (AxiosWrapperModule as unknown as {default?: AxiosWrapperClass}).default ?? AxiosWrapperModule;

// Symbols are not preserved in the Axios config
const csrfRetryKey = '__ CSRF retry';
export const scopeServicePathKey = '__ SDK scope/service path';

const urlRegexp = /\/(?<api>\w+)\/(?<scope>\w+)\/(?<service>\w+)\/(?<action>\w+)/i;

export interface AxiosInterceptors {
    requestInterceptorSuccess?: (config: any) => Promise<any>;
    requestInterceptorError?: (error: any) => Promise<any>;
    responseInterceptorSuccess?: (data: any) => Promise<any>;
    responseInterceptorError?: (error: any) => Promise<any>;
}

type ServicesWithAxiosInterceptors = Record<string, AxiosInterceptors[]>;

export type ApiOptions = AxiosWrapperOptions & {
    updateCsrfEnabled?: boolean;
    axiosInterceptors?: ServicesWithAxiosInterceptors;
};

export function createScopeServicePath(service: string, scope?: string): string {
    return `${scope ?? 'root'}/${service}`;
}

export function getScopeServicePath(url: string): string {
    const groups = url.match(urlRegexp)?.groups;

    return groups ? createScopeServicePath(groups.service, groups.scope) : '';
}

type InterceptorsChainParams = {
    config?: {url?: string; [scopeServicePathKey]?: string};
    axiosInterceptors?: ServicesWithAxiosInterceptors;
    queryData: any;
    success: boolean;
    interceptorSelector: (
        interceptors: AxiosInterceptors,
    ) => ((data: any) => Promise<any>) | undefined;
};

export function makeInterceptorsChain({
    config,
    axiosInterceptors,
    queryData,
    success,
    interceptorSelector,
}: InterceptorsChainParams): Promise<any> {
    let result: Promise<any> = success ? Promise.resolve(queryData) : Promise.reject(queryData);

    const path = config?.[scopeServicePathKey] ?? (config?.url && getScopeServicePath(config.url));

    if (!path) {
        return result;
    }

    for (const interceptors of axiosInterceptors?.[path] || []) {
        const interceptor = interceptorSelector(interceptors);

        if (interceptor) {
            result = success
                ? result.then(async (data) => await interceptor(data))
                : result.catch(async (data) => await interceptor(data));
        }
    }

    return result;
}

export default class Api extends AxiosWrapper {
    constructor(
        {updateCsrfEnabled, axiosInterceptors, ...props}: ApiOptions = {},
        handleRequestError?: (error: unknown) => any,
    ) {
        super(props);

        const requestSuccess = (config: any) => {
            return makeInterceptorsChain({
                config,
                axiosInterceptors,
                queryData: config,
                success: true,
                interceptorSelector: (interceptors) => interceptors.requestInterceptorSuccess,
            });
        };

        const requestError = (error: any) => {
            return makeInterceptorsChain({
                config: error?.config,
                axiosInterceptors,
                queryData: error,
                success: false,
                interceptorSelector: (interceptors) => interceptors.requestInterceptorError,
            });
        };

        const responseSuccess = (data: any) => {
            return makeInterceptorsChain({
                config: data?.config,
                axiosInterceptors,
                queryData: data,
                success: true,
                interceptorSelector: (interceptors) => interceptors.responseInterceptorSuccess,
            });
        };

        const responseError = (error: any) => {
            let result: Promise<any> = makeInterceptorsChain({
                config: error?.config,
                axiosInterceptors,
                queryData: error,
                success: false,
                interceptorSelector: (interceptors) => interceptors.responseInterceptorError,
            });

            if (updateCsrfEnabled) {
                result = result.catch(async (error) => {
                    const {config} = error;

                    if (config && !config[csrfRetryKey] && error.response?.status === 419) {
                        const csrfHeaderName = (
                            this.csrfHeaderName || 'x-csrf-token'
                        ).toLowerCase();

                        const newToken = error.response.headers[csrfHeaderName];

                        if (newToken) {
                            this.setCSRFToken(newToken);
                            // Retry headers override defaults: replace the stale token here.
                            // Don't construct AxiosHeaders: SDK and axios-wrapper may load different axios instances
                            if (typeof config.headers?.set === 'function') {
                                config.headers.set(this.csrfHeaderName, newToken);
                            } else {
                                config.headers = Object.fromEntries(
                                    Object.entries(config.headers ?? {}).filter(
                                        ([name]) => name.toLowerCase() !== csrfHeaderName,
                                    ),
                                );
                                config.headers[this.csrfHeaderName] = newToken;
                            }
                        }

                        return this._axios({
                            ...config,
                            // data is already serialized by the first attempt
                            transformRequest: [(data: unknown) => data],
                            [csrfRetryKey]: true,
                        });
                    }

                    return Promise.reject(error);
                });
            }

            return result;
        };

        this._axios.interceptors.request.use(requestSuccess, requestError);
        this._axios.interceptors.response.use(responseSuccess, responseError);

        axiosRetry(this._axios, {
            retries: 0,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error) => {
                if (!error.config || error.code === 'ERR_CANCELED') {
                    return false;
                }

                return axiosRetry.isNetworkError(error) || axiosRetry.isRetryableError(error);
            },
        });

        if (typeof handleRequestError === 'function') {
            this.handleRequestError = handleRequestError;
        }
    }

    handleRequestError<T = GatewayError>(errorResponse: unknown): Promise<T> | T {
        throw parseError(errorResponse);
    }
}
