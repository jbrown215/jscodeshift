"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.types = exports.TokContext = void 0;

var _types = require("./types");

var _whitespace = require("../util/whitespace");

class TokContext {
  constructor(token, isExpr, preserveSpace, override) {
    this.token = token;
    this.isExpr = !!isExpr;
    this.preserveSpace = !!preserveSpace;
    this.override = override;
  }

}

exports.TokContext = TokContext;
const types = {
  braceStatement: new TokContext("{", false),
  braceExpression: new TokContext("{", true),
  templateQuasi: new TokContext("${", true),
  parenStatement: new TokContext("(", false),
  parenExpression: new TokContext("(", true),
  template: new TokContext("`", true, true, p => p.readTmplToken()),
  functionExpression: new TokContext("function", true)
};
exports.types = types;

_types.types.parenR.updateContext = _types.types.braceR.updateContext = function () {
  if (this.state.context.length === 1) {
    this.state.exprAllowed = true;
    return;
  }

  const out = this.state.context.pop();

  if (out === types.braceStatement && this.curContext() === types.functionExpression) {
    this.state.context.pop();
    this.state.exprAllowed = false;
  } else if (out === types.templateQuasi) {
    this.state.exprAllowed = true;
  } else {
    this.state.exprAllowed = !out.isExpr;
  }
};

_types.types.name.updateContext = function (prevType) {
  if (this.state.value === "of" && this.curContext() === types.parenStatement) {
    this.state.exprAllowed = !prevType.beforeExpr;
    return;
  }

  this.state.exprAllowed = false;

  if (prevType === _types.types._let || prevType === _types.types._const || prevType === _types.types._var) {
    if (_whitespace.lineBreak.test(this.input.slice(this.state.end))) {
      this.state.exprAllowed = true;
    }
  }

  if (this.state.isIterator) {
    this.state.isIterator = false;
  }
};

_types.types.braceL.updateContext = function (prevType) {
  this.state.context.push(this.braceIsBlock(prevType) ? types.braceStatement : types.braceExpression);
  this.state.exprAllowed = true;
};

_types.types.dollarBraceL.updateContext = function () {
  this.state.context.push(types.templateQuasi);
  this.state.exprAllowed = true;
};

_types.types.parenL.updateContext = function (prevType) {
  const statementParens = prevType === _types.types._if || prevType === _types.types._for || prevType === _types.types._with || prevType === _types.types._while;
  this.state.context.push(statementParens ? types.parenStatement : types.parenExpression);
  this.state.exprAllowed = true;
};

_types.types.incDec.updateContext = function () {};

_types.types._function.updateContext = _types.types._class.updateContext = function (prevType) {
  if (this.state.exprAllowed && !this.braceIsBlock(prevType)) {
    this.state.context.push(types.functionExpression);
  }

  this.state.exprAllowed = false;
};

_types.types.backQuote.updateContext = function () {
  if (this.curContext() === types.template) {
    this.state.context.pop();
  } else {
    this.state.context.push(types.template);
  }

  this.state.exprAllowed = false;
};