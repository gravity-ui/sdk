import {CancellablePromise} from './CancellablePromise';

describe('all', function () {
    test('should cancel all the promises', () => {
        // Different Promise types to see that Typescript is works correctly
        const promise1 = new CancellablePromise(new Promise<{foo: number}>(() => {}));
        const promise2 = new CancellablePromise(new Promise<{bar: string}>(() => {}));

        jest.spyOn(promise1, 'cancel');
        jest.spyOn(promise2, 'cancel');

        const all = CancellablePromise.all([promise1, promise2]);
        all.cancel();

        expect(promise1.cancel).toHaveBeenCalled();
        expect(promise2.cancel).toHaveBeenCalled();
    });
    test('should reject with an error when the `all` method is used with some rejected promises', async () => {
        expect.assertions(1);

        const promises = [
            new CancellablePromise(Promise.resolve('some value')),
            new CancellablePromise(Promise.reject('first reason')),
            new CancellablePromise(Promise.reject('second reason')),
        ];

        try {
            await CancellablePromise.all(promises);
        } catch (error) {
            expect(error).toBe('first reason');
        }
    });
    test('should resolve with some settled result when the `allSettled` method is used with some rejected promises', async () => {
        expect.assertions(1);

        const promises = [
            new CancellablePromise(Promise.resolve('some value')),
            new CancellablePromise(Promise.reject('some reason')),
        ];

        try {
            const result = await CancellablePromise.allSettled(promises);

            expect(result).toStrictEqual([
                {status: 'fulfilled', value: 'some value'},
                {status: 'rejected', reason: 'some reason'},
            ]);
        } catch (error) {}
    });
});
