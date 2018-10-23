"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var N = _interopRequireWildcard(require("../types"));

var _types2 = require("../tokenizer/types");

var _expression = _interopRequireDefault(require("./expression"));

var _identifier = require("../util/identifier");

var _whitespace = require("../util/whitespace");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const empty = [];
const loopLabel = {
  kind: "loop"
},
      switchLabel = {
  kind: "switch"
};

class StatementParser extends _expression.default {
  parseTopLevel(file, program) {
    program.sourceType = this.options.sourceType;
    program.interpreter = this.parseInterpreterDirective();
    this.parseBlockBody(program, true, true, _types2.types.eof);
    file.program = this.finishNode(program, "Program");
    file.comments = this.state.comments;
    if (this.options.tokens) file.tokens = this.state.tokens;
    return this.finishNode(file, "File");
  }

  stmtToDirective(stmt) {
    const expr = stmt.expression;
    const directiveLiteral = this.startNodeAt(expr.start, expr.loc.start);
    const directive = this.startNodeAt(stmt.start, stmt.loc.start);
    const raw = this.input.slice(expr.start, expr.end);
    const val = directiveLiteral.value = raw.slice(1, -1);
    this.addExtra(directiveLiteral, "raw", raw);
    this.addExtra(directiveLiteral, "rawValue", val);
    directive.value = this.finishNodeAt(directiveLiteral, "DirectiveLiteral", expr.end, expr.loc.end);
    return this.finishNodeAt(directive, "Directive", stmt.end, stmt.loc.end);
  }

  parseInterpreterDirective() {
    if (!this.match(_types2.types.interpreterDirective)) {
      return null;
    }

    const node = this.startNode();
    node.value = this.state.value;
    this.next();
    return this.finishNode(node, "InterpreterDirective");
  }

  parseStatement(declaration, topLevel) {
    if (this.match(_types2.types.at)) {
      this.parseDecorators(true);
    }

    return this.parseStatementContent(declaration, topLevel);
  }

  parseStatementContent(declaration, topLevel) {
    const starttype = this.state.type;
    const node = this.startNode();

    switch (starttype) {
      case _types2.types._break:
      case _types2.types._continue:
        return this.parseBreakContinueStatement(node, starttype.keyword);

      case _types2.types._debugger:
        return this.parseDebuggerStatement(node);

      case _types2.types._do:
        return this.parseDoStatement(node);

      case _types2.types._for:
        return this.parseForStatement(node);

      case _types2.types._function:
        if (this.lookahead().type === _types2.types.dot) break;
        if (!declaration) this.unexpected();
        return this.parseFunctionStatement(node);

      case _types2.types._class:
        if (!declaration) this.unexpected();
        return this.parseClass(node, true);

      case _types2.types._if:
        return this.parseIfStatement(node);

      case _types2.types._return:
        return this.parseReturnStatement(node);

      case _types2.types._switch:
        return this.parseSwitchStatement(node);

      case _types2.types._throw:
        return this.parseThrowStatement(node);

      case _types2.types._try:
        return this.parseTryStatement(node);

      case _types2.types._let:
      case _types2.types._const:
        if (!declaration) this.unexpected();

      case _types2.types._var:
        return this.parseVarStatement(node, starttype);

      case _types2.types._while:
        return this.parseWhileStatement(node);

      case _types2.types._with:
        return this.parseWithStatement(node);

      case _types2.types.braceL:
        return this.parseBlock();

      case _types2.types.semi:
        return this.parseEmptyStatement(node);

      case _types2.types._export:
      case _types2.types._import:
        {
          const nextToken = this.lookahead();

          if (nextToken.type === _types2.types.parenL || nextToken.type === _types2.types.dot) {
            break;
          }

          if (!this.options.allowImportExportEverywhere && !topLevel) {
            this.raise(this.state.start, "'import' and 'export' may only appear at the top level");
          }

          this.next();
          let result;

          if (starttype == _types2.types._import) {
            result = this.parseImport(node);

            if (result.type === "ImportDeclaration" && (!result.importKind || result.importKind === "value")) {
              this.sawUnambiguousESM = true;
            }
          } else {
            result = this.parseExport(node);

            if (result.type === "ExportNamedDeclaration" && (!result.exportKind || result.exportKind === "value") || result.type === "ExportAllDeclaration" && (!result.exportKind || result.exportKind === "value") || result.type === "ExportDefaultDeclaration") {
              this.sawUnambiguousESM = true;
            }
          }

          this.assertModuleNodeAllowed(node);
          return result;
        }

      case _types2.types.name:
        if (this.isContextual("async")) {
          const state = this.state.clone();
          this.next();

          if (this.match(_types2.types._function) && !this.canInsertSemicolon()) {
            this.expect(_types2.types._function);
            return this.parseFunction(node, true, false, true);
          } else {
            this.state = state;
          }
        }

    }

    const maybeName = this.state.value;
    const expr = this.parseExpression();

    if (starttype === _types2.types.name && expr.type === "Identifier" && this.eat(_types2.types.colon)) {
      return this.parseLabeledStatement(node, maybeName, expr);
    } else {
      return this.parseExpressionStatement(node, expr);
    }
  }

