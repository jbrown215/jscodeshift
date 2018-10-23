"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _types = require("../tokenizer/types");

var _tokenizer = _interopRequireDefault(require("../tokenizer"));

var _whitespace = require("../util/whitespace");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class UtilParser extends _tokenizer.default {
  addExtra(node, key, val) {
    if (!node) return;
    const extra = node.extra = node.extra || {};
    extra[key] = val;
  }

  isRelational(op) {
    return this.match(_types.types.relational) && this.state.value === op;
  }

  isLookaheadRelational(op) {
    const l = this.lookahead();
    return l.type == _types.types.relational && l.value == op;
  }

  expectRelational(op) {
    if (this.isRelational(op)) {
      this.next();
    } else {
      this.unexpected(null, _types.types.relational);
    }
  }

  eatRelational(op) {
    if (this.isRelational(op)) {
      this.next();
      return true;
    }

    return false;
  }

  isContextual(name) {
    return this.match(_types.types.name) && this.state.value === name && !this.state.containsEsc;
  }

  isLookaheadContextual(name) {
    const l = this.lookahead();
    return l.type === _types.types.name && l.value === name;
  }

  eatContextual(name) {
    return this.isContextual(name) && this.eat(_types.types.name);
  }

  expectContextual(name, message) {
    if (!this.eatContextual(name)) this.unexpected(null, message);
  }

  canInsertSemicolon() {
    return this.match(_types.types.eof) || this.match(_types.types.braceR) || this.hasPrecedingLineBreak();
  }

  hasPrecedingLineBreak() {
    return _whitespace.lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start));
  }

  isLineTerminator() {
    return this.eat(_types.types.semi) || this.canInsertSemicolon();
  }

  semicolon() {
    if (!this.isLineTerminator()) this.unexpected(null, _types.types.semi);
  }

  expect(type, pos) {
    this.eat(type) || this.unexpected(pos, type);
  }

  unexpected(pos, messageOrType = "Unexpected token") {
    if (typeof messageOrType !== "string") {
      messageOrType = `Unexpected token, expected "${messageOrType.label}"`;
    }

    throw this.raise(pos != null ? pos : this.state.start, messageOrType);
  }

  expectPlugin(name, pos) {
    if (!this.hasPlugin(name)) {
      throw this.raise(pos != null ? pos : this.state.start, `This experimental syntax requires enabling the parser plugin: '${name}'`, {
        missingPluginNames: [name]
      });
    }

    return true;
  }

  expectOnePlugin(names, pos) {
    if (!names.some(n => this.hasPlugin(n))) {
      throw this.raise(pos != null ? pos : this.state.start, `This experimental syntax requires enabling one of the following parser plugin(s): '${names.join(", ")}'`, {
        missingPluginNames: names
      });
    }
  }

}

exports.default = UtilParser;