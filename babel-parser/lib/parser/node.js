"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.NodeUtils = void 0;

var _util = _interopRequireDefault(require("./util"));

var _location = require("../util/location");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const commentKeys = ["leadingComments", "trailingComments", "innerComments"];

class Node {
  constructor(parser, pos, loc) {
    this.type = "";
    this.start = pos;
    this.end = 0;
    this.loc = new _location.SourceLocation(loc);
    if (parser && parser.options.ranges) this.range = [pos, 0];
    if (parser && parser.filename) this.loc.filename = parser.filename;
  }

  __clone() {
    const node2 = new Node();
    Object.keys(this).forEach(key => {
      if (commentKeys.indexOf(key) < 0) {
        node2[key] = this[key];
      }
    });
    return node2;
  }

}

class NodeUtils extends _util.default {
  startNode() {
    return new Node(this, this.state.start, this.state.startLoc);
  }

  startNodeAt(pos, loc) {
    return new Node(this, pos, loc);
  }

  startNodeAtNode(type) {
    return this.startNodeAt(type.start, type.loc.start);
  }

  finishNode(node, type) {
    return this.finishNodeAt(node, type, this.state.lastTokEnd, this.state.lastTokEndLoc);
  }

  finishNodeAt(node, type, pos, loc) {
    node.type = type;
    node.end = pos;
    node.loc.end = loc;
    if (this.options.ranges) node.range[1] = pos;
    this.processComment(node);
    return node;
  }

  resetStartLocationFromNode(node, locationNode) {
    node.start = locationNode.start;
    node.loc.start = locationNode.loc.start;
    if (this.options.ranges) node.range[0] = locationNode.range[0];
  }

}

exports.NodeUtils = NodeUtils;