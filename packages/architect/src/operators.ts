import {ObservableInput, of, OperatorFunction} from 'rxjs';
import {concatMap, exhaustMap, map, mergeMap, switchMap} from 'rxjs/operators';

type Successful<T extends {success: boolean}> = T & {success: true};
type Failed<T extends {success: boolean}> = T & {success: false};

function ifSuccessful<T extends {success: boolean}, R1, R2>(
  ifSuccessful: (value: Successful<T>) => R1,
  ifFailed: (value: Failed<T>) => R2,
): (value: T) => R1 | R2 {
  return value =>
    value.success
      ? ifSuccessful(value as Successful<T>)
      : ifFailed(value as Failed<T>);
}

export function mapSuccessfulResult<T extends {success: boolean}, R>(
  fn: (result: Successful<T>) => R,
): OperatorFunction<T, R | Failed<T>> {
  return map(ifSuccessful(fn, value => value));
}

export function concatMapSuccessfulResult<T extends {success: boolean}, R>(
  fn: (result: Successful<T>) => ObservableInput<R>,
): OperatorFunction<T, R | Failed<T>> {
  return concatMap(ifSuccessful(fn, value => of(value)));
}

export function exhaustMapSuccessfulResult<T extends {success: boolean}, R>(
  fn: (result: Successful<T>) => ObservableInput<R>,
): OperatorFunction<T, R | Failed<T>> {
  return exhaustMap(ifSuccessful(fn, value => of(value)));
}

export function mergeMapSuccessfulResult<T extends {success: boolean}, R>(
  fn: (result: Successful<T>) => ObservableInput<R>,
): OperatorFunction<T, R | Failed<T>> {
  return mergeMap(ifSuccessful(fn, value => of(value)));
}

export function switchMapSuccessfulResult<T extends {success: boolean}, R>(
  fn: (result: Successful<T>) => ObservableInput<R>,
): OperatorFunction<T, R | Failed<T>> {
  return switchMap(ifSuccessful(fn, value => of(value)));
}
