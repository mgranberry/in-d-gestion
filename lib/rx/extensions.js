/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014, Tidepool Project
 * 
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 * 
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */
'use strict';

var rx = require('rx');

/**
 * Applies a function that takes an observable to the current observable.
 *
 * This basically just inverts the calling structure to make it easier to chain operations.  Instead of taking a
 * reference to the current observable and passing it as an argument to a function, you can pass in the same
 * function to `apply()` and it will do the inversion for you.
 *
 * @param fn A function that takes an observable and returns an observable
 * @returns {*} the current observable with the function applied to it
 */
rx.Observable.prototype.apply = function (fn) {
  return fn(this);
};

/**
 * Convenience method, applies a function as in `map()` and filters out null results.
 *
 * @param fn function as in `map()`, null return values will be filtered out of the observable sequence
 * @returns {Array|*} An observable with elements altered/filtered according to `fn`
 */
rx.Observable.prototype.keep = function (fn) {
  return this.map(fn).filter(function (e) { return e !== null; });
};

/**
 * "Link" two Observables.  This function exists in order to allow for chaining operations
 * that subscribe on the current Observable and use that to emit results to the outgoing observable.
 *
 * @param fn A function that is given an outputObservable and returns an Observer to be subscribed on the current observable
 */
rx.Observable.prototype.link = function (fn) {
  var inputObservable = this;
  return rx.Observable.create(function (outputObserverable) {
    // Return the subscription so that it can be disposed of, if it needs to be
    return inputObservable.subscribe(fn(outputObserverable));
  });
};

/**
 * A compatibility method that allows for passing the objects from an Observable through a stream and back
 * into an Observable.  Useful when borrowing logic that has been written against the stream API.
 *
 * @param stream the Readable and Writable stream that events should flow through
 * @returns an observable that emits objects that have been "mapped" through the stream
 */
rx.Observable.prototype.passThroughStream = function (stream) {
  var inputObservable = this;
  return rx.Observable.create(function (observer) {
    var writer = rx.Node.writeToStream(inputObservable, stream);

    var currOutputErr = observer.onError.bind(observer);
    observer.onError = function (err) {
      writer.dispose();
      currOutputErr(err);
    };

    rx.Node.fromStream(stream).subscribe(observer);
  });
};

/**
 * A method that assumes the incoming objects are Buffers and emits a new object on each line break.
 *
 * A line break is currently defined as '\n'.  This could be made configurable if there is the need.
 *
 * @returns {*} An observable that emits a new object on each new-line
 */
rx.Observable.prototype.readline = function () {
  var bufferedString = '';
  return this.link(function (outputObs) {
    return rx.Observer.create(
      function (e) {
        bufferedString += e;
        var splits = bufferedString.split('\n');
        for (var i = 0; i < splits.length - 1; ++i) {
          outputObs.onNext(splits[i] + '\n');
        }
        bufferedString = splits[splits.length - 1];
      },
      function (err) {
        outputObs.onError(err);
      },
      function () {
        outputObs.onNext(bufferedString);
        outputObs.onCompleted();
      }
    );
  });
};

/**
 * Sorts the given stream by collecting all events into an array and sorting with `Array.sort()`.
 *
 * If dealing with a stream that does not fit in memory, this function is a bad choice.
 *
 * @param fn compareFn as defined in `Array.sort()`
 * @returns {*|string} observable that will emit events in sorted order
 */
rx.Observable.prototype.sort = function (fn) {
  return this
    .toArray()
    .flatMap(function (asArray) {
               return rx.Observable.fromArray(asArray.sort(fn));
             });
};

/**
 * Splits an observable based on the key returned from the `selector` function and returns
 * an observable that is the re-merging of the split streams
 *
 * Each unique key from the `selector` defines a new observable sequence.  The key is then
 * used to look up a handling function in `handlers` and the observable is passed to that.
 *
 * The handler function is only called once per unique key.
 *
 * Handlers can either be
 *
 * 1. A `function(key, observable)` that is called on each unique key and should return the
 * observable modified as it should be for the given key.
 * 2. An object of key -> `function(observable)` mappings.  The key is used to lookup the
 * `function(observable)`, which is called with the observable and should return a modified
 * observable to use for the given key.
 *
 * @param selector a function that returns a key for an event.  That key is used to determine which observable
 *   stream the event belongs to
 * @param handlers either a function(key, observable) or an object of key -> function(observable) mappings
 */
rx.Observable.prototype.splitMerge = function (selector, handlers) {
  if (typeof(handlers) === 'object') {
    var handlersObj = handlers;
    handlers = function(key, observable) {
      var handler = handlersObj[key];
      if (handler == null) {
        throw new Error('Unknown key[' + key + '].');
      }
      return handler(observable);
    };
  }

  return this.link(
    function(observer) {
      var flows = {};

      var retVal = rx.Observer.create(
        function(e) {
          var key = selector(e);
          var flow = flows[key];
          if (flow == null) {
            flow = new rx.Subject();

            handlers(key, flow).subscribe(
              function (e){
                observer.onNext(e);
              },
              function(err) {
                observer.onError(err);
              },
              function(theKey){
                return function(){
                  delete flows[theKey];
                  if (Object.keys(flows).length === 0) {
                    observer.onCompleted();
                  }
                };
              }(key)
            );

            flows[key] = flow;
          }

          flow.onNext(e);
        },
        function(err) {
          observer.onError(err);
        },
        function() {
          var flowKeys = Object.keys(flows);
          if (flowKeys.length === 0) {
            observer.onCompleted();
          } else {
            flowKeys.forEach(function(key){
              flows[key].onCompleted();
            });
          }
        }
      );

      return retVal;
    });
};