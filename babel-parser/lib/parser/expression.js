"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _types = require("../tokenizer/types");

var N = _interopRequireWildcard(require("../types"));

var _lval = _interopRequireDefault(require("./lval"));

var _identifier = require("../util/identifier");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

class ExpressionParser extends _lval.default {
  checkPropClash(prop, propHash) {
    if (prop.computed || prop.kind) return;
    const key = prop.key;
    const name = key.type === "Identifier" ? key.name : String(key.value);

    if (name === "__proto__") {
      if (propHash.proto) {
        this.raise(key.start, "Redefinition of __proto__ property");
      }

      propHash.proto = true;
    }
  }

  getExpression() {
    this.nextToken();
    const expr = this.parseExpression();

    if (!this.match(_types.types.eof)) {
      this.unexpected();
    }

    expr.comments = this.state.comments;
    return expr;
  }

  parseExpression(noIn, refShorthandDefaultPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const expr = this.parseMaybeAssign(noIn, refShorthandDefaultPos);

    if (this.match(_types.types.comma)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.expressions = [expr];

      while (this.eat(_types.types.comma)) {
        node.expressions.push(this.parseMaybeAssign(noIn, refShorthandDefaultPos));
      }

      this.toReferencedList(node.expressions);
      return this.finishNode(node, "SequenceExpression");
    }

    return expr;
  }

  parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;

    if (this.match(_types.types._yield) && this.state.inGenerator) {
      let left = this.parseYield();

      if (afterLeftParse) {
        left = afterLeftParse.call(this, left, startPos, startLoc);
      }

      return left;
    }

    let failOnShorthandAssign;

    if (refShorthandDefaultPos) {
      failOnShorthandAssign = false;
    } else {
      refShorthandDefaultPos = {
        start: 0
      };
      failOnShorthandAssign = true;
    }

    if (this.match(_types.types.parenL) || this.match(_types.types.name) || this.match(_types.types._yield)) {
      this.state.potentialArrowAt = this.state.start;
    }

    let left = this.parseMaybeConditional(noIn, refShorthandDefaultPos, refNeedsArrowPos);

    if (afterLeftParse) {
      left = afterLeftParse.call(this, left, startPos, startLoc);
    }

