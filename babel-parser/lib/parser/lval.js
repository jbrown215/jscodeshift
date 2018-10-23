"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _types = require("../tokenizer/types");

var _node = require("./node");

class LValParser extends _node.NodeUtils {
  toAssignable(node, isBinding, contextDescription) {
    if (node) {
      switch (node.type) {
        case "Identifier":
        case "ObjectPattern":
        case "ArrayPattern":
        case "AssignmentPattern":
          break;

        case "ObjectExpression":
          node.type = "ObjectPattern";

          for (let index = 0; index < node.properties.length; index++) {
            const prop = node.properties[index];
            const isLast = index === node.properties.length - 1;
            this.toAssignableObjectExpressionProp(prop, isBinding, isLast);
          }

          break;

        case "ObjectProperty":
          this.toAssignable(node.value, isBinding, contextDescription);
          break;

        case "SpreadElement":
          {
            this.checkToRestConversion(node);
            node.type = "RestElement";
            const arg = node.argument;
            this.toAssignable(arg, isBinding, contextDescription);
            break;
          }

        case "ArrayExpression":
          node.type = "ArrayPattern";
          this.toAssignableList(node.elements, isBinding, contextDescription);
          break;

        case "AssignmentExpression":
          if (node.operator === "=") {
            node.type = "AssignmentPattern";
            delete node.operator;
          } else {
            this.raise(node.left.end, "Only '=' operator can be used for specifying default value.");
          }

          break;

        case "MemberExpression":
          if (!isBinding) break;

        default:
          {
            const message = "Invalid left-hand side" + (contextDescription ? " in " + contextDescription : "expression");
            this.raise(node.start, message);
          }
      }
    }

    return node;
  }

  toAssignableObjectExpressionProp(prop, isBinding, isLast) {
    if (prop.type === "ObjectMethod") {
      const error = prop.kind === "get" || prop.kind === "set" ? "Object pattern can't contain getter or setter" : "Object pattern can't contain methods";
      this.raise(prop.key.start, error);
    } else if (prop.type === "SpreadElement" && !isLast) {
      this.raise(prop.start, "The rest element has to be the last element when destructuring");
    } else {
      this.toAssignable(prop, isBinding, "object destructuring pattern");
    }
  }

  toAssignableList(exprList, isBinding, contextDescription) {
    let end = exprList.length;

    if (end) {
      const last = exprList[end - 1];

      if (last && last.type === "RestElement") {
        --end;
      } else if (last && last.type === "SpreadElement") {
        last.type = "RestElement";
        const arg = last.argument;
        this.toAssignable(arg, isBinding, contextDescription);

        if (["Identifier", "MemberExpression", "ArrayPattern", "ObjectPattern"].indexOf(arg.type) === -1) {
          this.unexpected(arg.start);
        }

        --end;
      }
    }

    for (let i = 0; i < end; i++) {
      const elt = exprList[i];

      if (elt && elt.type === "SpreadElement") {
        this.raise(elt.start, "The rest element has to be the last element when destructuring");
      }

      if (elt) this.toAssignable(elt, isBinding, contextDescription);
    }

    return exprList;
  }

  toReferencedList(exprList) {
    return exprList;
  }

