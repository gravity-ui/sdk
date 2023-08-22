export type Awaited<T> = T extends PromiseLike<infer V> ? V : never;

export class CancellablePromise<T = unknown> implements Promise<T> {
    static all<Values extends readonly unknown[] | []>(values: Values) {
        function cancel() {
            for (const promise of values as CancellablePromise[]) {
                promise.cancel();
            }
        }

        return new CancellablePromise(
            Promise.all(values) as unknown as Promise<{
                -readonly [P in keyof Values]: Awaited<Values[P]>;
            }>,
            cancel,
        );
    }

    static race<Values extends readonly unknown[] | []>(values: Values) {
        function cancel() {
            for (const promise of values as CancellablePromise[]) {
                promise.cancel();
            }
        }

        return new CancellablePromise(
            Promise.race(values) as Promise<Awaited<Values[number]>>,
            cancel,
        );
    }

    readonly [Symbol.toStringTag] = 'CancellablePromise';

    private promise: Promise<T>;

    constructor(promise: Promise<T>, cancel = () => {}) {
        this.promise = promise;
        this.cancel = cancel;
    }

    cancel: () => void = () => {};

    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ) {
        return new CancellablePromise(this.promise.then(onfulfilled, onrejected), this.cancel);
    }

    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
    ) {
        return new CancellablePromise(this.promise.catch(onrejected), this.cancel);
    }

    finally(onfinally?: (() => void) | undefined | null) {
        return new CancellablePromise(this.promise.finally(onfinally), this.cancel);
    }
}
