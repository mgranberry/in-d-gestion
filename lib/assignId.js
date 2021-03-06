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

var crypto = require('crypto');

var amoeba = require('amoeba');
var except = amoeba.except;
var base32hex = amoeba.base32hex;

function hashVals(vals) {
  var hasher = crypto.createHash('sha1');
  for (var i = 0; i < vals.length; ++i) {
    hasher.update(String(vals[i]));
  }
  return base32hex.encodeBuffer(hasher.digest());
}

function buildHasher() {
  var getters = Array.prototype.slice.call(arguments, 0).map(function(field){
    return function(e) {
      var retVal = e[field];
      if (retVal == null) {
        throw except.ISE('Unable to make id for event type[%s], no field[%s]', e.type, field);
      }
      return  retVal;
    };
  });

  return function(e) {
    return hashVals(getters.map(function(getter){
      return  getter(e);
    }));
  };
}

var idifiers = {
  basal: buildHasher('type', 'deliveryType', 'deviceId', 'ts'),
  bolus: buildHasher('type', 'subType', 'deviceId', 'ts'),
  cbg: buildHasher('type', 'deviceId', 'ts'),
  deviceMeta: buildHasher('type', 'subType', 'ts'),
  smbg: buildHasher('type', 'deviceId', 'ts'),
  settings: buildHasher('type', 'deviceId', 'ts'),
  wizard: buildHasher('type', 'deviceId', 'ts')
};

/**
 * Assigns an id to objects based on the type of data .
 *
 * The assignments are defined in `idifiers`, each of which is a function that will generate an id
 * based on the defined fields.
 *
 * @param e An event to be idified
 * @returns the idified event
 */
module.exports = function(e) {
  if (e.id == null) {
    var handler = idifiers[e.type];
    if (handler == null) {
      throw except.ISE('Unknown event type[%s] for idification. ts[%s]', e.type, e.ts);
    }
    e.id = handler(e);
  }

  return e;
};