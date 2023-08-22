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
});
