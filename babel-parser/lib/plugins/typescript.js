"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _types = require("../tokenizer/types");

var _context = require("../tokenizer/context");

var N = _interopRequireWildcard(require("../types"));

var _parser = _interopRequireDefault(require("../parser"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function nonNull(x) {
  if (x == null) {
    throw new Error(`Unexpected ${x} value.`);
  }

  return x;
}

function assert(x) {
  if (!x) {
    throw new Error("Assert fail");
  }
}

function keywordTypeFromName(value) {
  switch (value) {
    case "any":
      return "TSAnyKeyword";

    case "boolean":
      return "TSBooleanKeyword";

    case "never":
      return "TSNeverKeyword";

    case "number":
      return "TSNumberKeyword";

    case "object":
      return "TSObjectKeyword";

    case "string":
      return "TSStringKeyword";

    case "symbol":
      return "TSSymbolKeyword";

    case "undefined":
      return "TSUndefinedKeyword";

    case "unknown":
      return "TSUnknownKeyword";

    default:
      return undefined;
  }
}

var _default = superClass => class extends superClass {
  tsIsIdentifier() {
    return this.match(_types.types.name);
  }

  tsNextTokenCanFollowModifier() {
    this.next();
    return !this.hasPrecedingLineBreak() && !this.match(_types.types.parenL) && !this.match(_types.types.parenR) && !this.match(_types.types.colon) && !this.match(_types.types.eq) && !this.match(_types.types.question);
  }

  tsParseModifier(allowedModifiers) {
    if (!this.match(_types.types.name)) {
      return undefined;
    }

    const modifier = this.state.value;

    if (allowedModifiers.indexOf(modifier) !== -1 && this.tsTryParse(this.tsNextTokenCanFollowModifier.bind(this))) {
      return modifier;
    }

    return undefined;
  }

  tsIsListTerminator(kind) {
    switch (kind) {
      case "EnumMembers":
      case "TypeMembers":
        return this.match(_types.types.braceR);

      case "HeritageClauseElement":
        return this.match(_types.types.braceL);

      case "TupleElementTypes":
        return this.match(_types.types.bracketR);

      case "TypeParametersOrArguments":
        return this.isRelational(">");
    }

    throw new Error("Unreachable");
  }

  tsParseList(kind, parseElement) {
    const result = [];

    while (!this.tsIsListTerminator(kind)) {
      result.push(parseElement());
    }

    return result;
  }

  tsParseDelimitedList(kind, parseElement) {
    return nonNull(this.tsParseDelimitedListWorker(kind, parseElement, true));
  }

  tsTryParseDelimitedList(kind, parseElement) {
    return this.tsParseDelimitedListWorker(kind, parseElement, false);
  }

  tsParseDelimitedListWorker(kind, parseElement, expectSuccess) {
    const result = [];

    while (true) {
      if (this.tsIsListTerminator(kind)) {
        break;
      }

      const element = parseElement();

      if (element == null) {
        return undefined;
      }

      result.push(element);

      if (this.eat(_types.types.comma)) {
        continue;
      }

      if (this.tsIsListTerminator(kind)) {
        break;
      }

      if (expectSuccess) {
        this.expect(_types.types.comma);
      }

      return undefined;
    }

    return result;
  }

  tsParseBracketedList(kind, parseElement, bracket, skipFirstToken) {
    if (!skipFirstToken) {
      if (bracket) {
        this.expect(_types.types.bracketL);
      } else {
        this.expectRelational("<");
      }
    }

    const result = this.tsParseDelimitedList(kind, parseElement);

    if (bracket) {
      this.expect(_types.types.bracketR);
    } else {
      this.expectRelational(">");
    }

    return result;
  }

  tsParseEntityName(allowReservedWords) {
    let entity = this.parseIdentifier();

    while (this.eat(_types.types.dot)) {
      const node = this.startNodeAtNode(entity);
      node.left = entity;
      node.right = this.parseIdentifier(allowReservedWords);
      entity = this.finishNode(node, "TSQualifiedName");
    }

    return entity;
  }

  tsParseTypeReference() {
    const node = this.startNode();
    node.typeName = this.tsParseEntityName(false);

    if (!this.hasPrecedingLineBreak() && this.isRelational("<")) {
      node.typeParameters = this.tsParseTypeArguments();
    }

    return this.finishNode(node, "TSTypeReference");
  }

  tsParseThisTypePredicate(lhs) {
    this.next();
    const node = this.startNode();
    node.parameterName = lhs;
    node.typeAnnotation = this.tsParseTypeAnnotation(false);
    return this.finishNode(node, "TSTypePredicate");
  }

  tsParseThisTypeNode() {
    const node = this.startNode();
    this.next();
    return this.finishNode(node, "TSThisType");
  }

  tsParseTypeQuery() {
    const node = this.startNode();
    this.expect(_types.types._typeof);
    node.exprName = this.tsParseEntityName(true);
    return this.finishNode(node, "TSTypeQuery");
  }

  tsParseTypeParameter() {
    const node = this.startNode();
    node.name = this.parseIdentifierName(node.start);
    node.constraint = this.tsEatThenParseType(_types.types._extends);
    node.default = this.tsEatThenParseType(_types.types.eq);
    return this.finishNode(node, "TSTypeParameter");
  }

  tsTryParseTypeParameters() {
    if (this.isRelational("<")) {
      return this.tsParseTypeParameters();
    }
  }

  tsParseTypeParameters() {
    const node = this.startNode();

    if (this.isRelational("<") || this.match(_types.types.jsxTagStart)) {
      this.next();
    } else {
      this.unexpected();
    }

    node.params = this.tsParseBracketedList("TypeParametersOrArguments", this.tsParseTypeParameter.bind(this), false, true);
    return this.finishNode(node, "TSTypeParameterDeclaration");
  }

  tsFillSignature(returnToken, signature) {
    const returnTokenRequired = returnToken === _types.types.arrow;
    signature.typeParameters = this.tsTryParseTypeParameters();
    this.expect(_types.types.parenL);
    signature.parameters = this.tsParseBindingListForSignature();

    if (returnTokenRequired) {
      signature.typeAnnotation = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
    } else if (this.match(returnToken)) {
      signature.typeAnnotation = this.tsParseTypeOrTypePredicateAnnotation(returnToken);
    }
  }

  tsParseBindingListForSignature() {
    return this.parseBindingList(_types.types.parenR).map(pattern => {
      if (pattern.type !== "Identifier" && pattern.type !== "RestElement") {
        throw this.unexpected(pattern.start, "Name in a signature must be an Identifier.");
      }

      return pattern;
    });
  }

  tsParseTypeMemberSemicolon() {
    if (!this.eat(_types.types.comma)) {
      this.semicolon();
    }
  }

  tsParseSignatureMember(kind) {
    const node = this.startNode();

    if (kind === "TSConstructSignatureDeclaration") {
      this.expect(_types.types._new);
    }

    this.tsFillSignature(_types.types.colon, node);
    this.tsParseTypeMemberSemicolon();
    return this.finishNode(node, kind);
  }

  tsIsUnambiguouslyIndexSignature() {
    this.next();
    return this.eat(_types.types.name) && this.match(_types.types.colon);
  }

  tsTryParseIndexSignature(node) {
    if (!(this.match(_types.types.bracketL) && this.tsLookAhead(this.tsIsUnambiguouslyIndexSignature.bind(this)))) {
      return undefined;
    }

    this.expect(_types.types.bracketL);
    const id = this.parseIdentifier();
    this.expect(_types.types.colon);
    id.typeAnnotation = this.tsParseTypeAnnotation(false);
    this.expect(_types.types.bracketR);
    node.parameters = [id];
    const type = this.tsTryParseTypeAnnotation();
    if (type) node.typeAnnotation = type;
    this.tsParseTypeMemberSemicolon();
    return this.finishNode(node, "TSIndexSignature");
  }

  tsParsePropertyOrMethodSignature(node, readonly) {
    this.parsePropertyName(node);
    if (this.eat(_types.types.question)) node.optional = true;
    const nodeAny = node;

    if (!readonly && (this.match(_types.types.parenL) || this.isRelational("<"))) {
      const method = nodeAny;
      this.tsFillSignature(_types.types.colon, method);
      this.tsParseTypeMemberSemicolon();
      return this.finishNode(method, "TSMethodSignature");
    } else {
      const property = nodeAny;
      if (readonly) property.readonly = true;
      const type = this.tsTryParseTypeAnnotation();
      if (type) property.typeAnnotation = type;
      this.tsParseTypeMemberSemicolon();
      return this.finishNode(property, "TSPropertySignature");
    }
  }

  tsParseTypeMember() {
    if (this.match(_types.types.parenL) || this.isRelational("<")) {
      return this.tsParseSignatureMember("TSCallSignatureDeclaration");
    }

    if (this.match(_types.types._new) && this.tsLookAhead(this.tsIsStartOfConstructSignature.bind(this))) {
      return this.tsParseSignatureMember("TSConstructSignatureDeclaration");
    }

    const node = this.startNode();
    const readonly = !!this.tsParseModifier(["readonly"]);
    const idx = this.tsTryParseIndexSignature(node);

    if (idx) {
      if (readonly) node.readonly = true;
      return idx;
    }

    return this.tsParsePropertyOrMethodSignature(node, readonly);
  }

  tsIsStartOfConstructSignature() {
    this.next();
    return this.match(_types.types.parenL) || this.isRelational("<");
  }

  tsParseTypeLiteral() {
    const node = this.startNode();
    node.members = this.tsParseObjectTypeMembers();
    return this.finishNode(node, "TSTypeLiteral");
  }

  tsParseObjectTypeMembers() {
    this.expect(_types.types.braceL);
    const members = this.tsParseList("TypeMembers", this.tsParseTypeMember.bind(this));
    this.expect(_types.types.braceR);
    return members;
  }

  tsIsStartOfMappedType() {
    this.next();

    if (this.eat(_types.types.plusMin)) {
      return this.isContextual("readonly");
    }

    if (this.isContextual("readonly")) {
      this.next();
    }

    if (!this.match(_types.types.bracketL)) {
      return false;
    }

    this.next();

    if (!this.tsIsIdentifier()) {
      return false;
    }

    this.next();
    return this.match(_types.types._in);
  }

  tsParseMappedTypeParameter() {
    const node = this.startNode();
    node.name = this.parseIdentifierName(node.start);
    node.constraint = this.tsExpectThenParseType(_types.types._in);
    return this.finishNode(node, "TSTypeParameter");
  }

  tsParseMappedType() {
    const node = this.startNode();
    this.expect(_types.types.braceL);

    if (this.match(_types.types.plusMin)) {
      node.readonly = this.state.value;
      this.next();
      this.expectContextual("readonly");
    } else if (this.eatContextual("readonly")) {
      node.readonly = true;
    }

    this.expect(_types.types.bracketL);
    node.typeParameter = this.tsParseMappedTypeParameter();
    this.expect(_types.types.bracketR);

    if (this.match(_types.types.plusMin)) {
      node.optional = this.state.value;
      this.next();
      this.expect(_types.types.question);
    } else if (this.eat(_types.types.question)) {
      node.optional = true;
    }

    node.typeAnnotation = this.tsTryParseType();
    this.semicolon();
    this.expect(_types.types.braceR);
    return this.finishNode(node, "TSMappedType");
  }

  tsParseTupleType() {
    const node = this.startNode();
    node.elementTypes = this.tsParseBracketedList("TupleElementTypes", this.tsParseTupleElementType.bind(this), true, false);
    return this.finishNode(node, "TSTupleType");
  }

  tsParseTupleElementType() {
    if (this.match(_types.types.ellipsis)) {
      const restNode = this.startNode();
      this.next();
      restNode.typeAnnotation = this.tsParseType();
      return this.finishNode(restNode, "TSRestType");
    }

    const type = this.tsParseType();

    if (this.eat(_types.types.question)) {
      const optionalTypeNode = this.startNodeAtNode(type);
      optionalTypeNode.typeAnnotation = type;
      return this.finishNode(optionalTypeNode, "TSOptionalType");
    }

    return type;
  }

  tsParseParenthesizedType() {
    const node = this.startNode();
    this.expect(_types.types.parenL);
    node.typeAnnotation = this.tsParseType();
    this.expect(_types.types.parenR);
    return this.finishNode(node, "TSParenthesizedType");
  }

  tsParseFunctionOrConstructorType(type) {
    const node = this.startNode();

    if (type === "TSConstructorType") {
      this.expect(_types.types._new);
    }

    this.tsFillSignature(_types.types.arrow, node);
    return this.finishNode(node, type);
  }

  tsParseLiteralTypeNode() {
    const node = this.startNode();

    node.literal = (() => {
      switch (this.state.type) {
        case _types.types.num:
          return this.parseLiteral(this.state.value, "NumericLiteral");

        case _types.types.string:
          return this.parseLiteral(this.state.value, "StringLiteral");

        case _types.types._true:
        case _types.types._false:
          return this.parseBooleanLiteral();

        default:
          throw this.unexpected();
      }
    })();

    return this.finishNode(node, "TSLiteralType");
  }

  tsParseNonArrayType() {
    switch (this.state.type) {
      case _types.types.name:
      case _types.types._void:
      case _types.types._null:
        {
          const type = this.match(_types.types._void) ? "TSVoidKeyword" : this.match(_types.types._null) ? "TSNullKeyword" : keywordTypeFromName(this.state.value);

          if (type !== undefined && this.lookahead().type !== _types.types.dot) {
            const node = this.startNode();
            this.next();
            return this.finishNode(node, type);
          }

          return this.tsParseTypeReference();
        }

      case _types.types.string:
      case _types.types.num:
      case _types.types._true:
      case _types.types._false:
        return this.tsParseLiteralTypeNode();

      case _types.types.plusMin:
        if (this.state.value === "-") {
          const node = this.startNode();
          this.next();

          if (!this.match(_types.types.num)) {
            throw this.unexpected();
          }

          node.literal = this.parseLiteral(-this.state.value, "NumericLiteral", node.start, node.loc.start);
          return this.finishNode(node, "TSLiteralType");
        }

        break;

      case _types.types._this:
        {
          const thisKeyword = this.tsParseThisTypeNode();

          if (this.isContextual("is") && !this.hasPrecedingLineBreak()) {
            return this.tsParseThisTypePredicate(thisKeyword);
          } else {
            return thisKeyword;
          }
        }

      case _types.types._typeof:
        return this.tsParseTypeQuery();

      case _types.types.braceL:
        return this.tsLookAhead(this.tsIsStartOfMappedType.bind(this)) ? this.tsParseMappedType() : this.tsParseTypeLiteral();

      case _types.types.bracketL:
        return this.tsParseTupleType();

      case _types.types.parenL:
        return this.tsParseParenthesizedType();
    }

    throw this.unexpected();
  }

  tsParseArrayTypeOrHigher() {
    let type = this.tsParseNonArrayType();

    while (!this.hasPrecedingLineBreak() && this.eat(_types.types.bracketL)) {
      if (this.match(_types.types.bracketR)) {
        const node = this.startNodeAtNode(type);
        node.elementType = type;
        this.expect(_types.types.bracketR);
        type = this.finishNode(node, "TSArrayType");
      } else {
        const node = this.startNodeAtNode(type);
        node.objectType = type;
        node.indexType = this.tsParseType();
        this.expect(_types.types.bracketR);
        type = this.finishNode(node, "TSIndexedAccessType");
      }
    }

    return type;
  }

  tsParseTypeOperator(operator) {
    const node = this.startNode();
    this.expectContextual(operator);
    node.operator = operator;
    node.typeAnnotation = this.tsParseTypeOperatorOrHigher();
    return this.finishNode(node, "TSTypeOperator");
  }

  tsParseInferType() {
    const node = this.startNode();
    this.expectContextual("infer");
    const typeParameter = this.startNode();
    typeParameter.name = this.parseIdentifierName(typeParameter.start);
    node.typeParameter = this.finishNode(typeParameter, "TSTypeParameter");
    return this.finishNode(node, "TSInferType");
  }

  tsParseTypeOperatorOrHigher() {
    const operator = ["keyof", "unique"].find(kw => this.isContextual(kw));
    return operator ? this.tsParseTypeOperator(operator) : this.isContextual("infer") ? this.tsParseInferType() : this.tsParseArrayTypeOrHigher();
  }

  tsParseUnionOrIntersectionType(kind, parseConstituentType, operator) {
    this.eat(operator);
    let type = parseConstituentType();

    if (this.match(operator)) {
      const types = [type];

      while (this.eat(operator)) {
        types.push(parseConstituentType());
      }

      const node = this.startNodeAtNode(type);
      node.types = types;
      type = this.finishNode(node, kind);
    }

    return type;
  }

  tsParseIntersectionTypeOrHigher() {
    return this.tsParseUnionOrIntersectionType("TSIntersectionType", this.tsParseTypeOperatorOrHigher.bind(this), _types.types.bitwiseAND);
  }

  tsParseUnionTypeOrHigher() {
    return this.tsParseUnionOrIntersectionType("TSUnionType", this.tsParseIntersectionTypeOrHigher.bind(this), _types.types.bitwiseOR);
  }

  tsIsStartOfFunctionType() {
    if (this.isRelational("<")) {
      return true;
    }

    return this.match(_types.types.parenL) && this.tsLookAhead(this.tsIsUnambiguouslyStartOfFunctionType.bind(this));
  }

  tsSkipParameterStart() {
    if (this.match(_types.types.name) || this.match(_types.types._this)) {
      this.next();
      return true;
    }

    return false;
  }

  tsIsUnambiguouslyStartOfFunctionType() {
    this.next();

    if (this.match(_types.types.parenR) || this.match(_types.types.ellipsis)) {
      return true;
    }

    if (this.tsSkipParameterStart()) {
      if (this.match(_types.types.colon) || this.match(_types.types.comma) || this.match(_types.types.question) || this.match(_types.types.eq)) {
        return true;
      }

      if (this.match(_types.types.parenR)) {
        this.next();

        if (this.match(_types.types.arrow)) {
          return true;
        }
      }
    }

    return false;
  }

  tsParseTypeOrTypePredicateAnnotation(returnToken) {
    return this.tsInType(() => {
      const t = this.startNode();
      this.expect(returnToken);
      const typePredicateVariable = this.tsIsIdentifier() && this.tsTryParse(this.tsParseTypePredicatePrefix.bind(this));

      if (!typePredicateVariable) {
        return this.tsParseTypeAnnotation(false, t);
      }

      const type = this.tsParseTypeAnnotation(false);
      const node = this.startNodeAtNode(typePredicateVariable);
      node.parameterName = typePredicateVariable;
      node.typeAnnotation = type;
      t.typeAnnotation = this.finishNode(node, "TSTypePredicate");
      return this.finishNode(t, "TSTypeAnnotation");
    });
  }

  tsTryParseTypeOrTypePredicateAnnotation() {
    return this.match(_types.types.colon) ? this.tsParseTypeOrTypePredicateAnnotation(_types.types.colon) : undefined;
  }

  tsTryParseTypeAnnotation() {
    return this.match(_types.types.colon) ? this.tsParseTypeAnnotation() : undefined;
  }

  tsTryParseType() {
    return this.tsEatThenParseType(_types.types.colon);
  }

  tsParseTypePredicatePrefix() {
    const id = this.parseIdentifier();

    if (this.isContextual("is") && !this.hasPrecedingLineBreak()) {
      this.next();
      return id;
    }
  }

  tsParseTypeAnnotation(eatColon = true, t = this.startNode()) {
    this.tsInType(() => {
      if (eatColon) this.expect(_types.types.colon);
      t.typeAnnotation = this.tsParseType();
    });
    return this.finishNode(t, "TSTypeAnnotation");
  }

  tsParseType() {
    assert(this.state.inType);
    const type = this.tsParseNonConditionalType();

    if (this.hasPrecedingLineBreak() || !this.eat(_types.types._extends)) {
      return type;
    }

    const node = this.startNodeAtNode(type);
    node.checkType = type;
    node.extendsType = this.tsParseNonConditionalType();
    this.expect(_types.types.question);
    node.trueType = this.tsParseType();
    this.expect(_types.types.colon);
    node.falseType = this.tsParseType();
    return this.finishNode(node, "TSConditionalType");
  }

  tsParseNonConditionalType() {
    if (this.tsIsStartOfFunctionType()) {
      return this.tsParseFunctionOrConstructorType("TSFunctionType");
    }

    if (this.match(_types.types._new)) {
      return this.tsParseFunctionOrConstructorType("TSConstructorType");
    }

    return this.tsParseUnionTypeOrHigher();
  }

  tsParseTypeAssertion() {
    const node = this.startNode();
    node.typeAnnotation = this.tsInType(() => this.tsParseType());
    this.expectRelational(">");
    node.expression = this.parseMaybeUnary();
    return this.finishNode(node, "TSTypeAssertion");
  }

  tsParseHeritageClause() {
    return this.tsParseDelimitedList("HeritageClauseElement", this.tsParseExpressionWithTypeArguments.bind(this));
  }

  tsParseExpressionWithTypeArguments() {
    const node = this.startNode();
    node.expression = this.tsParseEntityName(false);

    if (this.isRelational("<")) {
      node.typeParameters = this.tsParseTypeArguments();
    }

    return this.finishNode(node, "TSExpressionWithTypeArguments");
  }

  tsParseInterfaceDeclaration(node) {
    node.id = this.parseIdentifier();
    node.typeParameters = this.tsTryParseTypeParameters();

    if (this.eat(_types.types._extends)) {
      node.extends = this.tsParseHeritageClause();
    }

    const body = this.startNode();
    body.body = this.tsParseObjectTypeMembers();
    node.body = this.finishNode(body, "TSInterfaceBody");
    return this.finishNode(node, "TSInterfaceDeclaration");
  }

  tsParseTypeAliasDeclaration(node) {
    node.id = this.parseIdentifier();
    node.typeParameters = this.tsTryParseTypeParameters();
    node.typeAnnotation = this.tsExpectThenParseType(_types.types.eq);
    this.semicolon();
    return this.finishNode(node, "TSTypeAliasDeclaration");
  }

  tsInNoContext(cb) {
    const oldContext = this.state.context;
    this.state.context = [oldContext[0]];

    try {
      return cb();
    } finally {
      this.state.context = oldContext;
    }
  }

  tsInType(cb) {
    const oldInType = this.state.inType;
    this.state.inType = true;

    try {
      return cb();
    } finally {
      this.state.inType = oldInType;
    }
  }

  tsEatThenParseType(token) {
    return !this.match(token) ? undefined : this.tsNextThenParseType();
  }

  tsExpectThenParseType(token) {
    return this.tsDoThenParseType(() => this.expect(token));
  }

  tsNextThenParseType() {
    return this.tsDoThenParseType(() => this.next());
  }

  tsDoThenParseType(cb) {
    return this.tsInType(() => {
      cb();
      return this.tsParseType();
    });
  }

  tsParseEnumMember() {
    const node = this.startNode();
    node.id = this.match(_types.types.string) ? this.parseLiteral(this.state.value, "StringLiteral") : this.parseIdentifier(true);

    if (this.eat(_types.types.eq)) {
      node.initializer = this.parseMaybeAssign();
    }

    return this.finishNode(node, "TSEnumMember");
  }

  tsParseEnumDeclaration(node, isConst) {
    if (isConst) node.const = true;
    node.id = this.parseIdentifier();
    this.expect(_types.types.braceL);
    node.members = this.tsParseDelimitedList("EnumMembers", this.tsParseEnumMember.bind(this));
    this.expect(_types.types.braceR);
    return this.finishNode(node, "TSEnumDeclaration");
  }

  tsParseModuleBlock() {
    const node = this.startNode();
    this.expect(_types.types.braceL);
    this.parseBlockOrModuleBlockBody(node.body = [], undefined, true, _types.types.braceR);
    return this.finishNode(node, "TSModuleBlock");
  }

  tsParseModuleOrNamespaceDeclaration(node) {
    node.id = this.parseIdentifier();

    if (this.eat(_types.types.dot)) {
      const inner = this.startNode();
      this.tsParseModuleOrNamespaceDeclaration(inner);
      node.body = inner;
    } else {
      node.body = this.tsParseModuleBlock();
    }

    return this.finishNode(node, "TSModuleDeclaration");
  }

  tsParseAmbientExternalModuleDeclaration(node) {
    if (this.isContextual("global")) {
      node.global = true;
      node.id = this.parseIdentifier();
    } else if (this.match(_types.types.string)) {
      node.id = this.parseExprAtom();
    } else {
      this.unexpected();
    }

    if (this.match(_types.types.braceL)) {
      node.body = this.tsParseModuleBlock();
    } else {
      this.semicolon();
    }

    return this.finishNode(node, "TSModuleDeclaration");
  }

  tsParseImportEqualsDeclaration(node, isExport) {
    node.isExport = isExport || false;
    node.id = this.parseIdentifier();
    this.expect(_types.types.eq);
    node.moduleReference = this.tsParseModuleReference();
    this.semicolon();
    return this.finishNode(node, "TSImportEqualsDeclaration");
  }

  tsIsExternalModuleReference() {
    return this.isContextual("require") && this.lookahead().type === _types.types.parenL;
  }

  tsParseModuleReference() {
    return this.tsIsExternalModuleReference() ? this.tsParseExternalModuleReference() : this.tsParseEntityName(false);
  }

  tsParseExternalModuleReference() {
    const node = this.startNode();
    this.expectContextual("require");
    this.expect(_types.types.parenL);

    if (!this.match(_types.types.string)) {
      throw this.unexpected();
    }

    node.expression = this.parseLiteral(this.state.value, "StringLiteral");
    this.expect(_types.types.parenR);
    return this.finishNode(node, "TSExternalModuleReference");
  }

  tsLookAhead(f) {
    const state = this.state.clone();
    const res = f();
    this.state = state;
    return res;
  }

  tsTryParseAndCatch(f) {
    const state = this.state.clone();

    try {
      return f();
    } catch (e) {
      if (e instanceof SyntaxError) {
        this.state = state;
        return undefined;
      }

      throw e;
    }
  }

  tsTryParse(f) {
    const state = this.state.clone();
    const result = f();

    if (result !== undefined && result !== false) {
      return result;
    } else {
      this.state = state;
      return undefined;
    }
  }

  nodeWithSamePosition(original, type) {
    const node = this.startNodeAtNode(original);
    node.type = type;
    node.end = original.end;
    node.loc.end = original.loc.end;

    if (original.leadingComments) {
      node.leadingComments = original.leadingComments;
    }

    if (original.trailingComments) {
      node.trailingComments = original.trailingComments;
    }

    if (original.innerComments) node.innerComments = original.innerComments;
    return node;
  }

  tsTryParseDeclare(nany) {
    switch (this.state.type) {
      case _types.types._function:
        this.next();
        return this.parseFunction(nany, true);

      case _types.types._class:
        return this.parseClass(nany, true, false);

      case _types.types._const:
        if (this.match(_types.types._const) && this.isLookaheadContextual("enum")) {
          this.expect(_types.types._const);
          this.expectContextual("enum");
          return this.tsParseEnumDeclaration(nany, true);
        }

      case _types.types._var:
      case _types.types._let:
        return this.parseVarStatement(nany, this.state.type);

      case _types.types.name:
        {
          const value = this.state.value;

          if (value === "global") {
            return this.tsParseAmbientExternalModuleDeclaration(nany);
          } else {
            return this.tsParseDeclaration(nany, value, true);
          }
        }
    }
  }

  tsTryParseExportDeclaration() {
    return this.tsParseDeclaration(this.startNode(), this.state.value, true);
  }

  tsParseExpressionStatement(node, expr) {
    switch (expr.name) {
      case "declare":
        {
          const declaration = this.tsTryParseDeclare(node);

          if (declaration) {
            declaration.declare = true;
            return declaration;
          }

          break;
        }

      case "global":
        if (this.match(_types.types.braceL)) {
          const mod = node;
          mod.global = true;
          mod.id = expr;
          mod.body = this.tsParseModuleBlock();
          return this.finishNode(mod, "TSModuleDeclaration");
        }

        break;

      default:
        return this.tsParseDeclaration(node, expr.name, false);
    }
  }

  tsParseDeclaration(node, value, next) {
    switch (value) {
      case "abstract":
        if (next || this.match(_types.types._class)) {
          const cls = node;
          cls.abstract = true;
          if (next) this.next();
          return this.parseClass(cls, true, false);
        }

        break;

      case "enum":
        if (next || this.match(_types.types.name)) {
          if (next) this.next();
          return this.tsParseEnumDeclaration(node, false);
        }

        break;

      case "interface":
        if (next || this.match(_types.types.name)) {
          if (next) this.next();
          return this.tsParseInterfaceDeclaration(node);
        }

        break;

      case "module":
        if (next) this.next();

        if (this.match(_types.types.string)) {
          return this.tsParseAmbientExternalModuleDeclaration(node);
        } else if (next || this.match(_types.types.name)) {
          return this.tsParseModuleOrNamespaceDeclaration(node);
        }

        break;

      case "namespace":
        if (next || this.match(_types.types.name)) {
          if (next) this.next();
          return this.tsParseModuleOrNamespaceDeclaration(node);
        }

        break;

      case "type":
        if (next || this.match(_types.types.name)) {
          if (next) this.next();
          return this.tsParseTypeAliasDeclaration(node);
        }

        break;
    }
  }

  tsTryParseGenericAsyncArrowFunction(startPos, startLoc) {
    const res = this.tsTryParseAndCatch(() => {
      const node = this.startNodeAt(startPos, startLoc);
      node.typeParameters = this.tsParseTypeParameters();
      super.parseFunctionParams(node);
      node.returnType = this.tsTryParseTypeOrTypePredicateAnnotation();
      this.expect(_types.types.arrow);
      return node;
    });

    if (!res) {
      return undefined;
    }

    res.id = null;
    res.generator = false;
    res.expression = true;
    res.async = true;
    this.parseFunctionBody(res, true);
    return this.finishNode(res, "ArrowFunctionExpression");
  }

  tsParseTypeArguments() {
    const node = this.startNode();
    node.params = this.tsInType(() => this.tsInNoContext(() => {
      this.expectRelational("<");
      return this.tsParseDelimitedList("TypeParametersOrArguments", this.tsParseType.bind(this));
    }));
    this.state.exprAllowed = false;
    this.expectRelational(">");
    return this.finishNode(node, "TSTypeParameterInstantiation");
  }

  tsIsDeclarationStart() {
    if (this.match(_types.types.name)) {
      switch (this.state.value) {
        case "abstract":
        case "declare":
        case "enum":
        case "interface":
        case "module":
        case "namespace":
        case "type":
          return true;
      }
    }

    return false;
  }

  isExportDefaultSpecifier() {
    if (this.tsIsDeclarationStart()) return false;
    return super.isExportDefaultSpecifier();
  }

  parseAssignableListItem(allowModifiers, decorators) {
    let accessibility;
    let readonly = false;

    if (allowModifiers) {
      accessibility = this.parseAccessModifier();
      readonly = !!this.tsParseModifier(["readonly"]);
    }

    const left = this.parseMaybeDefault();
    this.parseAssignableListItemTypes(left);
    const elt = this.parseMaybeDefault(left.start, left.loc.start, left);

    if (accessibility || readonly) {
      const pp = this.startNodeAtNode(elt);

      if (decorators.length) {
        pp.decorators = decorators;
      }

      if (accessibility) pp.accessibility = accessibility;
      if (readonly) pp.readonly = readonly;

      if (elt.type !== "Identifier" && elt.type !== "AssignmentPattern") {
        throw this.raise(pp.start, "A parameter property may not be declared using a binding pattern.");
      }

      pp.parameter = elt;
      return this.finishNode(pp, "TSParameterProperty");
    } else {
      if (decorators.length) {
        left.decorators = decorators;
      }

      return elt;
    }
  }

  parseFunctionBodyAndFinish(node, type, allowExpressionBody) {
    if (!allowExpressionBody && this.match(_types.types.colon)) {
      node.returnType = this.tsParseTypeOrTypePredicateAnnotation(_types.types.colon);
    }

    const bodilessType = type === "FunctionDeclaration" ? "TSDeclareFunction" : type === "ClassMethod" ? "TSDeclareMethod" : undefined;

    if (bodilessType && !this.match(_types.types.braceL) && this.isLineTerminator()) {
      this.finishNode(node, bodilessType);
      return;
    }

    super.parseFunctionBodyAndFinish(node, type, allowExpressionBody);
  }

  parseSubscript(base, startPos, startLoc, noCalls, state) {
    if (!this.hasPrecedingLineBreak() && this.match(_types.types.bang)) {
      this.state.exprAllowed = false;
      this.next();
      const nonNullExpression = this.startNodeAt(startPos, startLoc);
      nonNullExpression.expression = base;
      return this.finishNode(nonNullExpression, "TSNonNullExpression");
    }

    if (this.isRelational("<")) {
      const result = this.tsTryParseAndCatch(() => {
        if (!noCalls && this.atPossibleAsync(base)) {
          const asyncArrowFn = this.tsTryParseGenericAsyncArrowFunction(startPos, startLoc);

          if (asyncArrowFn) {
            return asyncArrowFn;
          }
        }

        const node = this.startNodeAt(startPos, startLoc);
        node.callee = base;
        const typeArguments = this.tsParseTypeArguments();

        if (typeArguments) {
          if (!noCalls && this.eat(_types.types.parenL)) {
            node.arguments = this.parseCallExpressionArguments(_types.types.parenR, false);
            node.typeParameters = typeArguments;
            return this.finishCallExpression(node);
          } else if (this.match(_types.types.backQuote)) {
            return this.parseTaggedTemplateExpression(startPos, startLoc, base, state, typeArguments);
          }
        }

        this.unexpected();
      });
      if (result) return result;
    }

    return super.parseSubscript(base, startPos, startLoc, noCalls, state);
  }

  parseNewArguments(node) {
    if (this.isRelational("<")) {
      const typeParameters = this.tsTryParseAndCatch(() => {
        const args = this.tsParseTypeArguments();
        if (!this.match(_types.types.parenL)) this.unexpected();
        return args;
      });

      if (typeParameters) {
        node.typeParameters = typeParameters;
      }
    }

    super.parseNewArguments(node);
  }

  parseExprOp(left, leftStartPos, leftStartLoc, minPrec, noIn) {
    if (nonNull(_types.types._in.binop) > minPrec && !this.hasPrecedingLineBreak() && this.isContextual("as")) {
      const node = this.startNodeAt(leftStartPos, leftStartLoc);
      node.expression = left;
      node.typeAnnotation = this.tsNextThenParseType();
      this.finishNode(node, "TSAsExpression");
      return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, noIn);
    }

    return super.parseExprOp(left, leftStartPos, leftStartLoc, minPrec, noIn);
  }

  checkReservedWord(word, startLoc, checkKeywords, isBinding) {}

  checkDuplicateExports() {}

  parseImport(node) {
    if (this.match(_types.types.name) && this.lookahead().type === _types.types.eq) {
      return this.tsParseImportEqualsDeclaration(node);
    }

    return super.parseImport(node);
  }

  parseExport(node) {
    if (this.match(_types.types._import)) {
      this.expect(_types.types._import);
      return this.tsParseImportEqualsDeclaration(node, true);
    } else if (this.eat(_types.types.eq)) {
      const assign = node;
      assign.expression = this.parseExpression();
      this.semicolon();
      return this.finishNode(assign, "TSExportAssignment");
    } else if (this.eatContextual("as")) {
      const decl = node;
      this.expectContextual("namespace");
      decl.id = this.parseIdentifier();
      this.semicolon();
      return this.finishNode(decl, "TSNamespaceExportDeclaration");
    } else {
      return super.parseExport(node);
    }
  }

  isAbstractClass() {
    return this.isContextual("abstract") && this.lookahead().type === _types.types._class;
  }

  parseExportDefaultExpression() {
    if (this.isAbstractClass()) {
      const cls = this.startNode();
      this.next();
      this.parseClass(cls, true, true);
      cls.abstract = true;
      return cls;
    }

    if (this.state.value === "interface") {
      const result = this.tsParseDeclaration(this.startNode(), this.state.value, true);
      if (result) return result;
    }

    return super.parseExportDefaultExpression();
  }

  parseStatementContent(declaration, topLevel) {
    if (this.state.type === _types.types._const) {
      const ahead = this.lookahead();

      if (ahead.type === _types.types.name && ahead.value === "enum") {
        const node = this.startNode();
        this.expect(_types.types._const);
        this.expectContextual("enum");
        return this.tsParseEnumDeclaration(node, true);
      }
    }

    return super.parseStatementContent(declaration, topLevel);
  }

  parseAccessModifier() {
    return this.tsParseModifier(["public", "protected", "private"]);
  }

  parseClassMember(classBody, member, state) {
    const accessibility = this.parseAccessModifier();
    if (accessibility) member.accessibility = accessibility;
    super.parseClassMember(classBody, member, state);
  }

  parseClassMemberWithIsStatic(classBody, member, state, isStatic) {
    const methodOrProp = member;
    const prop = member;
    const propOrIdx = member;
    let abstract = false,
        readonly = false;
    const mod = this.tsParseModifier(["abstract", "readonly"]);

    switch (mod) {
      case "readonly":
        readonly = true;
        abstract = !!this.tsParseModifier(["abstract"]);
        break;

      case "abstract":
        abstract = true;
        readonly = !!this.tsParseModifier(["readonly"]);
        break;
    }

    if (abstract) methodOrProp.abstract = true;
    if (readonly) propOrIdx.readonly = true;

    if (!abstract && !isStatic && !methodOrProp.accessibility) {
      const idx = this.tsTryParseIndexSignature(member);

      if (idx) {
        classBody.body.push(idx);
        return;
      }
    }

    if (readonly) {
      methodOrProp.static = isStatic;
      this.parseClassPropertyName(prop);
      this.parsePostMemberNameModifiers(methodOrProp);
      this.pushClassProperty(classBody, prop);
      return;
    }

    super.parseClassMemberWithIsStatic(classBody, member, state, isStatic);
  }

  parsePostMemberNameModifiers(methodOrProp) {
    const optional = this.eat(_types.types.question);
    if (optional) methodOrProp.optional = true;
  }

  parseExpressionStatement(node, expr) {
    const decl = expr.type === "Identifier" ? this.tsParseExpressionStatement(node, expr) : undefined;
    return decl || super.parseExpressionStatement(node, expr);
  }

  shouldParseExportDeclaration() {
    if (this.tsIsDeclarationStart()) return true;
    return super.shouldParseExportDeclaration();
  }

  parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    if (!refNeedsArrowPos || !this.match(_types.types.question)) {
      return super.parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos);
    }

    const state = this.state.clone();

    try {
      return super.parseConditional(expr, noIn, startPos, startLoc);
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        throw err;
      }

      this.state = state;
      refNeedsArrowPos.start = err.pos || this.state.start;
      return expr;
    }
  }

  parseParenItem(node, startPos, startLoc) {
    node = super.parseParenItem(node, startPos, startLoc);

    if (this.eat(_types.types.question)) {
      node.optional = true;
    }

    if (this.match(_types.types.colon)) {
      const typeCastNode = this.startNodeAt(startPos, startLoc);
      typeCastNode.expression = node;
      typeCastNode.typeAnnotation = this.tsParseTypeAnnotation();
      return this.finishNode(typeCastNode, "TSTypeCastExpression");
    }

    return node;
  }

  parseExportDeclaration(node) {
    const isDeclare = this.eatContextual("declare");
    let declaration;

    if (this.match(_types.types.name)) {
      declaration = this.tsTryParseExportDeclaration();
    }

    if (!declaration) {
      declaration = super.parseExportDeclaration(node);
    }

    if (declaration && isDeclare) {
      declaration.declare = true;
    }

    return declaration;
  }

  parseClassId(node, isStatement, optionalId) {
    if ((!isStatement || optionalId) && this.isContextual("implements")) {
      return;
    }

    super.parseClassId(...arguments);
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) node.typeParameters = typeParameters;
  }

  parseClassProperty(node) {
    if (!node.optional && this.eat(_types.types.bang)) {
      node.definite = true;
    }

    const type = this.tsTryParseTypeAnnotation();
    if (type) node.typeAnnotation = type;
    return super.parseClassProperty(node);
  }

  pushClassMethod(classBody, method, isGenerator, isAsync, isConstructor) {
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) method.typeParameters = typeParameters;
    super.pushClassMethod(classBody, method, isGenerator, isAsync, isConstructor);
  }

  pushClassPrivateMethod(classBody, method, isGenerator, isAsync) {
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) method.typeParameters = typeParameters;
    super.pushClassPrivateMethod(classBody, method, isGenerator, isAsync);
  }

  parseClassSuper(node) {
    super.parseClassSuper(node);

    if (node.superClass && this.isRelational("<")) {
      node.superTypeParameters = this.tsParseTypeArguments();
    }

    if (this.eatContextual("implements")) {
      node.implements = this.tsParseHeritageClause();
    }
  }

  parseObjPropValue(prop, ...args) {
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) prop.typeParameters = typeParameters;
    super.parseObjPropValue(prop, ...args);
  }

  parseFunctionParams(node, allowModifiers) {
    const typeParameters = this.tsTryParseTypeParameters();
    if (typeParameters) node.typeParameters = typeParameters;
    super.parseFunctionParams(node, allowModifiers);
  }

  parseVarHead(decl) {
    super.parseVarHead(decl);

    if (decl.id.type === "Identifier" && this.eat(_types.types.bang)) {
      decl.definite = true;
    }

    const type = this.tsTryParseTypeAnnotation();

    if (type) {
      decl.id.typeAnnotation = type;
      this.finishNode(decl.id, decl.id.type);
    }
  }

  parseAsyncArrowFromCallExpression(node, call) {
    if (this.match(_types.types.colon)) {
      node.returnType = this.tsParseTypeAnnotation();
    }

    return super.parseAsyncArrowFromCallExpression(node, call);
  }

  parseMaybeAssign(...args) {
    let jsxError;

    if (this.match(_types.types.jsxTagStart)) {
      const context = this.curContext();
      assert(context === _context.types.j_oTag);
      assert(this.state.context[this.state.context.length - 2] === _context.types.j_expr);
      const state = this.state.clone();

      try {
        return super.parseMaybeAssign(...args);
      } catch (err) {
        if (!(err instanceof SyntaxError)) {
          throw err;
        }

        this.state = state;
        assert(this.curContext() === _context.types.j_oTag);
        this.state.context.pop();
        assert(this.curContext() === _context.types.j_expr);
        this.state.context.pop();
        jsxError = err;
      }
    }

    if (jsxError === undefined && !this.isRelational("<")) {
      return super.parseMaybeAssign(...args);
    }

    let arrowExpression;
    let typeParameters;
    const state = this.state.clone();

    try {
      typeParameters = this.tsParseTypeParameters();
      arrowExpression = super.parseMaybeAssign(...args);

      if (arrowExpression.type !== "ArrowFunctionExpression") {
        this.unexpected();
      }
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        throw err;
      }

      if (jsxError) {
        throw jsxError;
      }

      assert(!this.hasPlugin("jsx"));
      this.state = state;
      return super.parseMaybeAssign(...args);
    }

    if (typeParameters && typeParameters.params.length !== 0) {
      this.resetStartLocationFromNode(arrowExpression, typeParameters.params[0]);
    }

    arrowExpression.typeParameters = typeParameters;
    return arrowExpression;
  }

  parseMaybeUnary(refShorthandDefaultPos) {
    if (!this.hasPlugin("jsx") && this.eatRelational("<")) {
      return this.tsParseTypeAssertion();
    } else {
      return super.parseMaybeUnary(refShorthandDefaultPos);
    }
  }

  parseArrow(node) {
    if (this.match(_types.types.colon)) {
      const state = this.state.clone();

      try {
        const returnType = this.tsParseTypeOrTypePredicateAnnotation(_types.types.colon);
        if (this.canInsertSemicolon()) this.unexpected();
        if (!this.match(_types.types.arrow)) this.unexpected();
        node.returnType = returnType;
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.state = state;
        } else {
          throw err;
        }
      }
    }

    return super.parseArrow(node);
  }

  parseAssignableListItemTypes(param) {
    if (this.eat(_types.types.question)) {
      if (param.type !== "Identifier") {
        throw this.raise(param.start, "A binding pattern parameter cannot be optional in an implementation signature.");
      }

      param.optional = true;
    }

    const type = this.tsTryParseTypeAnnotation();
    if (type) param.typeAnnotation = type;
    return this.finishNode(param, param.type);
  }

  toAssignable(node, isBinding, contextDescription) {
    switch (node.type) {
      case "TSTypeCastExpression":
        return super.toAssignable(this.typeCastToParameter(node), isBinding, contextDescription);

      case "TSParameterProperty":
        return super.toAssignable(node, isBinding, contextDescription);

      case "TSAsExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
        node.expression = this.toAssignable(node.expression, isBinding, contextDescription);
        return node;

      default:
        return super.toAssignable(node, isBinding, contextDescription);
    }
  }

  checkLVal(expr, isBinding, checkClashes, contextDescription) {
    switch (expr.type) {
      case "TSTypeCastExpression":
        return;

      case "TSParameterProperty":
        this.checkLVal(expr.parameter, isBinding, checkClashes, "parameter property");
        return;

      case "TSAsExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
        this.checkLVal(expr.expression, isBinding, checkClashes, contextDescription);
        return;

      default:
        super.checkLVal(expr, isBinding, checkClashes, contextDescription);
        return;
    }
  }

  parseBindingAtom() {
    switch (this.state.type) {
      case _types.types._this:
        return this.parseIdentifier(true);

      default:
        return super.parseBindingAtom();
    }
  }

  parseMaybeDecoratorArguments(expr) {
    if (this.isRelational("<")) {
      const typeArguments = this.tsParseTypeArguments();

      if (this.match(_types.types.parenL)) {
        const call = super.parseMaybeDecoratorArguments(expr);
        call.typeParameters = typeArguments;
        return call;
      }

      this.unexpected(this.state.start, _types.types.parenL);
    }

    return super.parseMaybeDecoratorArguments(expr);
  }

  isClassMethod() {
    return this.isRelational("<") || super.isClassMethod();
  }

  isClassProperty() {
    return this.match(_types.types.bang) || this.match(_types.types.colon) || super.isClassProperty();
  }

  parseMaybeDefault(...args) {
    const node = super.parseMaybeDefault(...args);

    if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) {
      this.raise(node.typeAnnotation.start, "Type annotations must come before default assignments, " + "e.g. instead of `age = 25: number` use `age: number = 25`");
    }

    return node;
  }

  readToken(code) {
    if (this.state.inType && (code === 62 || code === 60)) {
      return this.finishOp(_types.types.relational, 1);
    } else {
      return super.readToken(code);
    }
  }

  toAssignableList(exprList, isBinding, contextDescription) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];

      if (expr && expr.type === "TSTypeCastExpression") {
        exprList[i] = this.typeCastToParameter(expr);
      }
    }

    return super.toAssignableList(exprList, isBinding, contextDescription);
  }

  typeCastToParameter(node) {
    node.expression.typeAnnotation = node.typeAnnotation;
    return this.finishNodeAt(node.expression, node.expression.type, node.typeAnnotation.end, node.typeAnnotation.loc.end);
  }

  toReferencedList(exprList) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];

      if (expr && expr._exprListItem && expr.type === "TsTypeCastExpression") {
        this.raise(expr.start, "Did not expect a type annotation here.");
      }
    }

    return exprList;
  }

  shouldParseArrow() {
    return this.match(_types.types.colon) || super.shouldParseArrow();
  }

  shouldParseAsyncArrow() {
    return this.match(_types.types.colon) || super.shouldParseAsyncArrow();
  }

  canHaveLeadingDecorator() {
    return super.canHaveLeadingDecorator() || this.isAbstractClass();
  }

  jsxParseOpeningElementAfterName(node) {
    const typeArguments = this.tsTryParseAndCatch(() => this.tsParseTypeArguments());
    if (typeArguments) node.typeParameters = typeArguments;
    return super.jsxParseOpeningElementAfterName(node);
  }

};

exports.default = _default;