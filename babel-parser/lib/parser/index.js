"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _options = require("../options");

var _statement = _interopRequireDefault(require("./statement"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class Parser extends _statement.default {
  constructor(options, input) {
    options = (0, _options.getOptions)(options);
    super(options, input);
    this.options = options;
    this.inModule = this.options.sourceType === "module";
    this.input = input;
    this.plugins = pluginsMap(this.options.plugins);
    this.filename = options.sourceFilename;
  }

  parse() {
    const file = this.startNode();
    const program = this.startNode();
    this.nextToken();
    return this.parseTopLevel(file, program);
  }

}

exports.default = Parser;

function pluginsMap(plugins) {
  const pluginMap = Object.create(null);

  for (let _i = 0; _i < plugins.length; _i++) {
    const plugin = plugins[_i];
    const [name, options = {}] = Array.isArray(plugin) ? plugin : [plugin, {}];
    if (!pluginMap[name]) pluginMap[name] = options || {};
  }

  return pluginMap;
}