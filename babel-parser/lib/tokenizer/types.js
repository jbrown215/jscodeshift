"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.keywords = exports.types = exports.TokenType = void 0;
const beforeExpr = true;
const startsExpr = true;
const isLoop = true;
const isAssign = true;
const prefix = true;
const postfix = true;

class TokenType {
  constructor(label, conf = {}) {
    this.label = label;
    this.keyword = conf.keyword;
    this.beforeExpr = !!conf.beforeExpr;
    this.startsExpr = !!conf.startsExpr;
    this.rightAssociative = !!conf.rightAssociative;
    this.isLoop = !!conf.isLoop;
    this.isAssign = !!conf.isAssign;
    this.prefix = !!conf.prefix;
    this.postfix = !!conf.postfix;
    this.binop = conf.binop === 0 ? 0 : conf.binop || null;
    this.updateContext = null;
  }

}

exports.TokenType = TokenType;

function KeywordTokenType(keyword, options = {}) {
  return new TokenType(keyword, Object.assign({}, options, {
    keyword
  }));
}

function BinopTokenType(name, binop) {
  return new TokenType(name, {
    beforeExpr,
    binop
  });
}

const types = {
  num: new TokenType("num", {
    startsExpr
  }),
  bigint: new TokenType("bigint", {
    startsExpr
  }),
  regexp: new TokenType("regexp", {
    startsExpr
  }),
  string: new TokenType("string", {
    startsExpr
  }),
  name: new TokenType("name", {
    startsExpr
  }),
  eof: new TokenType("eof"),
  bracketL: new TokenType("[", {
    beforeExpr,
    startsExpr
  }),
  bracketR: new TokenType("]"),
  braceL: new TokenType("{", {
    beforeExpr,
    startsExpr
  }),
  braceBarL: new TokenType("{|", {
    beforeExpr,
    startsExpr
  }),
  braceR: new TokenType("}"),
  braceBarR: new TokenType("|}"),
  parenL: new TokenType("(", {
    beforeExpr,
    startsExpr
  }),
  parenR: new TokenType(")"),
  comma: new TokenType(",", {
    beforeExpr
  }),
  semi: new TokenType(";", {
    beforeExpr
  }),
  colon: new TokenType(":", {
    beforeExpr
  }),
  doubleColon: new TokenType("::", {
    beforeExpr
  }),
  dot: new TokenType("."),
  question: new TokenType("?", {
    beforeExpr
  }),
  questionDot: new TokenType("?."),
  arrow: new TokenType("=>", {
    beforeExpr
  }),
  template: new TokenType("template"),
  ellipsis: new TokenType("...", {
    beforeExpr
  }),
  backQuote: new TokenType("`", {
    startsExpr
  }),
  dollarBraceL: new TokenType("${", {
    beforeExpr,
    startsExpr
  }),
  at: new TokenType("@"),
  hash: new TokenType("#"),
  interpreterDirective: new TokenType("#!..."),
  eq: new TokenType("=", {
    beforeExpr,
    isAssign
  }),
  assign: new TokenType("_=", {
    beforeExpr,
    isAssign
  }),
  incDec: new TokenType("++/--", {
    prefix,
    postfix,
    startsExpr
  }),
  bang: new TokenType("!", {
    beforeExpr,
    prefix,
    startsExpr
  }),
  tilde: new TokenType("~", {
    beforeExpr,
    prefix,
    startsExpr
  }),
  pipeline: new BinopTokenType("|>", 0),
  nullishCoalescing: new BinopTokenType("??", 1),
  logicalOR: new BinopTokenType("||", 1),
  logicalAND: new BinopTokenType("&&", 2),
  bitwiseOR: new BinopTokenType("|", 3),
  bitwiseXOR: new BinopTokenType("^", 4),
  bitwiseAND: new BinopTokenType("&", 5),
  equality: new BinopTokenType("==/!=", 6),
  relational: new BinopTokenType("</>", 7),
  bitShift: new BinopTokenType("<</>>", 8),
  plusMin: new TokenType("+/-", {
    beforeExpr,
    binop: 9,
    prefix,
    startsExpr
  }),
  modulo: new BinopTokenType("%", 10),
  star: new BinopTokenType("*", 10),
  slash: new BinopTokenType("/", 10),
  exponent: new TokenType("**", {
    beforeExpr,
    binop: 11,
    rightAssociative: true
  })
};
exports.types = types;
const keywords = {
  break: new KeywordTokenType("break"),
  case: new KeywordTokenType("case", {
    beforeExpr
  }),
  catch: new KeywordTokenType("catch"),
  continue: new KeywordTokenType("continue"),
  debugger: new KeywordTokenType("debugger"),
  default: new KeywordTokenType("default", {
    beforeExpr
  }),
  do: new KeywordTokenType("do", {
    isLoop,
    beforeExpr
  }),
  else: new KeywordTokenType("else", {
    beforeExpr
  }),
  finally: new KeywordTokenType("finally"),
  for: new KeywordTokenType("for", {
    isLoop
  }),
  function: new KeywordTokenType("function", {
    startsExpr
  }),
  if: new KeywordTokenType("if"),
  return: new KeywordTokenType("return", {
    beforeExpr
  }),
  switch: new KeywordTokenType("switch"),
  throw: new KeywordTokenType("throw", {
    beforeExpr,
    prefix,
    startsExpr
  }),
  try: new KeywordTokenType("try"),
  var: new KeywordTokenType("var"),
  let: new KeywordTokenType("let"),
  const: new KeywordTokenType("const"),
  while: new KeywordTokenType("while", {
    isLoop
  }),
  with: new KeywordTokenType("with"),
  new: new KeywordTokenType("new", {
    beforeExpr,
    startsExpr
  }),
  this: new KeywordTokenType("this", {
    startsExpr
  }),
  super: new KeywordTokenType("super", {
    startsExpr
  }),
  class: new KeywordTokenType("class"),
  extends: new KeywordTokenType("extends", {
    beforeExpr
  }),
  export: new KeywordTokenType("export"),
  import: new KeywordTokenType("import", {
    startsExpr
  }),
  yield: new KeywordTokenType("yield", {
    beforeExpr,
    startsExpr
  }),
  null: new KeywordTokenType("null", {
    startsExpr
  }),
  true: new KeywordTokenType("true", {
    startsExpr
  }),
  false: new KeywordTokenType("false", {
    startsExpr
  }),
  in: new KeywordTokenType("in", {
    beforeExpr,
    binop: 7
  }),
  instanceof: new KeywordTokenType("instanceof", {
    beforeExpr,
    binop: 7
  }),
  typeof: new KeywordTokenType("typeof", {
    beforeExpr,
    prefix,
    startsExpr
  }),
  void: new KeywordTokenType("void", {
    beforeExpr,
    prefix,
    startsExpr
  }),
  delete: new KeywordTokenType("delete", {
    beforeExpr,
    prefix,
    startsExpr
  })
};
exports.keywords = keywords;
Object.keys(keywords).forEach(name => {
  types["_" + name] = keywords[name];
});