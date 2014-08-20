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

/*
 * A stupid utility to parse a file.  Pass the file you want parsed to this script as the first argument
 */

'use strict';

var fs = require('fs');

var rx = require('rx');

var ingestion = require('../..');

var file = process.argv[2];

var timezone = process.argv[3];

if (timezone == null) {
  timezone = 'America/Chicago';
}


ingestion.tconnect.parse(fs.createReadStream(file), {timezone:timezone})
    .subscribe(
    function (e) {
      console.log('%j', e);
    },
    function (err) {
      console.error(err.stack);
      throw err;
    });

