/**
* Remove indentation from an indented template string
*/
module.exports = function (parts) {
    var values = Array.prototype.slice.call(arguments, 1);
    var result = parts.reduce((result, item, i) => result + (i ? values[i - 1] : '') + item, '');
    return result.replace(/^\s+/gm, '');
};