    if (this.state.type.isAssign) {
      const node = this.startNodeAt(startPos, startLoc);
      const operator = this.state.value;
      node.operator = operator;

      if (operator === "??=") {
        this.expectPlugin("nullishCoalescingOperator");
        this.expectPlugin("logicalAssignment");
      }

      if (operator === "||=" || operator === "&&=") {
        this.expectPlugin("logicalAssignment");
      }

      node.left = this.match(_types.types.eq) ? this.toAssignable(left, undefined, "assignment expression") : left;
      refShorthandDefaultPos.start = 0;
      this.checkLVal(left, undefined, undefined, "assignment expression");

      if (left.extra && left.extra.parenthesized) {
        let errorMsg;

        if (left.type === "ObjectPattern") {
          errorMsg = "`({a}) = 0` use `({a} = 0)`";
        } else if (left.type === "ArrayPattern") {
          errorMsg = "`([a]) = 0` use `([a] = 0)`";
        }

        if (errorMsg) {
          this.raise(left.start, `You're trying to assign to a parenthesized expression, eg. instead of ${errorMsg}`);
        }
      }

      this.next();
      node.right = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "AssignmentExpression");
    } else if (failOnShorthandAssign && refShorthandDefaultPos.start) {
      this.unexpected(refShorthandDefaultPos.start);
    }

    return left;
  }

  parseMaybeConditional(noIn, refShorthandDefaultPos, refNeedsArrowPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const potentialArrowAt = this.state.potentialArrowAt;
    const expr = this.parseExprOps(noIn, refShorthandDefaultPos);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }

    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;
    return this.parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos);
  }

  parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    if (this.eat(_types.types.question)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.test = expr;
      node.consequent = this.parseMaybeAssign();
      this.expect(_types.types.colon);
      node.alternate = this.parseMaybeAssign(noIn);
      return this.finishNode(node, "ConditionalExpression");
    }

    return expr;
  }

  parseExprOps(noIn, refShorthandDefaultPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const potentialArrowAt = this.state.potentialArrowAt;
    const expr = this.parseMaybeUnary(refShorthandDefaultPos);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }

    if (refShorthandDefaultPos && refShorthandDefaultPos.start) {
      return expr;
    }

    return this.parseExprOp(expr, startPos, startLoc, -1, noIn);
  }

  parseExprOp(left, leftStartPos, leftStartLoc, minPrec, noIn) {
    const prec = this.state.type.binop;

    if (prec != null && (!noIn || !this.match(_types.types._in))) {
      if (prec > minPrec) {
        const node = this.startNodeAt(leftStartPos, leftStartLoc);
        const operator = this.state.value;
        node.left = left;
        node.operator = operator;

        if (operator === "**" && left.type === "UnaryExpression" && !(left.extra && left.extra.parenthesized)) {
          this.raise(left.argument.start, "Illegal expression. Wrap left hand side or entire exponentiation in parentheses.");
        }

        const op = this.state.type;

        if (op === _types.types.nullishCoalescing) {
          this.expectPlugin("nullishCoalescingOperator");
        } else if (op === _types.types.pipeline) {
          this.expectPlugin("pipelineOperator");
        }

        this.next();
        const startPos = this.state.start;
        const startLoc = this.state.startLoc;

        if (op === _types.types.pipeline) {
          if (this.match(_types.types.name) && this.state.value === "await" && this.state.inAsync) {
            throw this.raise(this.state.start, `Unexpected "await" after pipeline body; await must have parentheses in minimal proposal`);
          }
        }

        node.right = this.parseExprOp(this.parseMaybeUnary(), startPos, startLoc, op.rightAssociative ? prec - 1 : prec, noIn);
        this.finishNode(node, op === _types.types.logicalOR || op === _types.types.logicalAND || op === _types.types.nullishCoalescing ? "LogicalExpression" : "BinaryExpression");
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, noIn);
      }
    }

    return left;
  }

  parseMaybeUnary(refShorthandDefaultPos) {
    if (this.state.type.prefix) {
      const node = this.startNode();
      const update = this.match(_types.types.incDec);
      node.operator = this.state.value;
      node.prefix = true;

      if (node.operator === "throw") {
        this.expectPlugin("throwExpressions");
      }

      this.next();
      node.argument = this.parseMaybeUnary();

      if (refShorthandDefaultPos && refShorthandDefaultPos.start) {
        this.unexpected(refShorthandDefaultPos.start);
      }

      if (update) {
        this.checkLVal(node.argument, undefined, undefined, "prefix operation");
      } else if (this.state.strict && node.operator === "delete") {
        const arg = node.argument;

        if (arg.type === "Identifier") {
          this.raise(node.start, "Deleting local variable in strict mode");
        } else if (arg.type === "MemberExpression" && arg.property.type === "PrivateName") {
          this.raise(node.start, "Deleting a private field is not allowed");
        }
      }

      return this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    }

    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    let expr = this.parseExprSubscripts(refShorthandDefaultPos);
    if (refShorthandDefaultPos && refShorthandDefaultPos.start) return expr;

    while (this.state.type.postfix && !this.canInsertSemicolon()) {
      const node = this.startNodeAt(startPos, startLoc);
      node.operator = this.state.value;
      node.prefix = false;
      node.argument = expr;
      this.checkLVal(expr, undefined, undefined, "postfix operation");
      this.next();
      expr = this.finishNode(node, "UpdateExpression");
    }

    return expr;
  }

  parseExprSubscripts(refShorthandDefaultPos) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const potentialArrowAt = this.state.potentialArrowAt;
    const expr = this.parseExprAtom(refShorthandDefaultPos);

    if (expr.type === "ArrowFunctionExpression" && expr.start === potentialArrowAt) {
      return expr;
    }

    if (refShorthandDefaultPos && refShorthandDefaultPos.start) {
      return expr;
    }

    return this.parseSubscripts(expr, startPos, startLoc);
  }

  parseSubscripts(base, startPos, startLoc, noCalls) {
    const state = {
      optionalChainMember: false,
      stop: false
    };

    do {
      base = this.parseSubscript(base, startPos, startLoc, noCalls, state);
    } while (!state.stop);

    return base;
  }

  parseSubscript(base, startPos, startLoc, noCalls, state) {
    if (!noCalls && this.eat(_types.types.doubleColon)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.callee = this.parseNoCallExpr();
      state.stop = true;
      return this.parseSubscripts(this.finishNode(node, "BindExpression"), startPos, startLoc, noCalls);
    } else if (this.match(_types.types.questionDot)) {
      this.expectPlugin("optionalChaining");
      state.optionalChainMember = true;

      if (noCalls && this.lookahead().type == _types.types.parenL) {
        state.stop = true;
        return base;
      }

      this.next();
      const node = this.startNodeAt(startPos, startLoc);

      if (this.eat(_types.types.bracketL)) {
        node.object = base;
        node.property = this.parseExpression();
        node.computed = true;
        node.optional = true;
        this.expect(_types.types.bracketR);
        return this.finishNode(node, "OptionalMemberExpression");
      } else if (this.eat(_types.types.parenL)) {
        const possibleAsync = this.atPossibleAsync(base);
        node.callee = base;
        node.arguments = this.parseCallExpressionArguments(_types.types.parenR, possibleAsync);
        node.optional = true;
        return this.finishNode(node, "OptionalCallExpression");
      } else {
        node.object = base;
        node.property = this.parseIdentifier(true);
        node.computed = false;
        node.optional = true;
        return this.finishNode(node, "OptionalMemberExpression");
      }
    } else if (this.eat(_types.types.dot)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.property = this.parseMaybePrivateName();
      node.computed = false;

      if (state.optionalChainMember) {
        node.optional = false;
        return this.finishNode(node, "OptionalMemberExpression");
      }

      return this.finishNode(node, "MemberExpression");
    } else if (this.eat(_types.types.bracketL)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      node.property = this.parseExpression();
      node.computed = true;
      this.expect(_types.types.bracketR);

      if (state.optionalChainMember) {
        node.optional = false;
        return this.finishNode(node, "OptionalMemberExpression");
      }

      return this.finishNode(node, "MemberExpression");
    } else if (!noCalls && this.match(_types.types.parenL)) {
      const possibleAsync = this.atPossibleAsync(base);
      this.next();
      const node = this.startNodeAt(startPos, startLoc);
      node.callee = base;
      const refTrailingCommaPos = {
        start: -1
      };
      node.arguments = this.parseCallExpressionArguments(_types.types.parenR, possibleAsync, refTrailingCommaPos);

      if (!state.optionalChainMember) {
        this.finishCallExpression(node);
      } else {
        this.finishOptionalCallExpression(node);
      }

      if (possibleAsync && this.shouldParseAsyncArrow()) {
        state.stop = true;

        if (refTrailingCommaPos.start > -1) {
          this.raise(refTrailingCommaPos.start, "A trailing comma is not permitted after the rest element");
        }

        return this.parseAsyncArrowFromCallExpression(this.startNodeAt(startPos, startLoc), node);
      } else {
        this.toReferencedList(node.arguments);
      }

      return node;
    } else if (this.match(_types.types.backQuote)) {
      return this.parseTaggedTemplateExpression(startPos, startLoc, base, state);
    } else {
      state.stop = true;
      return base;
    }
  }

  parseTaggedTemplateExpression(startPos, startLoc, base, state, typeArguments) {
    const node = this.startNodeAt(startPos, startLoc);
    node.tag = base;
    node.quasi = this.parseTemplate(true);
    if (typeArguments) node.typeParameters = typeArguments;

    if (state.optionalChainMember) {
      this.raise(startPos, "Tagged Template Literals are not allowed in optionalChain");
    }

    return this.finishNode(node, "TaggedTemplateExpression");
  }

  atPossibleAsync(base) {
    return !this.state.containsEsc && this.state.potentialArrowAt === base.start && base.type === "Identifier" && base.name === "async" && !this.canInsertSemicolon();
  }

  finishCallExpression(node) {
    if (node.callee.type === "Import") {
      if (node.arguments.length !== 1) {
        this.raise(node.start, "import() requires exactly one argument");
      }

      const importArg = node.arguments[0];

      if (importArg && importArg.type === "SpreadElement") {
        this.raise(importArg.start, "... is not allowed in import()");
      }
    }

    return this.finishNode(node, "CallExpression");
  }

  finishOptionalCallExpression(node) {
    if (node.callee.type === "Import") {
      if (node.arguments.length !== 1) {
        this.raise(node.start, "import() requires exactly one argument");
      }

      const importArg = node.arguments[0];

      if (importArg && importArg.type === "SpreadElement") {
        this.raise(importArg.start, "... is not allowed in import()");
      }
    }

    return this.finishNode(node, "OptionalCallExpression");
  }

  parseCallExpressionArguments(close, possibleAsyncArrow, refTrailingCommaPos) {
    const elts = [];
    let innerParenStart;
    let first = true;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(_types.types.comma);
        if (this.eat(close)) break;
      }

      if (this.match(_types.types.parenL) && !innerParenStart) {
        innerParenStart = this.state.start;
      }

      elts.push(this.parseExprListItem(false, possibleAsyncArrow ? {
        start: 0
      } : undefined, possibleAsyncArrow ? {
        start: 0
      } : undefined, possibleAsyncArrow ? refTrailingCommaPos : undefined));
    }

    if (possibleAsyncArrow && innerParenStart && this.shouldParseAsyncArrow()) {
      this.unexpected();
    }

    return elts;
  }

  shouldParseAsyncArrow() {
    return this.match(_types.types.arrow);
  }

  parseAsyncArrowFromCallExpression(node, call) {
    const oldYield = this.state.yieldInPossibleArrowParameters;
    this.state.yieldInPossibleArrowParameters = null;
    this.expect(_types.types.arrow);
    this.parseArrowExpression(node, call.arguments, true);
    this.state.yieldInPossibleArrowParameters = oldYield;
    return node;
  }

  parseNoCallExpr() {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    return this.parseSubscripts(this.parseExprAtom(), startPos, startLoc, true);
  }

  parseExprAtom(refShorthandDefaultPos) {
    const canBeArrow = this.state.potentialArrowAt === this.state.start;
    let node;

    switch (this.state.type) {
      case _types.types._super:
        if (!this.state.inMethod && !this.state.inClassProperty && !this.options.allowSuperOutsideMethod) {
          this.raise(this.state.start, "super is only allowed in object methods and classes");
        }

        node = this.startNode();
        this.next();

        if (!this.match(_types.types.parenL) && !this.match(_types.types.bracketL) && !this.match(_types.types.dot)) {
          this.unexpected();
        }

        if (this.match(_types.types.parenL) && this.state.inMethod !== "constructor" && !this.options.allowSuperOutsideMethod) {
          this.raise(node.start, "super() is only valid inside a class constructor. " + "Make sure the method name is spelled exactly as 'constructor'.");
        }

        return this.finishNode(node, "Super");

      case _types.types._import:
        if (this.lookahead().type === _types.types.dot) {
          return this.parseImportMetaProperty();
        }

        this.expectPlugin("dynamicImport");
        node = this.startNode();
        this.next();

        if (!this.match(_types.types.parenL)) {
          this.unexpected(null, _types.types.parenL);
        }

        return this.finishNode(node, "Import");

      case _types.types._this:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "ThisExpression");

      case _types.types._yield:
        if (this.state.inGenerator) this.unexpected();

      case _types.types.name:
        {
          node = this.startNode();
          const allowAwait = this.state.value === "await" && (this.state.inAsync || !this.state.inFunction && this.options.allowAwaitOutsideFunction);
          const containsEsc = this.state.containsEsc;
          const allowYield = this.shouldAllowYieldIdentifier();
          const id = this.parseIdentifier(allowAwait || allowYield);

          if (id.name === "await") {
            if (this.state.inAsync || this.inModule || !this.state.inFunction && this.options.allowAwaitOutsideFunction) {
              return this.parseAwait(node);
            }
          } else if (!containsEsc && id.name === "async" && this.match(_types.types._function) && !this.canInsertSemicolon()) {
            this.next();
            return this.parseFunction(node, false, false, true);
          } else if (canBeArrow && !this.canInsertSemicolon() && id.name === "async" && this.match(_types.types.name)) {
            const oldYield = this.state.yieldInPossibleArrowParameters;
            this.state.yieldInPossibleArrowParameters = null;
            const params = [this.parseIdentifier()];
            this.expect(_types.types.arrow);
            this.parseArrowExpression(node, params, true);
            this.state.yieldInPossibleArrowParameters = oldYield;
            return node;
          }

          if (canBeArrow && !this.canInsertSemicolon() && this.eat(_types.types.arrow)) {
            const oldYield = this.state.yieldInPossibleArrowParameters;
            this.state.yieldInPossibleArrowParameters = null;
            this.parseArrowExpression(node, [id]);
            this.state.yieldInPossibleArrowParameters = oldYield;
            return node;
          }

          return id;
        }

      case _types.types._do:
        {
          this.expectPlugin("doExpressions");
          const node = this.startNode();
          this.next();
          const oldInFunction = this.state.inFunction;
          const oldLabels = this.state.labels;
          this.state.labels = [];
          this.state.inFunction = false;
          node.body = this.parseBlock(false);
          this.state.inFunction = oldInFunction;
          this.state.labels = oldLabels;
          return this.finishNode(node, "DoExpression");
        }

      case _types.types.regexp:
        {
          const value = this.state.value;
          node = this.parseLiteral(value.value, "RegExpLiteral");
          node.pattern = value.pattern;
          node.flags = value.flags;
          return node;
        }

      case _types.types.num:
        return this.parseLiteral(this.state.value, "NumericLiteral");

      case _types.types.bigint:
        return this.parseLiteral(this.state.value, "BigIntLiteral");

      case _types.types.string:
        return this.parseLiteral(this.state.value, "StringLiteral");

      case _types.types._null:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "NullLiteral");

      case _types.types._true:
      case _types.types._false:
        return this.parseBooleanLiteral();

      case _types.types.parenL:
        return this.parseParenAndDistinguishExpression(canBeArrow);

      case _types.types.bracketL:
        node = this.startNode();
        this.next();
        node.elements = this.parseExprList(_types.types.bracketR, true, refShorthandDefaultPos);
        this.toReferencedList(node.elements);
        return this.finishNode(node, "ArrayExpression");

      case _types.types.braceL:
        return this.parseObj(false, refShorthandDefaultPos);

      case _types.types._function:
        return this.parseFunctionExpression();

      case _types.types.at:
        this.parseDecorators();

      case _types.types._class:
        node = this.startNode();
        this.takeDecorators(node);
        return this.parseClass(node, false);

      case _types.types._new:
        return this.parseNew();

      case _types.types.backQuote:
        return this.parseTemplate(false);

      case _types.types.doubleColon:
        {
          node = this.startNode();
          this.next();
          node.object = null;
          const callee = node.callee = this.parseNoCallExpr();

          if (callee.type === "MemberExpression") {
            return this.finishNode(node, "BindExpression");
          } else {
            throw this.raise(callee.start, "Binding should be performed on object property.");
          }
        }

      default:
        throw this.unexpected();
    }
  }

  parseBooleanLiteral() {
    const node = this.startNode();
    node.value = this.match(_types.types._true);
    this.next();
    return this.finishNode(node, "BooleanLiteral");
  }

  parseMaybePrivateName() {
    const isPrivate = this.match(_types.types.hash);

    if (isPrivate) {
      this.expectOnePlugin(["classPrivateProperties", "classPrivateMethods"]);
      const node = this.startNode();
      const columnHashEnd = this.state.end;
      this.next();
      const columnIdentifierStart = this.state.start;
      const spacesBetweenHashAndIdentifier = columnIdentifierStart - columnHashEnd;

      if (spacesBetweenHashAndIdentifier != 0) {
        this.raise(columnIdentifierStart, "Unexpected space between # and identifier");
      }

      node.id = this.parseIdentifier(true);
      return this.finishNode(node, "PrivateName");
    } else {
      return this.parseIdentifier(true);
    }
  }

  parseFunctionExpression() {
    const node = this.startNode();
    const meta = this.parseIdentifier(true);

    if (this.state.inGenerator && this.eat(_types.types.dot)) {
      return this.parseMetaProperty(node, meta, "sent");
    }

    return this.parseFunction(node, false);
  }

  parseMetaProperty(node, meta, propertyName) {
    node.meta = meta;

    if (meta.name === "function" && propertyName === "sent") {
      if (this.isContextual(propertyName)) {
        this.expectPlugin("functionSent");
      } else if (!this.hasPlugin("functionSent")) {
        this.unexpected();
      }
    }

    const containsEsc = this.state.containsEsc;
    node.property = this.parseIdentifier(true);

    if (node.property.name !== propertyName || containsEsc) {
      this.raise(node.property.start, `The only valid meta property for ${meta.name} is ${meta.name}.${propertyName}`);
    }

    return this.finishNode(node, "MetaProperty");
  }

  parseImportMetaProperty() {
    const node = this.startNode();
    const id = this.parseIdentifier(true);
    this.expect(_types.types.dot);

    if (id.name === "import") {
      if (this.isContextual("meta")) {
        this.expectPlugin("importMeta");
      } else if (!this.hasPlugin("importMeta")) {
        this.raise(id.start, `Dynamic imports require a parameter: import('a.js')`);
      }
    }

    if (!this.inModule) {
      this.raise(id.start, `import.meta may appear only with 'sourceType: "module"'`, {
        code: "BABEL_PARSER_SOURCETYPE_MODULE_REQUIRED"
      });
    }

    this.sawUnambiguousESM = true;
    return this.parseMetaProperty(node, id, "meta");
  }

  parseLiteral(value, type, startPos, startLoc) {
    startPos = startPos || this.state.start;
    startLoc = startLoc || this.state.startLoc;
    const node = this.startNodeAt(startPos, startLoc);
    this.addExtra(node, "rawValue", value);
    this.addExtra(node, "raw", this.input.slice(startPos, this.state.end));
    node.value = value;
    this.next();
    return this.finishNode(node, type);
  }

  parseParenExpression() {
    this.expect(_types.types.parenL);
    const val = this.parseExpression();
    this.expect(_types.types.parenR);
    return val;
  }

  parseParenAndDistinguishExpression(canBeArrow) {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    let val;
    this.expect(_types.types.parenL);
    const oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
    const oldYield = this.state.yieldInPossibleArrowParameters;
    this.state.maybeInArrowParameters = true;
    this.state.yieldInPossibleArrowParameters = null;
    const innerStartPos = this.state.start;
    const innerStartLoc = this.state.startLoc;
    const exprList = [];
    const refShorthandDefaultPos = {
      start: 0
    };
    const refNeedsArrowPos = {
      start: 0
    };
    let first = true;
    let spreadStart;
    let optionalCommaStart;

    while (!this.match(_types.types.parenR)) {
      if (first) {
        first = false;
      } else {
        this.expect(_types.types.comma, refNeedsArrowPos.start || null);

        if (this.match(_types.types.parenR)) {
          optionalCommaStart = this.state.start;
          break;
        }
      }

      if (this.match(_types.types.ellipsis)) {
        const spreadNodeStartPos = this.state.start;
        const spreadNodeStartLoc = this.state.startLoc;
        spreadStart = this.state.start;
        exprList.push(this.parseParenItem(this.parseRest(), spreadNodeStartPos, spreadNodeStartLoc));

        if (this.match(_types.types.comma) && this.lookahead().type === _types.types.parenR) {
          this.raise(this.state.start, "A trailing comma is not permitted after the rest element");
        }

        break;
      } else {
        exprList.push(this.parseMaybeAssign(false, refShorthandDefaultPos, this.parseParenItem, refNeedsArrowPos));
      }
    }

    const innerEndPos = this.state.start;
    const innerEndLoc = this.state.startLoc;
    this.expect(_types.types.parenR);
    this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
    let arrowNode = this.startNodeAt(startPos, startLoc);

    if (canBeArrow && this.shouldParseArrow() && (arrowNode = this.parseArrow(arrowNode))) {
      for (let _i = 0; _i < exprList.length; _i++) {
        const param = exprList[_i];

        if (param.extra && param.extra.parenthesized) {
          this.unexpected(param.extra.parenStart);
        }
      }

      this.parseArrowExpression(arrowNode, exprList);
      this.state.yieldInPossibleArrowParameters = oldYield;
      return arrowNode;
    }

    this.state.yieldInPossibleArrowParameters = oldYield;

    if (!exprList.length) {
      this.unexpected(this.state.lastTokStart);
    }

    if (optionalCommaStart) this.unexpected(optionalCommaStart);
    if (spreadStart) this.unexpected(spreadStart);

    if (refShorthandDefaultPos.start) {
      this.unexpected(refShorthandDefaultPos.start);
    }

    if (refNeedsArrowPos.start) this.unexpected(refNeedsArrowPos.start);

    if (exprList.length > 1) {
      val = this.startNodeAt(innerStartPos, innerStartLoc);
      val.expressions = exprList;
      this.toReferencedList(val.expressions);
      this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
    } else {
      val = exprList[0];
    }

    this.addExtra(val, "parenthesized", true);
    this.addExtra(val, "parenStart", startPos);
    return val;
  }

  shouldParseArrow() {
    return !this.canInsertSemicolon();
  }

  parseArrow(node) {
    if (this.eat(_types.types.arrow)) {
      return node;
    }
  }

  parseParenItem(node, startPos, startLoc) {
    return node;
  }

  parseNew() {
    const node = this.startNode();
    const meta = this.parseIdentifier(true);

    if (this.eat(_types.types.dot)) {
      const metaProp = this.parseMetaProperty(node, meta, "target");

      if (!this.state.inFunction && !this.state.inClassProperty) {
        let error = "new.target can only be used in functions";

        if (this.hasPlugin("classProperties")) {
          error += " or class properties";
        }

        this.raise(metaProp.start, error);
      }

      return metaProp;
    }

    node.callee = this.parseNoCallExpr();

    if (node.callee.type === "OptionalMemberExpression" || node.callee.type === "OptionalCallExpression") {
      this.raise(this.state.lastTokEnd, "constructors in/after an Optional Chain are not allowed");
    }

    if (this.eat(_types.types.questionDot)) {
      this.raise(this.state.start, "constructors in/after an Optional Chain are not allowed");
    }

    this.parseNewArguments(node);
    return this.finishNode(node, "NewExpression");
  }

  parseNewArguments(node) {
    if (this.eat(_types.types.parenL)) {
      const args = this.parseExprList(_types.types.parenR);
      this.toReferencedList(args);
      node.arguments = args;
    } else {
      node.arguments = [];
    }
  }

  parseTemplateElement(isTagged) {
    const elem = this.startNode();

    if (this.state.value === null) {
      if (!isTagged) {
        this.raise(this.state.invalidTemplateEscapePosition || 0, "Invalid escape sequence in template");
      } else {
        this.state.invalidTemplateEscapePosition = null;
      }
    }

    elem.value = {
      raw: this.input.slice(this.state.start, this.state.end).replace(/\r\n?/g, "\n"),
      cooked: this.state.value
    };
    this.next();
    elem.tail = this.match(_types.types.backQuote);
    return this.finishNode(elem, "TemplateElement");
  }

  parseTemplate(isTagged) {
    const node = this.startNode();
    this.next();
    node.expressions = [];
    let curElt = this.parseTemplateElement(isTagged);
    node.quasis = [curElt];

    while (!curElt.tail) {
      this.expect(_types.types.dollarBraceL);
      node.expressions.push(this.parseExpression());
      this.expect(_types.types.braceR);
      node.quasis.push(curElt = this.parseTemplateElement(isTagged));
    }

    this.next();
    return this.finishNode(node, "TemplateLiteral");
  }

  parseObj(isPattern, refShorthandDefaultPos) {
    let decorators = [];
    const propHash = Object.create(null);
    let first = true;
    const node = this.startNode();
    node.properties = [];
    this.next();
    let firstRestLocation = null;

    while (!this.eat(_types.types.braceR)) {
      if (first) {
        first = false;
      } else {
        this.expect(_types.types.comma);
        if (this.eat(_types.types.braceR)) break;
      }

      if (this.match(_types.types.at)) {
        if (this.hasPlugin("decorators")) {
          this.raise(this.state.start, "Stage 2 decorators disallow object literal property decorators");
        } else {
          while (this.match(_types.types.at)) {
            decorators.push(this.parseDecorator());
          }
        }
      }

      let prop = this.startNode(),
          isGenerator = false,
          isAsync = false,
          startPos,
          startLoc;

      if (decorators.length) {
        prop.decorators = decorators;
        decorators = [];
      }

      if (this.match(_types.types.ellipsis)) {
        this.expectPlugin("objectRestSpread");
        prop = this.parseSpread(isPattern ? {
          start: 0
        } : undefined);

        if (isPattern) {
          this.toAssignable(prop, true, "object pattern");
        }

        node.properties.push(prop);

        if (isPattern) {
          const position = this.state.start;

          if (firstRestLocation !== null) {
            this.unexpected(firstRestLocation, "Cannot have multiple rest elements when destructuring");
          } else if (this.eat(_types.types.braceR)) {
            break;
          } else if (this.match(_types.types.comma) && this.lookahead().type === _types.types.braceR) {
            this.unexpected(position, "A trailing comma is not permitted after the rest element");
          } else {
            firstRestLocation = position;
            continue;
          }
        } else {
          continue;
        }
      }

      prop.method = false;

      if (isPattern || refShorthandDefaultPos) {
        startPos = this.state.start;
        startLoc = this.state.startLoc;
      }

      if (!isPattern) {
        isGenerator = this.eat(_types.types.star);
      }

      const containsEsc = this.state.containsEsc;

      if (!isPattern && this.isContextual("async")) {
        if (isGenerator) this.unexpected();
        const asyncId = this.parseIdentifier();

        if (this.match(_types.types.colon) || this.match(_types.types.parenL) || this.match(_types.types.braceR) || this.match(_types.types.eq) || this.match(_types.types.comma)) {
          prop.key = asyncId;
          prop.computed = false;
        } else {
          isAsync = true;

          if (this.match(_types.types.star)) {
            this.expectPlugin("asyncGenerators");
            this.next();
            isGenerator = true;
          }

          this.parsePropertyName(prop);
        }
      } else {
        this.parsePropertyName(prop);
      }

      this.parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos, containsEsc);
      this.checkPropClash(prop, propHash);

      if (prop.shorthand) {
        this.addExtra(prop, "shorthand", true);
      }

      node.properties.push(prop);
    }

    if (firstRestLocation !== null) {
      this.unexpected(firstRestLocation, "The rest element has to be the last element when destructuring");
    }

    if (decorators.length) {
      this.raise(this.state.start, "You have trailing decorators with no property");
    }

    return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
  }

  isGetterOrSetterMethod(prop, isPattern) {
    return !isPattern && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && (this.match(_types.types.string) || this.match(_types.types.num) || this.match(_types.types.bracketL) || this.match(_types.types.name) || !!this.state.type.keyword);
  }

  checkGetterSetterParams(method) {
    const paramCount = method.kind === "get" ? 0 : 1;
    const start = method.start;

    if (method.params.length !== paramCount) {
      if (method.kind === "get") {
        this.raise(start, "getter must not have any formal parameters");
      } else {
        this.raise(start, "setter must have exactly one formal parameter");
      }
    }

    if (method.kind === "set" && method.params[0].type === "RestElement") {
      this.raise(start, "setter function argument must not be a rest parameter");
    }
  }

  parseObjectMethod(prop, isGenerator, isAsync, isPattern, containsEsc) {
    if (isAsync || isGenerator || this.match(_types.types.parenL)) {
      if (isPattern) this.unexpected();
      prop.kind = "method";
      prop.method = true;
      return this.parseMethod(prop, isGenerator, isAsync, false, "ObjectMethod");
    }

    if (!containsEsc && this.isGetterOrSetterMethod(prop, isPattern)) {
      if (isGenerator || isAsync) this.unexpected();
      prop.kind = prop.key.name;
      this.parsePropertyName(prop);
      this.parseMethod(prop, false, false, false, "ObjectMethod");
      this.checkGetterSetterParams(prop);
      return prop;
    }
  }

  parseObjectProperty(prop, startPos, startLoc, isPattern, refShorthandDefaultPos) {
    prop.shorthand = false;

    if (this.eat(_types.types.colon)) {
      prop.value = isPattern ? this.parseMaybeDefault(this.state.start, this.state.startLoc) : this.parseMaybeAssign(false, refShorthandDefaultPos);
      return this.finishNode(prop, "ObjectProperty");
    }

    if (!prop.computed && prop.key.type === "Identifier") {
      this.checkReservedWord(prop.key.name, prop.key.start, true, true);

      if (isPattern) {
        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key.__clone());
      } else if (this.match(_types.types.eq) && refShorthandDefaultPos) {
        if (!refShorthandDefaultPos.start) {
          refShorthandDefaultPos.start = this.state.start;
        }

        prop.value = this.parseMaybeDefault(startPos, startLoc, prop.key.__clone());
      } else {
        prop.value = prop.key.__clone();
      }

      prop.shorthand = true;
      return this.finishNode(prop, "ObjectProperty");
    }
  }

  parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos, containsEsc) {
    const node = this.parseObjectMethod(prop, isGenerator, isAsync, isPattern, containsEsc) || this.parseObjectProperty(prop, startPos, startLoc, isPattern, refShorthandDefaultPos);
    if (!node) this.unexpected();
    return node;
  }

  parsePropertyName(prop) {
    if (this.eat(_types.types.bracketL)) {
      prop.computed = true;
      prop.key = this.parseMaybeAssign();
      this.expect(_types.types.bracketR);
    } else {
      const oldInPropertyName = this.state.inPropertyName;
      this.state.inPropertyName = true;
      prop.key = this.match(_types.types.num) || this.match(_types.types.string) ? this.parseExprAtom() : this.parseMaybePrivateName();

      if (prop.key.type !== "PrivateName") {
        prop.computed = false;
      }

      this.state.inPropertyName = oldInPropertyName;
    }

    return prop.key;
  }

  initFunction(node, isAsync) {
    node.id = null;
    node.generator = false;
    node.async = !!isAsync;
  }

  parseMethod(node, isGenerator, isAsync, isConstructor, type) {
    const oldInFunc = this.state.inFunction;
    const oldInMethod = this.state.inMethod;
    const oldInGenerator = this.state.inGenerator;
    this.state.inFunction = true;
    this.state.inMethod = node.kind || true;
    this.state.inGenerator = isGenerator;
    this.initFunction(node, isAsync);
    node.generator = !!isGenerator;
    const allowModifiers = isConstructor;
    this.parseFunctionParams(node, allowModifiers);
    this.parseFunctionBodyAndFinish(node, type);
    this.state.inFunction = oldInFunc;
    this.state.inMethod = oldInMethod;
    this.state.inGenerator = oldInGenerator;
    return node;
  }

  parseArrowExpression(node, params, isAsync) {
    if (this.state.yieldInPossibleArrowParameters) {
      this.raise(this.state.yieldInPossibleArrowParameters.start, "yield is not allowed in the parameters of an arrow function" + " inside a generator");
    }

    const oldInFunc = this.state.inFunction;
    this.state.inFunction = true;
    this.initFunction(node, isAsync);
    if (params) this.setArrowFunctionParameters(node, params);
    const oldInGenerator = this.state.inGenerator;
    const oldMaybeInArrowParameters = this.state.maybeInArrowParameters;
    this.state.inGenerator = false;
    this.state.maybeInArrowParameters = false;
    this.parseFunctionBody(node, true);
    this.state.inGenerator = oldInGenerator;
    this.state.inFunction = oldInFunc;
    this.state.maybeInArrowParameters = oldMaybeInArrowParameters;
    return this.finishNode(node, "ArrowFunctionExpression");
  }

  setArrowFunctionParameters(node, params) {
    node.params = this.toAssignableList(params, true, "arrow function parameters");
  }

  isStrictBody(node) {
    const isBlockStatement = node.body.type === "BlockStatement";

    if (isBlockStatement && node.body.directives.length) {
      for (let _i2 = 0, _node$body$directives = node.body.directives; _i2 < _node$body$directives.length; _i2++) {
        const directive = _node$body$directives[_i2];

        if (directive.value.value === "use strict") {
          return true;
        }
      }
    }

    return false;
  }

  parseFunctionBodyAndFinish(node, type, allowExpressionBody) {
    this.parseFunctionBody(node, allowExpressionBody);
    this.finishNode(node, type);
  }

  parseFunctionBody(node, allowExpression) {
    const isExpression = allowExpression && !this.match(_types.types.braceL);
    const oldInParameters = this.state.inParameters;
    const oldInAsync = this.state.inAsync;
    this.state.inParameters = false;
    this.state.inAsync = node.async;

    if (isExpression) {
      node.body = this.parseMaybeAssign();
    } else {
      const oldInGen = this.state.inGenerator;
      const oldInFunc = this.state.inFunction;
      const oldLabels = this.state.labels;
      this.state.inGenerator = node.generator;
      this.state.inFunction = true;
      this.state.labels = [];
      node.body = this.parseBlock(true);
      this.state.inFunction = oldInFunc;
      this.state.inGenerator = oldInGen;
      this.state.labels = oldLabels;
    }

    this.state.inAsync = oldInAsync;
    this.checkFunctionNameAndParams(node, allowExpression);
    this.state.inParameters = oldInParameters;
  }

  checkFunctionNameAndParams(node, isArrowFunction) {
    const isStrict = this.isStrictBody(node);
    const checkLVal = this.state.strict || isStrict || isArrowFunction;
    const oldStrict = this.state.strict;
    if (isStrict) this.state.strict = isStrict;

    if (checkLVal) {
      const nameHash = Object.create(null);

      if (node.id) {
        this.checkLVal(node.id, true, undefined, "function name");
      }

      for (let _i3 = 0, _node$params = node.params; _i3 < _node$params.length; _i3++) {
        const param = _node$params[_i3];

        if (isStrict && param.type !== "Identifier") {
          this.raise(param.start, "Non-simple parameter in strict mode");
        }

        this.checkLVal(param, true, nameHash, "function parameter list");
      }
    }

    this.state.strict = oldStrict;
  }

  parseExprList(close, allowEmpty, refShorthandDefaultPos) {
    const elts = [];
    let first = true;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(_types.types.comma);
        if (this.eat(close)) break;
      }

      elts.push(this.parseExprListItem(allowEmpty, refShorthandDefaultPos));
    }

    return elts;
  }

  parseExprListItem(allowEmpty, refShorthandDefaultPos, refNeedsArrowPos, refTrailingCommaPos) {
    let elt;

    if (allowEmpty && this.match(_types.types.comma)) {
      elt = null;
    } else if (this.match(_types.types.ellipsis)) {
      const spreadNodeStartPos = this.state.start;
      const spreadNodeStartLoc = this.state.startLoc;
      elt = this.parseParenItem(this.parseSpread(refShorthandDefaultPos, refNeedsArrowPos), spreadNodeStartPos, spreadNodeStartLoc);

      if (refTrailingCommaPos && this.match(_types.types.comma)) {
        refTrailingCommaPos.start = this.state.start;
      }
    } else {
      elt = this.parseMaybeAssign(false, refShorthandDefaultPos, this.parseParenItem, refNeedsArrowPos);
    }

    return elt;
  }

  parseIdentifier(liberal) {
    const node = this.startNode();
    const name = this.parseIdentifierName(node.start, liberal);
    node.name = name;
    node.loc.identifierName = name;
    return this.finishNode(node, "Identifier");
  }

  parseIdentifierName(pos, liberal) {
    if (!liberal) {
      this.checkReservedWord(this.state.value, this.state.start, !!this.state.type.keyword, false);
    }

    let name;

    if (this.match(_types.types.name)) {
      name = this.state.value;
    } else if (this.state.type.keyword) {
      name = this.state.type.keyword;
    } else {
      throw this.unexpected();
    }

    if (!liberal && name === "await" && this.state.inAsync) {
      this.raise(pos, "invalid use of await inside of an async function");
    }

    this.next();
    return name;
  }

  checkReservedWord(word, startLoc, checkKeywords, isBinding) {
    if (this.state.strict && (_identifier.reservedWords.strict(word) || isBinding && _identifier.reservedWords.strictBind(word))) {
      this.raise(startLoc, word + " is a reserved word in strict mode");
    }

    if (this.state.inGenerator && word === "yield") {
      this.raise(startLoc, "yield is a reserved word inside generator functions");
    }

    if (this.state.inClassProperty && word === "arguments") {
      this.raise(startLoc, "'arguments' is not allowed in class field initializer");
    }

    if (this.isReservedWord(word) || checkKeywords && this.isKeyword(word)) {
      this.raise(startLoc, word + " is a reserved word");
    }
  }

  parseAwait(node) {
    if (!this.state.inAsync && (this.state.inFunction || !this.options.allowAwaitOutsideFunction)) {
      this.unexpected();
    }

    if (this.match(_types.types.star)) {
      this.raise(node.start, "await* has been removed from the async functions proposal. Use Promise.all() instead.");
    }

    node.argument = this.parseMaybeUnary();
    return this.finishNode(node, "AwaitExpression");
  }

  parseYield() {
    const node = this.startNode();

    if (this.state.inParameters) {
      this.raise(node.start, "yield is not allowed in generator parameters");
    }

    if (this.state.maybeInArrowParameters && !this.state.yieldInPossibleArrowParameters) {
      this.state.yieldInPossibleArrowParameters = node;
    }

    this.next();

    if (this.match(_types.types.semi) || this.canInsertSemicolon() || !this.match(_types.types.star) && !this.state.type.startsExpr) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = this.eat(_types.types.star);
      node.argument = this.parseMaybeAssign();
    }

    return this.finishNode(node, "YieldExpression");
  }

}

exports.default = ExpressionParser;