  parseSpread(refShorthandDefaultPos, refNeedsArrowPos) {
    const node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refShorthandDefaultPos, undefined, refNeedsArrowPos);
    return this.finishNode(node, "SpreadElement");
  }

  parseRest() {
    const node = this.startNode();
    this.next();
    node.argument = this.parseBindingAtom();
    return this.finishNode(node, "RestElement");
  }

  shouldAllowYieldIdentifier() {
    return this.match(_types.types._yield) && !this.state.strict && !this.state.inGenerator;
  }

  parseBindingIdentifier() {
    return this.parseIdentifier(this.shouldAllowYieldIdentifier());
  }

  parseBindingAtom() {
    switch (this.state.type) {
      case _types.types._yield:
      case _types.types.name:
        return this.parseBindingIdentifier();

      case _types.types.bracketL:
        {
          const node = this.startNode();
          this.next();
          node.elements = this.parseBindingList(_types.types.bracketR, true);
          return this.finishNode(node, "ArrayPattern");
        }

      case _types.types.braceL:
        return this.parseObj(true);

      default:
        throw this.unexpected();
    }
  }

  parseBindingList(close, allowEmpty, allowModifiers) {
    const elts = [];
    let first = true;

    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(_types.types.comma);
      }

      if (allowEmpty && this.match(_types.types.comma)) {
        elts.push(null);
      } else if (this.eat(close)) {
        break;
      } else if (this.match(_types.types.ellipsis)) {
        elts.push(this.parseAssignableListItemTypes(this.parseRest()));
        this.expect(close);
        break;
      } else {
        const decorators = [];

        if (this.match(_types.types.at) && this.hasPlugin("decorators")) {
          this.raise(this.state.start, "Stage 2 decorators cannot be used to decorate parameters");
        }

        while (this.match(_types.types.at)) {
          decorators.push(this.parseDecorator());
        }

        elts.push(this.parseAssignableListItem(allowModifiers, decorators));
      }
    }

    return elts;
  }

  parseAssignableListItem(allowModifiers, decorators) {
    const left = this.parseMaybeDefault();
    this.parseAssignableListItemTypes(left);
    const elt = this.parseMaybeDefault(left.start, left.loc.start, left);

    if (decorators.length) {
      left.decorators = decorators;
    }

    return elt;
  }

  parseAssignableListItemTypes(param) {
    return param;
  }

  parseMaybeDefault(startPos, startLoc, left) {
    startLoc = startLoc || this.state.startLoc;
    startPos = startPos || this.state.start;
    left = left || this.parseBindingAtom();
    if (!this.eat(_types.types.eq)) return left;
    const node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern");
  }

  checkLVal(expr, isBinding, checkClashes, contextDescription) {
    switch (expr.type) {
      case "Identifier":
        this.checkReservedWord(expr.name, expr.start, false, true);

        if (checkClashes) {
          const key = `_${expr.name}`;

          if (checkClashes[key]) {
            this.raise(expr.start, "Argument name clash in strict mode");
          } else {
            checkClashes[key] = true;
          }
        }

        break;

      case "MemberExpression":
        if (isBinding) this.raise(expr.start, "Binding member expression");
        break;

      case "ObjectPattern":
        for (let _i = 0, _expr$properties = expr.properties; _i < _expr$properties.length; _i++) {
          let prop = _expr$properties[_i];
          if (prop.type === "ObjectProperty") prop = prop.value;
          this.checkLVal(prop, isBinding, checkClashes, "object destructuring pattern");
        }

        break;

      case "ArrayPattern":
        for (let _i2 = 0, _expr$elements = expr.elements; _i2 < _expr$elements.length; _i2++) {
          const elem = _expr$elements[_i2];

          if (elem) {
            this.checkLVal(elem, isBinding, checkClashes, "array destructuring pattern");
          }
        }

        break;

      case "AssignmentPattern":
        this.checkLVal(expr.left, isBinding, checkClashes, "assignment pattern");
        break;

      case "RestElement":
        this.checkLVal(expr.argument, isBinding, checkClashes, "rest element");
        break;

      default:
        {
          const message = (isBinding ? "Binding invalid" : "Invalid") + " left-hand side" + (contextDescription ? " in " + contextDescription : "expression");
          this.raise(expr.start, message);
        }
    }
  }

  checkToRestConversion(node) {
    const validArgumentTypes = ["Identifier", "MemberExpression"];

    if (validArgumentTypes.indexOf(node.argument.type) !== -1) {
      return;
    }

    this.raise(node.argument.start, "Invalid rest operator's argument");
  }

}

exports.default = LValParser;