import AxiosWrapper, {AxiosWrapperOptions} from '@gravity-ui/axios-wrapper';
import axiosRetry from 'axios-retry';

import {GatewayError} from '../models/common';

import {parseError} from './common';

export default class Api extends AxiosWrapper {
    constructor(props: AxiosWrapperOptions = {}, handleRequestError?: (error: unknown) => any) {
        super(props);

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
