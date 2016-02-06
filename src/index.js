/**!
Copyright 2016 SEITENBAU GmbH

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';

const runMixNmock = require('./lib/mix-n-mock').run;
const automaticRestart = require('./lib/automatic-restart');

let params = process.argv.slice(2); // node scriptName [...]

// process command line parameters
let allowedFlags = {
    '-r': '--restart'
};
let flags = params.reduceRight((result, param, i) => {
    if (param[0] === '-') {
        params.splice(i, 1);
        result[allowedFlags[param] || param] = true;
    }
    return result;
}, {});
let invalidFlags = Object.keys(flags).filter(flag => {
    for (var key in allowedFlags) {
        if (allowedFlags.hasOwnProperty(key) && (flag === key || flag === allowedFlags[key])) {
            return false;
        }
    }
    return true;
});
if (invalidFlags.length) {
    console.warn(`WARNING: Ignoring invalid command line parameter${invalidFlags.length > 1 ? 's' : ''} ${invalidFlags.join(', ')}`);
}

// main
if (flags.hasOwnProperty('--restart')) {
    params.forEach(automaticRestart);
} else {
    if (params.length) {
        params.forEach(runMixNmock);
    } else {
        runMixNmock();
    }
}
