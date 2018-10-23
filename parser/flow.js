/*
 *  Copyright (c) 2015-present, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 *
 */

'use strict';

const flowParser = require('@babel/parser'); // TODO: replace with flow-parser when v0.84.0 lands

const options = {
  esproposal_class_instance_fields: true,
  esproposal_class_static_fields: true,
  esproposal_decorators: true,
  esproposal_export_star_as: true,
  types: true,
};

exports.parse = function parse(source, options) {
  options = require("recast/parsers/_babel_options.js")(options);
  options.plugins.push("jsx", "flow");
  return flowParser.parse(source, options);
};
