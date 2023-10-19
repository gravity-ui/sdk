import AxiosWrapper, {AxiosWrapperOptions} from '@gravity-ui/axios-wrapper';
import axiosRetry from 'axios-retry';

import {GatewayError} from '../models/common';

import {parseError} from './common';

export type ApiOptions = AxiosWrapperOptions & {
    updateCsrfEnabled?: boolean;
};

export default class Api extends AxiosWrapper {
    constructor(
        {updateCsrfEnabled, ...props}: ApiOptions = {},
        handleRequestError?: (error: unknown) => any,
    ) {
        super(props);

        this._axios.interceptors.response.use(null, async (error) => {
            const {config} = error;

            if (updateCsrfEnabled && config && error.response?.status === 419) {
                return this._axios(config);
            }

            return Promise.reject(error);
        });

        axiosRetry(this._axios, {
            retries: 0,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: (error) => {
                if (!error.config) {
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