  assertModuleNodeAllowed(node) {
    if (!this.options.allowImportExportEverywhere && !this.inModule) {
      this.raise(node.start, `'import' and 'export' may appear only with 'sourceType: "module"'`, {
        code: "BABEL_PARSER_SOURCETYPE_MODULE_REQUIRED"
      });
    }
  }

  takeDecorators(node) {
    const decorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];

    if (decorators.length) {
      node.decorators = decorators;
      this.resetStartLocationFromNode(node, decorators[0]);
      this.state.decoratorStack[this.state.decoratorStack.length - 1] = [];
    }
  }

  canHaveLeadingDecorator() {
    return this.match(_types2.types._class);
  }

  parseDecorators(allowExport) {
    const currentContextDecorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];

    while (this.match(_types2.types.at)) {
      const decorator = this.parseDecorator();
      currentContextDecorators.push(decorator);
    }

    if (this.match(_types2.types._export)) {
      if (!allowExport) {
        this.unexpected();
      }

      if (this.hasPlugin("decorators") && !this.getPluginOption("decorators", "decoratorsBeforeExport")) {
        this.raise(this.state.start, "Using the export keyword between a decorator and a class is not allowed. " + "Please use `export @dec class` instead.");
      }
    } else if (!this.canHaveLeadingDecorator()) {
      this.raise(this.state.start, "Leading decorators must be attached to a class declaration");
    }
  }

  parseDecorator() {
    this.expectOnePlugin(["decorators-legacy", "decorators"]);
    const node = this.startNode();
    this.next();

    if (this.hasPlugin("decorators")) {
      this.state.decoratorStack.push([]);
      const startPos = this.state.start;
      const startLoc = this.state.startLoc;
      let expr;

      if (this.eat(_types2.types.parenL)) {
        expr = this.parseExpression();
        this.expect(_types2.types.parenR);
      } else {
        expr = this.parseIdentifier(false);

        while (this.eat(_types2.types.dot)) {
          const node = this.startNodeAt(startPos, startLoc);
          node.object = expr;
          node.property = this.parseIdentifier(true);
          node.computed = false;
          expr = this.finishNode(node, "MemberExpression");
        }
      }

      node.expression = this.parseMaybeDecoratorArguments(expr);
      this.state.decoratorStack.pop();
    } else {
      node.expression = this.parseMaybeAssign();
    }

    return this.finishNode(node, "Decorator");
  }

  parseMaybeDecoratorArguments(expr) {
    if (this.eat(_types2.types.parenL)) {
      const node = this.startNodeAtNode(expr);
      node.callee = expr;
      node.arguments = this.parseCallExpressionArguments(_types2.types.parenR, false);
      this.toReferencedList(node.arguments);
      return this.finishNode(node, "CallExpression");
    }

    return expr;
  }

  parseBreakContinueStatement(node, keyword) {
    const isBreak = keyword === "break";
    this.next();

    if (this.isLineTerminator()) {
      node.label = null;
    } else if (!this.match(_types2.types.name)) {
      this.unexpected();
    } else {
      node.label = this.parseIdentifier();
      this.semicolon();
    }

    let i;

    for (i = 0; i < this.state.labels.length; ++i) {
      const lab = this.state.labels[i];

      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) break;
        if (node.label && isBreak) break;
      }
    }

    if (i === this.state.labels.length) {
      this.raise(node.start, "Unsyntactic " + keyword);
    }

    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
  }

  parseDebuggerStatement(node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement");
  }

  parseDoStatement(node) {
    this.next();
    this.state.labels.push(loopLabel);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    this.expect(_types2.types._while);
    node.test = this.parseParenExpression();
    this.eat(_types2.types.semi);
    return this.finishNode(node, "DoWhileStatement");
  }

  parseForStatement(node) {
    this.next();
    this.state.labels.push(loopLabel);
    let forAwait = false;

    if (this.state.inAsync && this.isContextual("await")) {
      this.expectPlugin("asyncGenerators");
      forAwait = true;
      this.next();
    }

    this.expect(_types2.types.parenL);

    if (this.match(_types2.types.semi)) {
      if (forAwait) {
        this.unexpected();
      }

      return this.parseFor(node, null);
    }

    if (this.match(_types2.types._var) || this.match(_types2.types._let) || this.match(_types2.types._const)) {
      const init = this.startNode();
      const varKind = this.state.type;
      this.next();
      this.parseVar(init, true, varKind);
      this.finishNode(init, "VariableDeclaration");

      if (this.match(_types2.types._in) || this.isContextual("of")) {
        if (init.declarations.length === 1) {
          const declaration = init.declarations[0];
          const isForInInitializer = varKind === _types2.types._var && declaration.init && declaration.id.type != "ObjectPattern" && declaration.id.type != "ArrayPattern" && !this.isContextual("of");

          if (this.state.strict && isForInInitializer) {
            this.raise(this.state.start, "for-in initializer in strict mode");
          } else if (isForInInitializer || !declaration.init) {
            return this.parseForIn(node, init, forAwait);
          }
        }
      }

      if (forAwait) {
        this.unexpected();
      }

      return this.parseFor(node, init);
    }

    const refShorthandDefaultPos = {
      start: 0
    };
    const init = this.parseExpression(true, refShorthandDefaultPos);

    if (this.match(_types2.types._in) || this.isContextual("of")) {
      const description = this.isContextual("of") ? "for-of statement" : "for-in statement";
      this.toAssignable(init, undefined, description);
      this.checkLVal(init, undefined, undefined, description);
      return this.parseForIn(node, init, forAwait);
    } else if (refShorthandDefaultPos.start) {
      this.unexpected(refShorthandDefaultPos.start);
    }

    if (forAwait) {
      this.unexpected();
    }

    return this.parseFor(node, init);
  }

  parseFunctionStatement(node) {
    this.next();
    return this.parseFunction(node, true);
  }

  parseIfStatement(node) {
    this.next();
    node.test = this.parseParenExpression();
    node.consequent = this.parseStatement(false);
    node.alternate = this.eat(_types2.types._else) ? this.parseStatement(false) : null;
    return this.finishNode(node, "IfStatement");
  }

  parseReturnStatement(node) {
    if (!this.state.inFunction && !this.options.allowReturnOutsideFunction) {
      this.raise(this.state.start, "'return' outside of function");
    }

    this.next();

    if (this.isLineTerminator()) {
      node.argument = null;
    } else {
      node.argument = this.parseExpression();
      this.semicolon();
    }

    return this.finishNode(node, "ReturnStatement");
  }

  parseSwitchStatement(node) {
    this.next();
    node.discriminant = this.parseParenExpression();
    const cases = node.cases = [];
    this.expect(_types2.types.braceL);
    this.state.labels.push(switchLabel);
    let cur;

    for (let sawDefault; !this.match(_types2.types.braceR);) {
      if (this.match(_types2.types._case) || this.match(_types2.types._default)) {
        const isCase = this.match(_types2.types._case);
        if (cur) this.finishNode(cur, "SwitchCase");
        cases.push(cur = this.startNode());
        cur.consequent = [];
        this.next();

        if (isCase) {
          cur.test = this.parseExpression();
        } else {
          if (sawDefault) {
            this.raise(this.state.lastTokStart, "Multiple default clauses");
          }

          sawDefault = true;
          cur.test = null;
        }

        this.expect(_types2.types.colon);
      } else {
        if (cur) {
          cur.consequent.push(this.parseStatement(true));
        } else {
          this.unexpected();
        }
      }
    }

    if (cur) this.finishNode(cur, "SwitchCase");
    this.next();
    this.state.labels.pop();
    return this.finishNode(node, "SwitchStatement");
  }

  parseThrowStatement(node) {
    this.next();

    if (_whitespace.lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start))) {
      this.raise(this.state.lastTokEnd, "Illegal newline after throw");
    }

    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement");
  }

  parseTryStatement(node) {
    this.next();
    node.block = this.parseBlock();
    node.handler = null;

    if (this.match(_types2.types._catch)) {
      const clause = this.startNode();
      this.next();

      if (this.match(_types2.types.parenL)) {
        this.expect(_types2.types.parenL);
        clause.param = this.parseBindingAtom();
        const clashes = Object.create(null);
        this.checkLVal(clause.param, true, clashes, "catch clause");
        this.expect(_types2.types.parenR);
      } else {
        this.expectPlugin("optionalCatchBinding");
        clause.param = null;
      }

      clause.body = this.parseBlock();
      node.handler = this.finishNode(clause, "CatchClause");
    }

    node.guardedHandlers = empty;
    node.finalizer = this.eat(_types2.types._finally) ? this.parseBlock() : null;

    if (!node.handler && !node.finalizer) {
      this.raise(node.start, "Missing catch or finally clause");
    }

    return this.finishNode(node, "TryStatement");
  }

  parseVarStatement(node, kind) {
    this.next();
    this.parseVar(node, false, kind);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration");
  }

  parseWhileStatement(node) {
    this.next();
    node.test = this.parseParenExpression();
    this.state.labels.push(loopLabel);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    return this.finishNode(node, "WhileStatement");
  }

  parseWithStatement(node) {
    if (this.state.strict) {
      this.raise(this.state.start, "'with' in strict mode");
    }

    this.next();
    node.object = this.parseParenExpression();
    node.body = this.parseStatement(false);
    return this.finishNode(node, "WithStatement");
  }

  parseEmptyStatement(node) {
    this.next();
    return this.finishNode(node, "EmptyStatement");
  }

  parseLabeledStatement(node, maybeName, expr) {
    for (let _i = 0, _this$state$labels = this.state.labels; _i < _this$state$labels.length; _i++) {
      const label = _this$state$labels[_i];

      if (label.name === maybeName) {
        this.raise(expr.start, `Label '${maybeName}' is already declared`);
      }
    }

    const kind = this.state.type.isLoop ? "loop" : this.match(_types2.types._switch) ? "switch" : null;

    for (let i = this.state.labels.length - 1; i >= 0; i--) {
      const label = this.state.labels[i];

      if (label.statementStart === node.start) {
        label.statementStart = this.state.start;
        label.kind = kind;
      } else {
        break;
      }
    }

    this.state.labels.push({
      name: maybeName,
      kind: kind,
      statementStart: this.state.start
    });
    node.body = this.parseStatement(true);

    if (node.body.type == "ClassDeclaration" || node.body.type == "VariableDeclaration" && node.body.kind !== "var" || node.body.type == "FunctionDeclaration" && (this.state.strict || node.body.generator || node.body.async)) {
      this.raise(node.body.start, "Invalid labeled declaration");
    }

    this.state.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement");
  }

  parseExpressionStatement(node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement");
  }

  parseBlock(allowDirectives) {
    const node = this.startNode();
    this.expect(_types2.types.braceL);
    this.parseBlockBody(node, allowDirectives, false, _types2.types.braceR);
    return this.finishNode(node, "BlockStatement");
  }

  isValidDirective(stmt) {
    return stmt.type === "ExpressionStatement" && stmt.expression.type === "StringLiteral" && !stmt.expression.extra.parenthesized;
  }

  parseBlockBody(node, allowDirectives, topLevel, end) {
    const body = node.body = [];
    const directives = node.directives = [];
    this.parseBlockOrModuleBlockBody(body, allowDirectives ? directives : undefined, topLevel, end);
  }

  parseBlockOrModuleBlockBody(body, directives, topLevel, end) {
    let parsedNonDirective = false;
    let oldStrict;
    let octalPosition;

    while (!this.eat(end)) {
      if (!parsedNonDirective && this.state.containsOctal && !octalPosition) {
        octalPosition = this.state.octalPosition;
      }

      const stmt = this.parseStatement(true, topLevel);

      if (directives && !parsedNonDirective && this.isValidDirective(stmt)) {
        const directive = this.stmtToDirective(stmt);
        directives.push(directive);

        if (oldStrict === undefined && directive.value.value === "use strict") {
          oldStrict = this.state.strict;
          this.setStrict(true);

          if (octalPosition) {
            this.raise(octalPosition, "Octal literal in strict mode");
          }
        }

        continue;
      }

      parsedNonDirective = true;
      body.push(stmt);
    }

    if (oldStrict === false) {
      this.setStrict(false);
    }
  }

  parseFor(node, init) {
    node.init = init;
    this.expect(_types2.types.semi);
    node.test = this.match(_types2.types.semi) ? null : this.parseExpression();
    this.expect(_types2.types.semi);
    node.update = this.match(_types2.types.parenR) ? null : this.parseExpression();
    this.expect(_types2.types.parenR);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    return this.finishNode(node, "ForStatement");
  }

  parseForIn(node, init, forAwait) {
    const type = this.match(_types2.types._in) ? "ForInStatement" : "ForOfStatement";

    if (forAwait) {
      this.eatContextual("of");
    } else {
      this.next();
    }

    if (type === "ForOfStatement") {
      node.await = !!forAwait;
    }

    node.left = init;
    node.right = this.parseExpression();
    this.expect(_types2.types.parenR);
    node.body = this.parseStatement(false);
    this.state.labels.pop();
    return this.finishNode(node, type);
  }

  parseVar(node, isFor, kind) {
    const declarations = node.declarations = [];
    node.kind = kind.keyword;

    for (;;) {
      const decl = this.startNode();
      this.parseVarHead(decl);

      if (this.eat(_types2.types.eq)) {
        decl.init = this.parseMaybeAssign(isFor);
      } else {
        if (kind === _types2.types._const && !(this.match(_types2.types._in) || this.isContextual("of"))) {
          if (!this.hasPlugin("typescript")) {
            this.unexpected();
          }
        } else if (decl.id.type !== "Identifier" && !(isFor && (this.match(_types2.types._in) || this.isContextual("of")))) {
          this.raise(this.state.lastTokEnd, "Complex binding patterns require an initialization value");
        }

        decl.init = null;
      }

      declarations.push(this.finishNode(decl, "VariableDeclarator"));
      if (!this.eat(_types2.types.comma)) break;
    }

    return node;
  }

  parseVarHead(decl) {
    decl.id = this.parseBindingAtom();
    this.checkLVal(decl.id, true, undefined, "variable declaration");
  }

  parseFunction(node, isStatement, allowExpressionBody, isAsync, optionalId) {
    const oldInFunc = this.state.inFunction;
    const oldInMethod = this.state.inMethod;
    const oldInGenerator = this.state.inGenerator;
    const oldInClassProperty = this.state.inClassProperty;
    this.state.inFunction = true;
    this.state.inMethod = false;
    this.state.inClassProperty = false;
    this.initFunction(node, isAsync);

    if (this.match(_types2.types.star)) {
      if (node.async) {
        this.expectPlugin("asyncGenerators");
      }

      node.generator = true;
      this.next();
    }

    if (isStatement && !optionalId && !this.match(_types2.types.name) && !this.match(_types2.types._yield)) {
      this.unexpected();
    }

    if (!isStatement) this.state.inGenerator = node.generator;

    if (this.match(_types2.types.name) || this.match(_types2.types._yield)) {
      node.id = this.parseBindingIdentifier();
    }

    if (isStatement) this.state.inGenerator = node.generator;
    this.parseFunctionParams(node);
    this.parseFunctionBodyAndFinish(node, isStatement ? "FunctionDeclaration" : "FunctionExpression", allowExpressionBody);
    this.state.inFunction = oldInFunc;
    this.state.inMethod = oldInMethod;
    this.state.inGenerator = oldInGenerator;
    this.state.inClassProperty = oldInClassProperty;
    return node;
  }

  parseFunctionParams(node, allowModifiers) {
    const oldInParameters = this.state.inParameters;
    this.state.inParameters = true;
    this.expect(_types2.types.parenL);
    node.params = this.parseBindingList(_types2.types.parenR, false, allowModifiers);
    this.state.inParameters = oldInParameters;
  }

  parseClass(node, isStatement, optionalId) {
    this.next();
    this.takeDecorators(node);
    this.parseClassId(node, isStatement, optionalId);
    this.parseClassSuper(node);
    this.parseClassBody(node);
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
  }

  isClassProperty() {
    return this.match(_types2.types.eq) || this.match(_types2.types.semi) || this.match(_types2.types.braceR);
  }

  isClassMethod() {
    return this.match(_types2.types.parenL);
  }

  isNonstaticConstructor(method) {
    return !method.computed && !method.static && (method.key.name === "constructor" || method.key.value === "constructor");
  }

  parseClassBody(node) {
    const oldStrict = this.state.strict;
    this.state.strict = true;
    this.state.classLevel++;
    const state = {
      hadConstructor: false
    };
    let decorators = [];
    const classBody = this.startNode();
    classBody.body = [];
    this.expect(_types2.types.braceL);

    while (!this.eat(_types2.types.braceR)) {
      if (this.eat(_types2.types.semi)) {
        if (decorators.length > 0) {
          this.raise(this.state.lastTokEnd, "Decorators must not be followed by a semicolon");
        }

        continue;
      }

      if (this.match(_types2.types.at)) {
        decorators.push(this.parseDecorator());
        continue;
      }

      const member = this.startNode();

      if (decorators.length) {
        member.decorators = decorators;
        this.resetStartLocationFromNode(member, decorators[0]);
        decorators = [];
      }

      this.parseClassMember(classBody, member, state);

      if (member.kind === "constructor" && member.decorators && member.decorators.length > 0) {
        this.raise(member.start, "Decorators can't be used with a constructor. Did you mean '@dec class { ... }'?");
      }
    }

    if (decorators.length) {
      this.raise(this.state.start, "You have trailing decorators with no method");
    }

    node.body = this.finishNode(classBody, "ClassBody");
    this.state.classLevel--;
    this.state.strict = oldStrict;
  }

  parseClassMember(classBody, member, state) {
    let isStatic = false;
    const containsEsc = this.state.containsEsc;

    if (this.match(_types2.types.name) && this.state.value === "static") {
      const key = this.parseIdentifier(true);

      if (this.isClassMethod()) {
        const method = member;
        method.kind = "method";
        method.computed = false;
        method.key = key;
        method.static = false;
        this.pushClassMethod(classBody, method, false, false, false);
        return;
      } else if (this.isClassProperty()) {
        const prop = member;
        prop.computed = false;
        prop.key = key;
        prop.static = false;
        classBody.body.push(this.parseClassProperty(prop));
        return;
      } else if (containsEsc) {
        throw this.unexpected();
      }

      isStatic = true;
    }

    this.parseClassMemberWithIsStatic(classBody, member, state, isStatic);
  }

  parseClassMemberWithIsStatic(classBody, member, state, isStatic) {
    const publicMethod = member;
    const privateMethod = member;
    const publicProp = member;
    const privateProp = member;
    const method = publicMethod;
    const publicMember = publicMethod;
    member.static = isStatic;

    if (this.eat(_types2.types.star)) {
      method.kind = "method";
      this.parseClassPropertyName(method);

      if (method.key.type === "PrivateName") {
        this.pushClassPrivateMethod(classBody, privateMethod, true, false);
        return;
      }

      if (this.isNonstaticConstructor(publicMethod)) {
        this.raise(publicMethod.key.start, "Constructor can't be a generator");
      }

      this.pushClassMethod(classBody, publicMethod, true, false, false);
      return;
    }

    const key = this.parseClassPropertyName(member);
    const isPrivate = key.type === "PrivateName";
    const isSimple = key.type === "Identifier";
    this.parsePostMemberNameModifiers(publicMember);

    if (this.isClassMethod()) {
      method.kind = "method";

      if (isPrivate) {
        this.pushClassPrivateMethod(classBody, privateMethod, false, false);
        return;
      }

      const isConstructor = this.isNonstaticConstructor(publicMethod);

      if (isConstructor) {
        publicMethod.kind = "constructor";

        if (publicMethod.decorators) {
          this.raise(publicMethod.start, "You can't attach decorators to a class constructor");
        }

        if (state.hadConstructor && !this.hasPlugin("typescript")) {
          this.raise(key.start, "Duplicate constructor in the same class");
        }

        state.hadConstructor = true;
      }

      this.pushClassMethod(classBody, publicMethod, false, false, isConstructor);
    } else if (this.isClassProperty()) {
      if (isPrivate) {
        this.pushClassPrivateProperty(classBody, privateProp);
      } else {
        this.pushClassProperty(classBody, publicProp);
      }
    } else if (isSimple && key.name === "async" && !this.isLineTerminator()) {
      const isGenerator = this.match(_types2.types.star);

      if (isGenerator) {
        this.expectPlugin("asyncGenerators");
        this.next();
      }

      method.kind = "method";
      this.parseClassPropertyName(method);

      if (method.key.type === "PrivateName") {
        this.pushClassPrivateMethod(classBody, privateMethod, isGenerator, true);
      } else {
        if (this.isNonstaticConstructor(publicMethod)) {
          this.raise(publicMethod.key.start, "Constructor can't be an async function");
        }

        this.pushClassMethod(classBody, publicMethod, isGenerator, true, false);
      }
    } else if (isSimple && (key.name === "get" || key.name === "set") && !(this.isLineTerminator() && this.match(_types2.types.star))) {
      method.kind = key.name;
      this.parseClassPropertyName(publicMethod);

      if (method.key.type === "PrivateName") {
        this.pushClassPrivateMethod(classBody, privateMethod, false, false);
      } else {
        if (this.isNonstaticConstructor(publicMethod)) {
          this.raise(publicMethod.key.start, "Constructor can't have get/set modifier");
        }

        this.pushClassMethod(classBody, publicMethod, false, false, false);
      }

      this.checkGetterSetterParams(publicMethod);
    } else if (this.isLineTerminator()) {
      if (isPrivate) {
        this.pushClassPrivateProperty(classBody, privateProp);
      } else {
        this.pushClassProperty(classBody, publicProp);
      }
    } else {
      this.unexpected();
    }
  }

  parseClassPropertyName(member) {
    const key = this.parsePropertyName(member);

    if (!member.computed && member.static && (key.name === "prototype" || key.value === "prototype")) {
      this.raise(key.start, "Classes may not have static property named prototype");
    }

    if (key.type === "PrivateName" && key.id.name === "constructor") {
      this.raise(key.start, "Classes may not have a private field named '#constructor'");
    }

    return key;
  }

  pushClassProperty(classBody, prop) {
    if (this.isNonstaticConstructor(prop)) {
      this.raise(prop.key.start, "Classes may not have a non-static field named 'constructor'");
    }

    classBody.body.push(this.parseClassProperty(prop));
  }

  pushClassPrivateProperty(classBody, prop) {
    this.expectPlugin("classPrivateProperties", prop.key.start);
    classBody.body.push(this.parseClassPrivateProperty(prop));
  }

  pushClassMethod(classBody, method, isGenerator, isAsync, isConstructor) {
    classBody.body.push(this.parseMethod(method, isGenerator, isAsync, isConstructor, "ClassMethod"));
  }

  pushClassPrivateMethod(classBody, method, isGenerator, isAsync) {
    this.expectPlugin("classPrivateMethods", method.key.start);
    classBody.body.push(this.parseMethod(method, isGenerator, isAsync, false, "ClassPrivateMethod"));
  }

  parsePostMemberNameModifiers(methodOrProp) {}

  parseAccessModifier() {
    return undefined;
  }

  parseClassPrivateProperty(node) {
    const oldInMethod = this.state.inMethod;
    this.state.inMethod = false;
    this.state.inClassProperty = true;
    node.value = this.eat(_types2.types.eq) ? this.parseMaybeAssign() : null;
    this.semicolon();
    this.state.inClassProperty = false;
    this.state.inMethod = oldInMethod;
    return this.finishNode(node, "ClassPrivateProperty");
  }

  parseClassProperty(node) {
    if (!node.typeAnnotation) {
      this.expectPlugin("classProperties");
    }

    const oldInMethod = this.state.inMethod;
    this.state.inMethod = false;
    this.state.inClassProperty = true;

    if (this.match(_types2.types.eq)) {
      this.expectPlugin("classProperties");
      this.next();
      node.value = this.parseMaybeAssign();
    } else {
      node.value = null;
    }

    this.semicolon();
    this.state.inClassProperty = false;
    this.state.inMethod = oldInMethod;
    return this.finishNode(node, "ClassProperty");
  }

  parseClassId(node, isStatement, optionalId) {
    if (this.match(_types2.types.name)) {
      node.id = this.parseIdentifier();
    } else {
      if (optionalId || !isStatement) {
        node.id = null;
      } else {
        this.unexpected(null, "A class name is required");
      }
    }
  }

  parseClassSuper(node) {
    node.superClass = this.eat(_types2.types._extends) ? this.parseExprSubscripts() : null;
  }

  parseExport(node) {
    if (this.shouldParseExportStar()) {
      this.parseExportStar(node);
      if (node.type === "ExportAllDeclaration") return node;
    } else if (this.isExportDefaultSpecifier()) {
      this.expectPlugin("exportDefaultFrom");
      const specifier = this.startNode();
      specifier.exported = this.parseIdentifier(true);
      const specifiers = [this.finishNode(specifier, "ExportDefaultSpecifier")];
      node.specifiers = specifiers;

      if (this.match(_types2.types.comma) && this.lookahead().type === _types2.types.star) {
        this.expect(_types2.types.comma);
        const specifier = this.startNode();
        this.expect(_types2.types.star);
        this.expectContextual("as");
        specifier.exported = this.parseIdentifier();
        specifiers.push(this.finishNode(specifier, "ExportNamespaceSpecifier"));
      } else {
        this.parseExportSpecifiersMaybe(node);
      }

      this.parseExportFrom(node, true);
    } else if (this.eat(_types2.types._default)) {
      node.declaration = this.parseExportDefaultExpression();
      this.checkExport(node, true, true);
      return this.finishNode(node, "ExportDefaultDeclaration");
    } else if (this.shouldParseExportDeclaration()) {
      if (this.isContextual("async")) {
        const next = this.lookahead();

        if (next.type !== _types2.types._function) {
          this.unexpected(next.start, `Unexpected token, expected "function"`);
        }
      }

      node.specifiers = [];
      node.source = null;
      node.declaration = this.parseExportDeclaration(node);
    } else {
      node.declaration = null;
      node.specifiers = this.parseExportSpecifiers();
      this.parseExportFrom(node);
    }

    this.checkExport(node, true);
    return this.finishNode(node, "ExportNamedDeclaration");
  }

  isAsyncFunction() {
    if (!this.isContextual("async")) return false;
    const {
      input,
      pos
    } = this.state;
    _whitespace.skipWhiteSpace.lastIndex = pos;

    const skip = _whitespace.skipWhiteSpace.exec(input);

    if (!skip || !skip.length) return false;
    const next = pos + skip[0].length;
    return !_whitespace.lineBreak.test(input.slice(pos, next)) && input.slice(next, next + 8) === "function" && (next + 8 === input.length || !(0, _identifier.isIdentifierChar)(input.charAt(next + 8)));
  }

  parseExportDefaultExpression() {
    const expr = this.startNode();
    const isAsync = this.isAsyncFunction();

    if (this.eat(_types2.types._function) || isAsync) {
      if (isAsync) {
        this.eatContextual("async");
        this.expect(_types2.types._function);
      }

      return this.parseFunction(expr, true, false, isAsync, true);
    } else if (this.match(_types2.types._class)) {
      return this.parseClass(expr, true, true);
    } else if (this.match(_types2.types.at)) {
      if (this.hasPlugin("decorators") && this.getPluginOption("decorators", "decoratorsBeforeExport")) {
        this.unexpected(this.state.start, "Decorators must be placed *before* the 'export' keyword." + " You can set the 'decoratorsBeforeExport' option to false to use" + " the 'export @decorator class {}' syntax");
      }

      this.parseDecorators(false);
      return this.parseClass(expr, true, true);
    } else if (this.match(_types2.types._let) || this.match(_types2.types._const) || this.match(_types2.types._var)) {
      return this.raise(this.state.start, "Only expressions, functions or classes are allowed as the `default` export.");
    } else {
      const res = this.parseMaybeAssign();
      this.semicolon();
      return res;
    }
  }

  parseExportDeclaration(node) {
    return this.parseStatement(true);
  }

  isExportDefaultSpecifier() {
    if (this.match(_types2.types.name)) {
      return this.state.value !== "async";
    }

    if (!this.match(_types2.types._default)) {
      return false;
    }

    const lookahead = this.lookahead();
    return lookahead.type === _types2.types.comma || lookahead.type === _types2.types.name && lookahead.value === "from";
  }

  parseExportSpecifiersMaybe(node) {
    if (this.eat(_types2.types.comma)) {
      node.specifiers = node.specifiers.concat(this.parseExportSpecifiers());
    }
  }

  parseExportFrom(node, expect) {
    if (this.eatContextual("from")) {
      node.source = this.match(_types2.types.string) ? this.parseExprAtom() : this.unexpected();
      this.checkExport(node);
    } else {
      if (expect) {
        this.unexpected();
      } else {
        node.source = null;
      }
    }

    this.semicolon();
  }

  shouldParseExportStar() {
    return this.match(_types2.types.star);
  }

  parseExportStar(node) {
    this.expect(_types2.types.star);

    if (this.isContextual("as")) {
      this.parseExportNamespace(node);
    } else {
      this.parseExportFrom(node, true);
      this.finishNode(node, "ExportAllDeclaration");
    }
  }

  parseExportNamespace(node) {
    this.expectPlugin("exportNamespaceFrom");
    const specifier = this.startNodeAt(this.state.lastTokStart, this.state.lastTokStartLoc);
    this.next();
    specifier.exported = this.parseIdentifier(true);
    node.specifiers = [this.finishNode(specifier, "ExportNamespaceSpecifier")];
    this.parseExportSpecifiersMaybe(node);
    this.parseExportFrom(node, true);
  }

  shouldParseExportDeclaration() {
    if (this.match(_types2.types.at)) {
      this.expectOnePlugin(["decorators", "decorators-legacy"]);

      if (this.hasPlugin("decorators")) {
        if (this.getPluginOption("decorators", "decoratorsBeforeExport")) {
          this.unexpected(this.state.start, "Decorators must be placed *before* the 'export' keyword." + " You can set the 'decoratorsBeforeExport' option to false to use" + " the 'export @decorator class {}' syntax");
        } else {
          return true;
        }
      }
    }

    return this.state.type.keyword === "var" || this.state.type.keyword === "const" || this.state.type.keyword === "let" || this.state.type.keyword === "function" || this.state.type.keyword === "class" || this.isAsyncFunction();
  }

  checkExport(node, checkNames, isDefault) {
    if (checkNames) {
      if (isDefault) {
        this.checkDuplicateExports(node, "default");
      } else if (node.specifiers && node.specifiers.length) {
        for (let _i2 = 0, _node$specifiers = node.specifiers; _i2 < _node$specifiers.length; _i2++) {
          const specifier = _node$specifiers[_i2];
          this.checkDuplicateExports(specifier, specifier.exported.name);
        }
      } else if (node.declaration) {
        if (node.declaration.type === "FunctionDeclaration" || node.declaration.type === "ClassDeclaration") {
          const id = node.declaration.id;
          if (!id) throw new Error("Assertion failure");
          this.checkDuplicateExports(node, id.name);
        } else if (node.declaration.type === "VariableDeclaration") {
          for (let _i3 = 0, _node$declaration$dec = node.declaration.declarations; _i3 < _node$declaration$dec.length; _i3++) {
            const declaration = _node$declaration$dec[_i3];
            this.checkDeclaration(declaration.id);
          }
        }
      }
    }

    const currentContextDecorators = this.state.decoratorStack[this.state.decoratorStack.length - 1];

    if (currentContextDecorators.length) {
      const isClass = node.declaration && (node.declaration.type === "ClassDeclaration" || node.declaration.type === "ClassExpression");

      if (!node.declaration || !isClass) {
        throw this.raise(node.start, "You can only use decorators on an export when exporting a class");
      }

      this.takeDecorators(node.declaration);
    }
  }

  checkDeclaration(node) {
    if (node.type === "ObjectPattern") {
      for (let _i4 = 0, _node$properties = node.properties; _i4 < _node$properties.length; _i4++) {
        const prop = _node$properties[_i4];
        this.checkDeclaration(prop);
      }
    } else if (node.type === "ArrayPattern") {
      for (let _i5 = 0, _node$elements = node.elements; _i5 < _node$elements.length; _i5++) {
        const elem = _node$elements[_i5];

        if (elem) {
          this.checkDeclaration(elem);
        }
      }
    } else if (node.type === "ObjectProperty") {
      this.checkDeclaration(node.value);
    } else if (node.type === "RestElement") {
      this.checkDeclaration(node.argument);
    } else if (node.type === "Identifier") {
      this.checkDuplicateExports(node, node.name);
    }
  }

  checkDuplicateExports(node, name) {
    if (this.state.exportedIdentifiers.indexOf(name) > -1) {
      this.raiseDuplicateExportError(node, name);
    }

    this.state.exportedIdentifiers.push(name);
  }

  raiseDuplicateExportError(node, name) {
    throw this.raise(node.start, name === "default" ? "Only one default export allowed per module." : `\`${name}\` has already been exported. Exported identifiers must be unique.`);
  }

  parseExportSpecifiers() {
    const nodes = [];
    let first = true;
    let needsFrom;
    this.expect(_types2.types.braceL);

    while (!this.eat(_types2.types.braceR)) {
      if (first) {
        first = false;
      } else {
        this.expect(_types2.types.comma);
        if (this.eat(_types2.types.braceR)) break;
      }

      const isDefault = this.match(_types2.types._default);
      if (isDefault && !needsFrom) needsFrom = true;
      const node = this.startNode();
      node.local = this.parseIdentifier(isDefault);
      node.exported = this.eatContextual("as") ? this.parseIdentifier(true) : node.local.__clone();
      nodes.push(this.finishNode(node, "ExportSpecifier"));
    }

    if (needsFrom && !this.isContextual("from")) {
      this.unexpected();
    }

    return nodes;
  }

  parseImport(node) {
    if (this.match(_types2.types.string)) {
      node.specifiers = [];
      node.source = this.parseExprAtom();
    } else {
      node.specifiers = [];
      this.parseImportSpecifiers(node);
      this.expectContextual("from");
      node.source = this.match(_types2.types.string) ? this.parseExprAtom() : this.unexpected();
    }

    this.semicolon();
    return this.finishNode(node, "ImportDeclaration");
  }

  shouldParseDefaultImport(node) {
    return this.match(_types2.types.name);
  }

  parseImportSpecifierLocal(node, specifier, type, contextDescription) {
    specifier.local = this.parseIdentifier();
    this.checkLVal(specifier.local, true, undefined, contextDescription);
    node.specifiers.push(this.finishNode(specifier, type));
  }

  parseImportSpecifiers(node) {
    let first = true;

    if (this.shouldParseDefaultImport(node)) {
      this.parseImportSpecifierLocal(node, this.startNode(), "ImportDefaultSpecifier", "default import specifier");
      if (!this.eat(_types2.types.comma)) return;
    }

    if (this.match(_types2.types.star)) {
      const specifier = this.startNode();
      this.next();
      this.expectContextual("as");
      this.parseImportSpecifierLocal(node, specifier, "ImportNamespaceSpecifier", "import namespace specifier");
      return;
    }

    this.expect(_types2.types.braceL);

    while (!this.eat(_types2.types.braceR)) {
      if (first) {
        first = false;
      } else {
        if (this.eat(_types2.types.colon)) {
          this.unexpected(null, "ES2015 named imports do not destructure. " + "Use another statement for destructuring after the import.");
        }

        this.expect(_types2.types.comma);
        if (this.eat(_types2.types.braceR)) break;
      }

      this.parseImportSpecifier(node);
    }
  }

  parseImportSpecifier(node) {
    const specifier = this.startNode();
    specifier.imported = this.parseIdentifier(true);

    if (this.eatContextual("as")) {
      specifier.local = this.parseIdentifier();
    } else {
      this.checkReservedWord(specifier.imported.name, specifier.start, true, true);
      specifier.local = specifier.imported.__clone();
    }

    this.checkLVal(specifier.local, true, undefined, "import specifier");
    node.specifiers.push(this.finishNode(specifier, "ImportSpecifier"));
  }

}

exports.default = StatementParser;