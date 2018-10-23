"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _identifier = require("../util/identifier");

class BaseParser {
  constructor() {
    this.sawUnambiguousESM = false;
  }

  isReservedWord(word) {
    if (word === "await") {
      return this.inModule;
    } else {
      return _identifier.reservedWords[6](word);
    }
  }

  hasPlugin(name) {
    return Object.hasOwnProperty.call(this.plugins, name);
  }

  getPluginOption(plugin, name) {
    if (this.hasPlugin(plugin)) return this.plugins[plugin][name];
  }

}

exports.default = BaseParser;