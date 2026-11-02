import {ErrorCode} from '../constants';

import {isNeedResetError, parseError} from './common';

describe('parseError', () => {
    test('gateway error', () => {
        const debug = {stack: 'stack'};
        const details = {title: 'title'};

        expect(
            parseError({
                data: {status: 403, code: 'FORBIDDEN', message: 'Forbidden', details, debug},
            }),
        ).toEqual({status: 403, code: 'FORBIDDEN', message: 'Forbidden', details, debug});
    });

    test('gateway error without fields', () => {
        expect(parseError({data: {}})).toEqual({
            status: 500,
            code: ErrorCode.SDKRequestError,
            message: 'SDK request error',
            details: undefined,
            debug: undefined,
        });
    });

    test('keeps null fields', () => {
        expect(parseError({data: {status: null, code: null, message: null}})).toMatchObject({
            status: null,
            code: null,
            message: null,
        });
    });

    test('nginx error', () => {
        expect(parseError({data: '<html></html>', status: 502, statusText: 'Bad Gateway'})).toEqual(
            {
                status: 502,
                code: ErrorCode.SDKRequestError,
                message: 'SDK request error',
                details: {title: 502, description: 'Bad Gateway'},
            },
        );
        expect(parseError({data: '<html></html>'})).toMatchObject({status: 500});
    });

    test.each([undefined, null, 'error', new Error('error'), {status: 404}])(
        'unknown error %p',
        (error) => {
            expect(parseError(error)).toEqual({
                status: 500,
                code: ErrorCode.SDKRequestError,
                message: 'SDK request error',
                details: error,
            });
        },
    );
});

describe('isNeedResetError', () => {
    test.each([
        [{data: {code: ErrorCode.AccountChanged}}, true],
        [{data: {code: ErrorCode.SessionExpired}}, true],
        [{data: {code: ErrorCode.SDKRequestError}}, false],
        [{data: 'error'}, false],
        [null, false],
        [undefined, false],
    ])('%p', (error, expected) => {
        expect(isNeedResetError(error)).toBe(expected);
    });
});
