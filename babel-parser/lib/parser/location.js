"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _location = require("../util/location");

var _comments = _interopRequireDefault(require("./comments"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class LocationParser extends _comments.default {
  raise(pos, message, {
    missingPluginNames,
    code
  } = {}) {
    const loc = (0, _location.getLineInfo)(this.input, pos);
    message += ` (${loc.line}:${loc.column})`;
    const err = new SyntaxError(message);
    err.pos = pos;
    err.loc = loc;

    if (missingPluginNames) {
      err.missingPlugin = missingPluginNames;
    }

    if (code !== undefined) {
      err.code = code;
    }

    throw err;
  }

}

exports.default = LocationParser;