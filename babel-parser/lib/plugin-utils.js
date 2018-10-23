"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.hasPlugin = hasPlugin;
exports.getPluginOption = getPluginOption;
exports.validatePlugins = validatePlugins;
exports.mixinPlugins = exports.mixinPluginNames = void 0;

var _estree = _interopRequireDefault(require("./plugins/estree"));

var _flow = _interopRequireDefault(require("./plugins/flow"));

var _jsx = _interopRequireDefault(require("./plugins/jsx"));

var _typescript = _interopRequireDefault(require("./plugins/typescript"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function hasPlugin(plugins, name) {
  return plugins.some(plugin => {
    if (Array.isArray(plugin)) {
      return plugin[0] === name;
    } else {
      return plugin === name;
    }
  });
}

function getPluginOption(plugins, name, option) {
  const plugin = plugins.find(plugin => {
    if (Array.isArray(plugin)) {
      return plugin[0] === name;
    } else {
      return plugin === name;
    }
  });

  if (plugin && Array.isArray(plugin)) {
    return plugin[1][option];
  }

  return null;
}

const PIPELINE_PROPOSALS = ["minimal"];

function validatePlugins(plugins) {
  if (hasPlugin(plugins, "decorators")) {
    if (hasPlugin(plugins, "decorators-legacy")) {
      throw new Error("Cannot use the decorators and decorators-legacy plugin together");
    }

    const decoratorsBeforeExport = getPluginOption(plugins, "decorators", "decoratorsBeforeExport");

    if (decoratorsBeforeExport == null) {
      throw new Error("The 'decorators' plugin requires a 'decoratorsBeforeExport' option," + " whose value must be a boolean. If you are migrating from" + " Babylon/Babel 6 or want to use the old decorators proposal, you" + " should use the 'decorators-legacy' plugin instead of 'decorators'.");
    } else if (typeof decoratorsBeforeExport !== "boolean") {
      throw new Error("'decoratorsBeforeExport' must be a boolean.");
    }
  }

  if (hasPlugin(plugins, "flow") && hasPlugin(plugins, "typescript")) {
    throw new Error("Cannot combine flow and typescript plugins.");
  }

  if (hasPlugin(plugins, "pipelineOperator") && !PIPELINE_PROPOSALS.includes(getPluginOption(plugins, "pipelineOperator", "proposal"))) {
    throw new Error("'pipelineOperator' requires 'proposal' option whose value should be one of: " + PIPELINE_PROPOSALS.join(", "));
  }
}

const mixinPluginNames = ["estree", "jsx", "flow", "typescript"];
exports.mixinPluginNames = mixinPluginNames;
const mixinPlugins = {
  estree: _estree.default,
  jsx: _jsx.default,
  flow: _flow.default,
  typescript: _typescript.default
};
exports.mixinPlugins = mixinPlugins;