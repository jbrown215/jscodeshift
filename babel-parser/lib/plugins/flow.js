"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _types = require("../tokenizer/types");

var N = _interopRequireWildcard(require("../types"));

var _identifier = require("../util/identifier");

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const primitiveTypes = ["any", "bool", "boolean", "empty", "false", "mixed", "null", "number", "static", "string", "true", "typeof", "void"];

function isEsModuleType(bodyElement) {
  return bodyElement.type === "DeclareExportAllDeclaration" || bodyElement.type === "DeclareExportDeclaration" && (!bodyElement.declaration || bodyElement.declaration.type !== "TypeAlias" && bodyElement.declaration.type !== "InterfaceDeclaration");
}

function hasTypeImportKind(node) {
  return node.importKind === "type" || node.importKind === "typeof";
}

function isMaybeDefaultImport(state) {
  return (state.type === _types.types.name || !!state.type.keyword) && state.value !== "from";
}

const exportSuggestions = {
  const: "declare export var",
  let: "declare export var",
  type: "export type",
  interface: "export interface"
};

function partition(list, test) {
  const list1 = [];
  const list2 = [];

  for (let i = 0; i < list.length; i++) {
    (test(list[i], i, list) ? list1 : list2).push(list[i]);
  }

  return [list1, list2];
}

const FLOW_PRAGMA_REGEX = /\*?\s*@((?:no)?flow)\b/;

var _default = superClass => class extends superClass {
  constructor(options, input) {
    super(options, input);
    this.flowPragma = undefined;
  }

  shouldParseTypes() {
    return this.getPluginOption("flow", "all") || this.flowPragma === "flow";
  }

  addComment(comment) {
    if (this.flowPragma === undefined) {
      const matches = FLOW_PRAGMA_REGEX.exec(comment.value);

      if (!matches) {
        this.flowPragma = null;
      } else if (matches[1] === "flow") {
        this.flowPragma = "flow";
      } else if (matches[1] === "noflow") {
        this.flowPragma = "noflow";
      } else {
        throw new Error("Unexpected flow pragma");
      }
    }

    return super.addComment(comment);
  }

  flowParseTypeInitialiser(tok) {
    const oldInType = this.state.inType;
    this.state.inType = true;
    this.expect(tok || _types.types.colon);
    const type = this.flowParseType();
    this.state.inType = oldInType;
    return type;
  }

  flowParsePredicate() {
    const node = this.startNode();
    const moduloLoc = this.state.startLoc;
    const moduloPos = this.state.start;
    this.expect(_types.types.modulo);
    const checksLoc = this.state.startLoc;
    this.expectContextual("checks");

    if (moduloLoc.line !== checksLoc.line || moduloLoc.column !== checksLoc.column - 1) {
      this.raise(moduloPos, "Spaces between ´%´ and ´checks´ are not allowed here.");
    }

    if (this.eat(_types.types.parenL)) {
      node.value = this.parseExpression();
      this.expect(_types.types.parenR);
      return this.finishNode(node, "DeclaredPredicate");
    } else {
      return this.finishNode(node, "InferredPredicate");
    }
  }

  flowParseTypeAndPredicateInitialiser() {
    const oldInType = this.state.inType;
    this.state.inType = true;
    this.expect(_types.types.colon);
    let type = null;
    let predicate = null;

    if (this.match(_types.types.modulo)) {
      this.state.inType = oldInType;
      predicate = this.flowParsePredicate();
    } else {
      type = this.flowParseType();
      this.state.inType = oldInType;

      if (this.match(_types.types.modulo)) {
        predicate = this.flowParsePredicate();
      }
    }

    return [type, predicate];
  }

  flowParseDeclareClass(node) {
    this.next();
    this.flowParseInterfaceish(node, true);
    return this.finishNode(node, "DeclareClass");
  }

  flowParseDeclareFunction(node) {
    this.next();
    const id = node.id = this.parseIdentifier();
    const typeNode = this.startNode();
    const typeContainer = this.startNode();

    if (this.isRelational("<")) {
      typeNode.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      typeNode.typeParameters = null;
    }

    this.expect(_types.types.parenL);
    const tmp = this.flowParseFunctionTypeParams();
    typeNode.params = tmp.params;
    typeNode.rest = tmp.rest;
    this.expect(_types.types.parenR);
    [typeNode.returnType, node.predicate] = this.flowParseTypeAndPredicateInitialiser();
    typeContainer.typeAnnotation = this.finishNode(typeNode, "FunctionTypeAnnotation");
    id.typeAnnotation = this.finishNode(typeContainer, "TypeAnnotation");
    this.finishNode(id, id.type);
    this.semicolon();
    return this.finishNode(node, "DeclareFunction");
  }

  flowParseDeclare(node, insideModule) {
    if (this.match(_types.types._class)) {
      return this.flowParseDeclareClass(node);
    } else if (this.match(_types.types._function)) {
      return this.flowParseDeclareFunction(node);
    } else if (this.match(_types.types._var)) {
      return this.flowParseDeclareVariable(node);
    } else if (this.isContextual("module")) {
      if (this.lookahead().type === _types.types.dot) {
        return this.flowParseDeclareModuleExports(node);
      } else {
        if (insideModule) {
          this.unexpected(null, "`declare module` cannot be used inside another `declare module`");
        }

        return this.flowParseDeclareModule(node);
      }
    } else if (this.isContextual("type")) {
      return this.flowParseDeclareTypeAlias(node);
    } else if (this.isContextual("opaque")) {
      return this.flowParseDeclareOpaqueType(node);
    } else if (this.isContextual("interface")) {
      return this.flowParseDeclareInterface(node);
    } else if (this.match(_types.types._export)) {
      return this.flowParseDeclareExportDeclaration(node, insideModule);
    } else {
      throw this.unexpected();
    }
  }

  flowParseDeclareVariable(node) {
    this.next();
    node.id = this.flowParseTypeAnnotatableIdentifier(true);
    this.semicolon();
    return this.finishNode(node, "DeclareVariable");
  }

  flowParseDeclareModule(node) {
    this.next();

    if (this.match(_types.types.string)) {
      node.id = this.parseExprAtom();
    } else {
      node.id = this.parseIdentifier();
    }

    const bodyNode = node.body = this.startNode();
    const body = bodyNode.body = [];
    this.expect(_types.types.braceL);

    while (!this.match(_types.types.braceR)) {
      let bodyNode = this.startNode();

      if (this.match(_types.types._import)) {
        const lookahead = this.lookahead();

        if (lookahead.value !== "type" && lookahead.value !== "typeof") {
          this.unexpected(null, "Imports within a `declare module` body must always be `import type` or `import typeof`");
        }

        this.next();
        this.parseImport(bodyNode);
      } else {
        this.expectContextual("declare", "Only declares and type imports are allowed inside declare module");
        bodyNode = this.flowParseDeclare(bodyNode, true);
      }

      body.push(bodyNode);
    }

    this.expect(_types.types.braceR);
    this.finishNode(bodyNode, "BlockStatement");
    let kind = null;
    let hasModuleExport = false;
    const errorMessage = "Found both `declare module.exports` and `declare export` in the same module. " + "Modules can only have 1 since they are either an ES module or they are a CommonJS module";
    body.forEach(bodyElement => {
      if (isEsModuleType(bodyElement)) {
        if (kind === "CommonJS") {
          this.unexpected(bodyElement.start, errorMessage);
        }

        kind = "ES";
      } else if (bodyElement.type === "DeclareModuleExports") {
        if (hasModuleExport) {
          this.unexpected(bodyElement.start, "Duplicate `declare module.exports` statement");
        }

        if (kind === "ES") this.unexpected(bodyElement.start, errorMessage);
        kind = "CommonJS";
        hasModuleExport = true;
      }
    });
    node.kind = kind || "CommonJS";
    return this.finishNode(node, "DeclareModule");
  }

  flowParseDeclareExportDeclaration(node, insideModule) {
    this.expect(_types.types._export);

    if (this.eat(_types.types._default)) {
      if (this.match(_types.types._function) || this.match(_types.types._class)) {
        node.declaration = this.flowParseDeclare(this.startNode());
      } else {
        node.declaration = this.flowParseType();
        this.semicolon();
      }

      node.default = true;
      return this.finishNode(node, "DeclareExportDeclaration");
    } else {
      if (this.match(_types.types._const) || this.match(_types.types._let) || (this.isContextual("type") || this.isContextual("interface")) && !insideModule) {
        const label = this.state.value;
        const suggestion = exportSuggestions[label];
        this.unexpected(this.state.start, `\`declare export ${label}\` is not supported. Use \`${suggestion}\` instead`);
      }

      if (this.match(_types.types._var) || this.match(_types.types._function) || this.match(_types.types._class) || this.isContextual("opaque")) {
          node.declaration = this.flowParseDeclare(this.startNode());
          node.default = false;
          return this.finishNode(node, "DeclareExportDeclaration");
        } else if (this.match(_types.types.star) || this.match(_types.types.braceL) || this.isContextual("interface") || this.isContextual("type") || this.isContextual("opaque")) {
          node = this.parseExport(node);

          if (node.type === "ExportNamedDeclaration") {
            node.type = "ExportDeclaration";
            node.default = false;
            delete node.exportKind;
          }

          node.type = "Declare" + node.type;
          return node;
        }
    }

    throw this.unexpected();
  }

  flowParseDeclareModuleExports(node) {
    this.expectContextual("module");
    this.expect(_types.types.dot);
    this.expectContextual("exports");
    node.typeAnnotation = this.flowParseTypeAnnotation();
    this.semicolon();
    return this.finishNode(node, "DeclareModuleExports");
  }

  flowParseDeclareTypeAlias(node) {
    this.next();
    this.flowParseTypeAlias(node);
    return this.finishNode(node, "DeclareTypeAlias");
  }

  flowParseDeclareOpaqueType(node) {
    this.next();
    this.flowParseOpaqueType(node, true);
    return this.finishNode(node, "DeclareOpaqueType");
  }

  flowParseDeclareInterface(node) {
    this.next();
    this.flowParseInterfaceish(node);
    return this.finishNode(node, "DeclareInterface");
  }

  flowParseInterfaceish(node, isClass = false) {
    node.id = this.flowParseRestrictedIdentifier(!isClass);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.extends = [];
    node.implements = [];
    node.mixins = [];

    if (this.eat(_types.types._extends)) {
      do {
        node.extends.push(this.flowParseInterfaceExtends());
      } while (!isClass && this.eat(_types.types.comma));
    }

    if (this.isContextual("mixins")) {
      this.next();

      do {
        node.mixins.push(this.flowParseInterfaceExtends());
      } while (this.eat(_types.types.comma));
    }

    if (this.isContextual("implements")) {
      this.next();

      do {
        node.implements.push(this.flowParseInterfaceExtends());
      } while (this.eat(_types.types.comma));
    }

    node.body = this.flowParseObjectType({
      allowStatic: isClass,
      allowExact: false,
      allowSpread: false,
      allowProto: isClass,
      allowInexact: false
    });
  }

  flowParseInterfaceExtends() {
    const node = this.startNode();
    node.id = this.flowParseQualifiedTypeIdentifier();

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterInstantiation();
    } else {
      node.typeParameters = null;
    }

    return this.finishNode(node, "InterfaceExtends");
  }

  flowParseInterface(node) {
    this.flowParseInterfaceish(node);
    return this.finishNode(node, "InterfaceDeclaration");
  }

  checkReservedType(word, startLoc) {
    if (primitiveTypes.indexOf(word) > -1) {
      this.raise(startLoc, `Cannot overwrite primitive type ${word}`);
    }
  }

  flowParseRestrictedIdentifier(liberal) {
    this.checkReservedType(this.state.value, this.state.start);
    return this.parseIdentifier(liberal);
  }

  flowParseTypeAlias(node) {
    node.id = this.flowParseRestrictedIdentifier();

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.right = this.flowParseTypeInitialiser(_types.types.eq);
    this.semicolon();
    return this.finishNode(node, "TypeAlias");
  }

  flowParseOpaqueType(node, declare) {
    this.expectContextual("type");
    node.id = this.flowParseRestrictedIdentifier(true);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    } else {
      node.typeParameters = null;
    }

    node.supertype = null;

    if (this.match(_types.types.colon)) {
      node.supertype = this.flowParseTypeInitialiser(_types.types.colon);
    }

    node.impltype = null;

    if (!declare) {
      node.impltype = this.flowParseTypeInitialiser(_types.types.eq);
    }

    this.semicolon();
    return this.finishNode(node, "OpaqueType");
  }

  flowParseTypeParameter(allowDefault = true, requireDefault = false) {
    if (!allowDefault && requireDefault) {
      throw new Error("Cannot disallow a default value (`allowDefault`) while also requiring it (`requireDefault`).");
    }

    const nodeStart = this.state.start;
    const node = this.startNode();
    const variance = this.flowParseVariance();
    const ident = this.flowParseTypeAnnotatableIdentifier();
    node.name = ident.name;
    node.variance = variance;
    node.bound = ident.typeAnnotation;

    if (this.match(_types.types.eq)) {
      if (allowDefault) {
        this.eat(_types.types.eq);
        node.default = this.flowParseType();
      } else {
        this.unexpected();
      }
    } else {
      if (requireDefault) {
        this.unexpected(nodeStart, "Type parameter declaration needs a default, since a preceding type parameter declaration has a default.");
      }
    }

    return this.finishNode(node, "TypeParameter");
  }

  flowParseTypeParameterDeclaration(allowDefault = true) {
    const oldInType = this.state.inType;
    const node = this.startNode();
    node.params = [];
    this.state.inType = true;

    if (this.isRelational("<") || this.match(_types.types.jsxTagStart)) {
      this.next();
    } else {
      this.unexpected();
    }

    let defaultRequired = false;

    do {
      const typeParameter = this.flowParseTypeParameter(allowDefault, defaultRequired);
      node.params.push(typeParameter);

      if (typeParameter.default) {
        defaultRequired = true;
      }

      if (!this.isRelational(">")) {
        this.expect(_types.types.comma);
      }
    } while (!this.isRelational(">"));

    this.expectRelational(">");
    this.state.inType = oldInType;
    return this.finishNode(node, "TypeParameterDeclaration");
  }

  flowParseTypeParameterInstantiation() {
    const node = this.startNode();
    const oldInType = this.state.inType;
    node.params = [];
    this.state.inType = true;
    this.expectRelational("<");

    while (!this.isRelational(">")) {
      node.params.push(this.flowParseType());

      if (!this.isRelational(">")) {
        this.expect(_types.types.comma);
      }
    }

    this.expectRelational(">");
    this.state.inType = oldInType;
    return this.finishNode(node, "TypeParameterInstantiation");
  }

  flowParseInterfaceType() {
    const node = this.startNode();
    this.expectContextual("interface");
    node.extends = [];

    if (this.eat(_types.types._extends)) {
      do {
        node.extends.push(this.flowParseInterfaceExtends());
      } while (this.eat(_types.types.comma));
    }

    node.body = this.flowParseObjectType({
      allowStatic: false,
      allowExact: false,
      allowSpread: false,
      allowProto: false,
      allowInexact: false
    });
    return this.finishNode(node, "InterfaceTypeAnnotation");
  }

  flowParseObjectPropertyKey() {
    return this.match(_types.types.num) || this.match(_types.types.string) ? this.parseExprAtom() : this.parseIdentifier(true);
  }

  flowParseObjectTypeIndexer(node, isStatic, variance) {
    node.static = isStatic;

    if (this.lookahead().type === _types.types.colon) {
      node.id = this.flowParseObjectPropertyKey();
      node.key = this.flowParseTypeInitialiser();
    } else {
      node.id = null;
      node.key = this.flowParseType();
    }

    this.expect(_types.types.bracketR);
    node.value = this.flowParseTypeInitialiser();
    node.variance = variance;
    return this.finishNode(node, "ObjectTypeIndexer");
  }

  flowParseObjectTypeInternalSlot(node, isStatic) {
    node.static = isStatic;
    node.id = this.flowParseObjectPropertyKey();
    this.expect(_types.types.bracketR);
    this.expect(_types.types.bracketR);

    if (this.isRelational("<") || this.match(_types.types.parenL)) {
      node.method = true;
      node.optional = false;
      node.value = this.flowParseObjectTypeMethodish(this.startNodeAt(node.start, node.loc.start));
    } else {
      node.method = false;

      if (this.eat(_types.types.question)) {
        node.optional = true;
      }

      node.value = this.flowParseTypeInitialiser();
    }

    return this.finishNode(node, "ObjectTypeInternalSlot");
  }

  flowParseObjectTypeMethodish(node) {
    node.params = [];
    node.rest = null;
    node.typeParameters = null;

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration(false);
    }

    this.expect(_types.types.parenL);

    while (!this.match(_types.types.parenR) && !this.match(_types.types.ellipsis)) {
      node.params.push(this.flowParseFunctionTypeParam());

      if (!this.match(_types.types.parenR)) {
        this.expect(_types.types.comma);
      }
    }

    if (this.eat(_types.types.ellipsis)) {
      node.rest = this.flowParseFunctionTypeParam();
    }

    this.expect(_types.types.parenR);
    node.returnType = this.flowParseTypeInitialiser();
    return this.finishNode(node, "FunctionTypeAnnotation");
  }

  flowParseObjectTypeCallProperty(node, isStatic) {
    const valueNode = this.startNode();
    node.static = isStatic;
    node.value = this.flowParseObjectTypeMethodish(valueNode);
    return this.finishNode(node, "ObjectTypeCallProperty");
  }

  flowParseObjectType({
    allowStatic,
    allowExact,
    allowSpread,
    allowProto,
    allowInexact
  }) {
    const oldInType = this.state.inType;
    this.state.inType = true;
    const nodeStart = this.startNode();
    nodeStart.callProperties = [];
    nodeStart.properties = [];
    nodeStart.indexers = [];
    nodeStart.internalSlots = [];
    let endDelim;
    let exact;
    let inexact = false;

    if (allowExact && this.match(_types.types.braceBarL)) {
      this.expect(_types.types.braceBarL);
      endDelim = _types.types.braceBarR;
      exact = true;
    } else {
      this.expect(_types.types.braceL);
      endDelim = _types.types.braceR;
      exact = false;
    }

    nodeStart.exact = exact;

    while (!this.match(endDelim)) {
      let isStatic = false;
      let protoStart = null;
      const node = this.startNode();

      if (allowProto && this.isContextual("proto")) {
        const lookahead = this.lookahead();

        if (lookahead.type !== _types.types.colon && lookahead.type !== _types.types.question) {
          this.next();
          protoStart = this.state.start;
          allowStatic = false;
        }
      }

      if (allowStatic && this.isContextual("static")) {
        const lookahead = this.lookahead();

        if (lookahead.type !== _types.types.colon && lookahead.type !== _types.types.question) {
          this.next();
          isStatic = true;
        }
      }

      const variance = this.flowParseVariance();

      if (this.eat(_types.types.bracketL)) {
        if (protoStart != null) {
          this.unexpected(protoStart);
        }

        if (this.eat(_types.types.bracketL)) {
          if (variance) {
            this.unexpected(variance.start);
          }

          nodeStart.internalSlots.push(this.flowParseObjectTypeInternalSlot(node, isStatic));
        } else {
          nodeStart.indexers.push(this.flowParseObjectTypeIndexer(node, isStatic, variance));
        }
      } else if (this.match(_types.types.parenL) || this.isRelational("<")) {
        if (protoStart != null) {
          this.unexpected(protoStart);
        }

        if (variance) {
          this.unexpected(variance.start);
        }

        nodeStart.callProperties.push(this.flowParseObjectTypeCallProperty(node, isStatic));
      } else {
        let kind = "init";

        if (this.isContextual("get") || this.isContextual("set")) {
          const lookahead = this.lookahead();

          if (lookahead.type === _types.types.name || lookahead.type === _types.types.string || lookahead.type === _types.types.num) {
            kind = this.state.value;
            this.next();
          }
        }

        const propOrInexact = this.flowParseObjectTypeProperty(node, isStatic, protoStart, variance, kind, allowSpread, allowInexact);

        if (propOrInexact === null) {
          inexact = true;
        } else {
          nodeStart.properties.push(propOrInexact);
        }
      }

      this.flowObjectTypeSemicolon();
    }

    this.expect(endDelim);

    if (allowSpread) {
      nodeStart.inexact = inexact;
    }

    const out = this.finishNode(nodeStart, "ObjectTypeAnnotation");
    this.state.inType = oldInType;
    return out;
  }

  flowParseObjectTypeProperty(node, isStatic, protoStart, variance, kind, allowSpread, allowInexact) {
    if (this.match(_types.types.ellipsis)) {
      if (!allowSpread) {
        this.unexpected(null, "Spread operator cannot appear in class or interface definitions");
      }

      if (protoStart != null) {
        this.unexpected(protoStart);
      }

      if (variance) {
        this.unexpected(variance.start, "Spread properties cannot have variance");
      }

      this.expect(_types.types.ellipsis);
      const isInexactToken = this.eat(_types.types.comma) || this.eat(_types.types.semi);

      if (this.match(_types.types.braceR)) {
        if (allowInexact) return null;
        this.unexpected(null, "Explicit inexact syntax is only allowed inside inexact objects");
      }

      if (this.match(_types.types.braceBarR)) {
        this.unexpected(null, "Explicit inexact syntax cannot appear inside an explicit exact object type");
      }

      if (isInexactToken) {
        this.unexpected(null, "Explicit inexact syntax must appear at the end of an inexact object");
      }

      node.argument = this.flowParseType();
      return this.finishNode(node, "ObjectTypeSpreadProperty");
    } else {
      node.key = this.flowParseObjectPropertyKey();
      node.static = isStatic;
      node.proto = protoStart != null;
      node.kind = kind;
      let optional = false;

      if (this.isRelational("<") || this.match(_types.types.parenL)) {
        node.method = true;

        if (protoStart != null) {
          this.unexpected(protoStart);
        }

        if (variance) {
          this.unexpected(variance.start);
        }

        node.value = this.flowParseObjectTypeMethodish(this.startNodeAt(node.start, node.loc.start));

        if (kind === "get" || kind === "set") {
          this.flowCheckGetterSetterParams(node);
        }
      } else {
        if (kind !== "init") this.unexpected();
        node.method = false;

        if (this.eat(_types.types.question)) {
          optional = true;
        }

        node.value = this.flowParseTypeInitialiser();
        node.variance = variance;
      }

      node.optional = optional;
      return this.finishNode(node, "ObjectTypeProperty");
    }
  }

  flowCheckGetterSetterParams(property) {
    const paramCount = property.kind === "get" ? 0 : 1;
    const start = property.start;
    const length = property.value.params.length + (property.value.rest ? 1 : 0);

    if (length !== paramCount) {
      if (property.kind === "get") {
        this.raise(start, "getter must not have any formal parameters");
      } else {
        this.raise(start, "setter must have exactly one formal parameter");
      }
    }

    if (property.kind === "set" && property.value.rest) {
      this.raise(start, "setter function argument must not be a rest parameter");
    }
  }

  flowObjectTypeSemicolon() {
    if (!this.eat(_types.types.semi) && !this.eat(_types.types.comma) && !this.match(_types.types.braceR) && !this.match(_types.types.braceBarR)) {
      this.unexpected();
    }
  }

  flowParseQualifiedTypeIdentifier(startPos, startLoc, id) {
    startPos = startPos || this.state.start;
    startLoc = startLoc || this.state.startLoc;
    let node = id || this.parseIdentifier();

    while (this.eat(_types.types.dot)) {
      const node2 = this.startNodeAt(startPos, startLoc);
      node2.qualification = node;
      node2.id = this.parseIdentifier();
      node = this.finishNode(node2, "QualifiedTypeIdentifier");
    }

    return node;
  }

  flowParseGenericType(startPos, startLoc, id) {
    const node = this.startNodeAt(startPos, startLoc);
    node.typeParameters = null;
    node.id = this.flowParseQualifiedTypeIdentifier(startPos, startLoc, id);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterInstantiation();
    }

    return this.finishNode(node, "GenericTypeAnnotation");
  }

  flowParseTypeofType() {
    const node = this.startNode();
    this.expect(_types.types._typeof);
    node.argument = this.flowParsePrimaryType();
    return this.finishNode(node, "TypeofTypeAnnotation");
  }

  flowParseTupleType() {
    const node = this.startNode();
    node.types = [];
    this.expect(_types.types.bracketL);

    while (this.state.pos < this.input.length && !this.match(_types.types.bracketR)) {
      node.types.push(this.flowParseType());
      if (this.match(_types.types.bracketR)) break;
      this.expect(_types.types.comma);
    }

    this.expect(_types.types.bracketR);
    return this.finishNode(node, "TupleTypeAnnotation");
  }

  flowParseFunctionTypeParam() {
    let name = null;
    let optional = false;
    let typeAnnotation = null;
    const node = this.startNode();
    const lh = this.lookahead();

    if (lh.type === _types.types.colon || lh.type === _types.types.question) {
      name = this.parseIdentifier();

      if (this.eat(_types.types.question)) {
        optional = true;
      }

      typeAnnotation = this.flowParseTypeInitialiser();
    } else {
      typeAnnotation = this.flowParseType();
    }

    node.name = name;
    node.optional = optional;
    node.typeAnnotation = typeAnnotation;
    return this.finishNode(node, "FunctionTypeParam");
  }

  reinterpretTypeAsFunctionTypeParam(type) {
    const node = this.startNodeAt(type.start, type.loc.start);
    node.name = null;
    node.optional = false;
    node.typeAnnotation = type;
    return this.finishNode(node, "FunctionTypeParam");
  }

  flowParseFunctionTypeParams(params = []) {
    let rest = null;

    while (!this.match(_types.types.parenR) && !this.match(_types.types.ellipsis)) {
      params.push(this.flowParseFunctionTypeParam());

      if (!this.match(_types.types.parenR)) {
        this.expect(_types.types.comma);
      }
    }

    if (this.eat(_types.types.ellipsis)) {
      rest = this.flowParseFunctionTypeParam();
    }

    return {
      params,
      rest
    };
  }

  flowIdentToTypeAnnotation(startPos, startLoc, node, id) {
    switch (id.name) {
      case "any":
        return this.finishNode(node, "AnyTypeAnnotation");

      case "void":
        return this.finishNode(node, "VoidTypeAnnotation");

      case "bool":
      case "boolean":
        return this.finishNode(node, "BooleanTypeAnnotation");

      case "mixed":
        return this.finishNode(node, "MixedTypeAnnotation");

      case "empty":
        return this.finishNode(node, "EmptyTypeAnnotation");

      case "number":
        return this.finishNode(node, "NumberTypeAnnotation");

      case "string":
        return this.finishNode(node, "StringTypeAnnotation");

      default:
        return this.flowParseGenericType(startPos, startLoc, id);
    }
  }

  flowParsePrimaryType() {
    const startPos = this.state.start;
    const startLoc = this.state.startLoc;
    const node = this.startNode();
    let tmp;
    let type;
    let isGroupedType = false;
    const oldNoAnonFunctionType = this.state.noAnonFunctionType;

    switch (this.state.type) {
      case _types.types.name:
        if (this.isContextual("interface")) {
          return this.flowParseInterfaceType();
        }

        return this.flowIdentToTypeAnnotation(startPos, startLoc, node, this.parseIdentifier());

      case _types.types.braceL:
        return this.flowParseObjectType({
          allowStatic: false,
          allowExact: false,
          allowSpread: true,
          allowProto: false,
          allowInexact: true
        });

      case _types.types.braceBarL:
        return this.flowParseObjectType({
          allowStatic: false,
          allowExact: true,
          allowSpread: true,
          allowProto: false,
          allowInexact: false
        });

      case _types.types.bracketL:
        return this.flowParseTupleType();

      case _types.types.relational:
        if (this.state.value === "<") {
          node.typeParameters = this.flowParseTypeParameterDeclaration(false);
          this.expect(_types.types.parenL);
          tmp = this.flowParseFunctionTypeParams();
          node.params = tmp.params;
          node.rest = tmp.rest;
          this.expect(_types.types.parenR);
          this.expect(_types.types.arrow);
          node.returnType = this.flowParseType();
          return this.finishNode(node, "FunctionTypeAnnotation");
        }

        break;

      case _types.types.parenL:
        this.next();

        if (!this.match(_types.types.parenR) && !this.match(_types.types.ellipsis)) {
          if (this.match(_types.types.name)) {
            const token = this.lookahead().type;
            isGroupedType = token !== _types.types.question && token !== _types.types.colon;
          } else {
            isGroupedType = true;
          }
        }

        if (isGroupedType) {
          this.state.noAnonFunctionType = false;
          type = this.flowParseType();
          this.state.noAnonFunctionType = oldNoAnonFunctionType;

          if (this.state.noAnonFunctionType || !(this.match(_types.types.comma) || this.match(_types.types.parenR) && this.lookahead().type === _types.types.arrow)) {
            this.expect(_types.types.parenR);
            return type;
          } else {
            this.eat(_types.types.comma);
          }
        }

        if (type) {
          tmp = this.flowParseFunctionTypeParams([this.reinterpretTypeAsFunctionTypeParam(type)]);
        } else {
          tmp = this.flowParseFunctionTypeParams();
        }

        node.params = tmp.params;
        node.rest = tmp.rest;
        this.expect(_types.types.parenR);
        this.expect(_types.types.arrow);
        node.returnType = this.flowParseType();
        node.typeParameters = null;
        return this.finishNode(node, "FunctionTypeAnnotation");

      case _types.types.string:
        return this.parseLiteral(this.state.value, "StringLiteralTypeAnnotation");

      case _types.types._true:
      case _types.types._false:
        node.value = this.match(_types.types._true);
        this.next();
        return this.finishNode(node, "BooleanLiteralTypeAnnotation");

      case _types.types.plusMin:
        if (this.state.value === "-") {
          this.next();

          if (!this.match(_types.types.num)) {
            this.unexpected(null, `Unexpected token, expected "number"`);
          }

          return this.parseLiteral(-this.state.value, "NumberLiteralTypeAnnotation", node.start, node.loc.start);
        }

        this.unexpected();

      case _types.types.num:
        return this.parseLiteral(this.state.value, "NumberLiteralTypeAnnotation");

      case _types.types._null:
        this.next();
        return this.finishNode(node, "NullLiteralTypeAnnotation");

      case _types.types._this:
        this.next();
        return this.finishNode(node, "ThisTypeAnnotation");

      case _types.types.star:
        this.next();
        return this.finishNode(node, "ExistsTypeAnnotation");

      default:
        if (this.state.type.keyword === "typeof") {
          return this.flowParseTypeofType();
        }

    }

    throw this.unexpected();
  }

  flowParsePostfixType() {
    const startPos = this.state.start,
          startLoc = this.state.startLoc;
    let type = this.flowParsePrimaryType();

    while (!this.canInsertSemicolon() && this.match(_types.types.bracketL)) {
      const node = this.startNodeAt(startPos, startLoc);
      node.elementType = type;
      this.expect(_types.types.bracketL);
      this.expect(_types.types.bracketR);
      type = this.finishNode(node, "ArrayTypeAnnotation");
    }

    return type;
  }

  flowParsePrefixType() {
    const node = this.startNode();

    if (this.eat(_types.types.question)) {
      node.typeAnnotation = this.flowParsePrefixType();
      return this.finishNode(node, "NullableTypeAnnotation");
    } else {
      return this.flowParsePostfixType();
    }
  }

  flowParseAnonFunctionWithoutParens() {
    const param = this.flowParsePrefixType();

    if (!this.state.noAnonFunctionType && this.eat(_types.types.arrow)) {
      const node = this.startNodeAt(param.start, param.loc.start);
      node.params = [this.reinterpretTypeAsFunctionTypeParam(param)];
      node.rest = null;
      node.returnType = this.flowParseType();
      node.typeParameters = null;
      return this.finishNode(node, "FunctionTypeAnnotation");
    }

    return param;
  }

  flowParseIntersectionType() {
    const node = this.startNode();
    this.eat(_types.types.bitwiseAND);
    const type = this.flowParseAnonFunctionWithoutParens();
    node.types = [type];

    while (this.eat(_types.types.bitwiseAND)) {
      node.types.push(this.flowParseAnonFunctionWithoutParens());
    }

    return node.types.length === 1 ? type : this.finishNode(node, "IntersectionTypeAnnotation");
  }

  flowParseUnionType() {
    const node = this.startNode();
    this.eat(_types.types.bitwiseOR);
    const type = this.flowParseIntersectionType();
    node.types = [type];

    while (this.eat(_types.types.bitwiseOR)) {
      node.types.push(this.flowParseIntersectionType());
    }

    return node.types.length === 1 ? type : this.finishNode(node, "UnionTypeAnnotation");
  }

  flowParseType() {
    const oldInType = this.state.inType;
    this.state.inType = true;
    const type = this.flowParseUnionType();
    this.state.inType = oldInType;
    this.state.exprAllowed = this.state.exprAllowed || this.state.noAnonFunctionType;
    return type;
  }

  flowParseTypeAnnotation() {
    const node = this.startNode();
    node.typeAnnotation = this.flowParseTypeInitialiser();
    return this.finishNode(node, "TypeAnnotation");
  }

  flowParseTypeAnnotatableIdentifier(allowPrimitiveOverride) {
    const ident = allowPrimitiveOverride ? this.parseIdentifier() : this.flowParseRestrictedIdentifier();

    if (this.match(_types.types.colon)) {
      ident.typeAnnotation = this.flowParseTypeAnnotation();
      this.finishNode(ident, ident.type);
    }

    return ident;
  }

  typeCastToParameter(node) {
    node.expression.typeAnnotation = node.typeAnnotation;
    return this.finishNodeAt(node.expression, node.expression.type, node.typeAnnotation.end, node.typeAnnotation.loc.end);
  }

  flowParseVariance() {
    let variance = null;

    if (this.match(_types.types.plusMin)) {
      variance = this.startNode();

      if (this.state.value === "+") {
        variance.kind = "plus";
      } else {
        variance.kind = "minus";
      }

      this.next();
      this.finishNode(variance, "Variance");
    }

    return variance;
  }

  parseFunctionBody(node, allowExpressionBody) {
    if (allowExpressionBody) {
      return this.forwardNoArrowParamsConversionAt(node, () => super.parseFunctionBody(node, true));
    }

    return super.parseFunctionBody(node, false);
  }

  parseFunctionBodyAndFinish(node, type, allowExpressionBody) {
    if (!allowExpressionBody && this.match(_types.types.colon)) {
      const typeNode = this.startNode();
      [typeNode.typeAnnotation, node.predicate] = this.flowParseTypeAndPredicateInitialiser();
      node.returnType = typeNode.typeAnnotation ? this.finishNode(typeNode, "TypeAnnotation") : null;
    }

    super.parseFunctionBodyAndFinish(node, type, allowExpressionBody);
  }

  parseStatement(declaration, topLevel) {
    if (this.state.strict && this.match(_types.types.name) && this.state.value === "interface") {
      const node = this.startNode();
      this.next();
      return this.flowParseInterface(node);
    } else {
      const stmt = super.parseStatement(declaration, topLevel);

      if (this.flowPragma === undefined && !this.isValidDirective(stmt)) {
        this.flowPragma = null;
      }

      return stmt;
    }
  }

  parseExpressionStatement(node, expr) {
    if (expr.type === "Identifier") {
      if (expr.name === "declare") {
        if (this.match(_types.types._class) || this.match(_types.types.name) || this.match(_types.types._function) || this.match(_types.types._var) || this.match(_types.types._export)) {
          return this.flowParseDeclare(node);
        }
      } else if (this.match(_types.types.name)) {
        if (expr.name === "interface") {
          return this.flowParseInterface(node);
        } else if (expr.name === "type") {
          return this.flowParseTypeAlias(node);
        } else if (expr.name === "opaque") {
          return this.flowParseOpaqueType(node, false);
        }
      }
    }

    return super.parseExpressionStatement(node, expr);
  }

  shouldParseExportDeclaration() {
    return this.isContextual("type") || this.isContextual("interface") || this.isContextual("opaque") || super.shouldParseExportDeclaration();
  }

  isExportDefaultSpecifier() {
    if (this.match(_types.types.name) && (this.state.value === "type" || this.state.value === "interface" || this.state.value == "opaque")) {
      return false;
    }

    return super.isExportDefaultSpecifier();
  }

  parseConditional(expr, noIn, startPos, startLoc, refNeedsArrowPos) {
    if (!this.match(_types.types.question)) return expr;

    if (refNeedsArrowPos) {
      const state = this.state.clone();

      try {
        return super.parseConditional(expr, noIn, startPos, startLoc);
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.state = state;
          refNeedsArrowPos.start = err.pos || this.state.start;
          return expr;
        } else {
          throw err;
        }
      }
    }

    this.expect(_types.types.question);
    const state = this.state.clone();
    const originalNoArrowAt = this.state.noArrowAt;
    const node = this.startNodeAt(startPos, startLoc);
    let {
      consequent,
      failed
    } = this.tryParseConditionalConsequent();
    let [valid, invalid] = this.getArrowLikeExpressions(consequent);

    if (failed || invalid.length > 0) {
      const noArrowAt = [...originalNoArrowAt];

      if (invalid.length > 0) {
        this.state = state;
        this.state.noArrowAt = noArrowAt;

        for (let i = 0; i < invalid.length; i++) {
          noArrowAt.push(invalid[i].start);
        }

        ({
          consequent,
          failed
        } = this.tryParseConditionalConsequent());
        [valid, invalid] = this.getArrowLikeExpressions(consequent);
      }

      if (failed && valid.length > 1) {
        this.raise(state.start, "Ambiguous expression: wrap the arrow functions in parentheses to disambiguate.");
      }

      if (failed && valid.length === 1) {
        this.state = state;
        this.state.noArrowAt = noArrowAt.concat(valid[0].start);
        ({
          consequent,
          failed
        } = this.tryParseConditionalConsequent());
      }

      this.getArrowLikeExpressions(consequent, true);
    }

    this.state.noArrowAt = originalNoArrowAt;
    this.expect(_types.types.colon);
    node.test = expr;
    node.consequent = consequent;
    node.alternate = this.forwardNoArrowParamsConversionAt(node, () => this.parseMaybeAssign(noIn, undefined, undefined, undefined));
    return this.finishNode(node, "ConditionalExpression");
  }

  tryParseConditionalConsequent() {
    this.state.noArrowParamsConversionAt.push(this.state.start);
    const consequent = this.parseMaybeAssign();
    const failed = !this.match(_types.types.colon);
    this.state.noArrowParamsConversionAt.pop();
    return {
      consequent,
      failed
    };
  }

  getArrowLikeExpressions(node, disallowInvalid) {
    const stack = [node];
    const arrows = [];

    while (stack.length !== 0) {
      const node = stack.pop();

      if (node.type === "ArrowFunctionExpression") {
        if (node.typeParameters || !node.returnType) {
          this.toAssignableList(node.params, true, "arrow function parameters");
          super.checkFunctionNameAndParams(node, true);
        } else {
          arrows.push(node);
        }

        stack.push(node.body);
      } else if (node.type === "ConditionalExpression") {
        stack.push(node.consequent);
        stack.push(node.alternate);
      }
    }

    if (disallowInvalid) {
      for (let i = 0; i < arrows.length; i++) {
        this.toAssignableList(node.params, true, "arrow function parameters");
      }

      return [arrows, []];
    }

    return partition(arrows, node => {
      try {
        this.toAssignableList(node.params, true, "arrow function parameters");
        return true;
      } catch (err) {
        return false;
      }
    });
  }

  forwardNoArrowParamsConversionAt(node, parse) {
    let result;

    if (this.state.noArrowParamsConversionAt.indexOf(node.start) !== -1) {
      this.state.noArrowParamsConversionAt.push(this.state.start);
      result = parse();
      this.state.noArrowParamsConversionAt.pop();
    } else {
      result = parse();
    }

    return result;
  }

  parseParenItem(node, startPos, startLoc) {
    node = super.parseParenItem(node, startPos, startLoc);

    if (this.eat(_types.types.question)) {
      node.optional = true;
    }

    if (this.match(_types.types.colon)) {
      const typeCastNode = this.startNodeAt(startPos, startLoc);
      typeCastNode.expression = node;
      typeCastNode.typeAnnotation = this.flowParseTypeAnnotation();
      return this.finishNode(typeCastNode, "TypeCastExpression");
    }

    return node;
  }

  assertModuleNodeAllowed(node) {
    if (node.type === "ImportDeclaration" && (node.importKind === "type" || node.importKind === "typeof") || node.type === "ExportNamedDeclaration" && node.exportKind === "type" || node.type === "ExportAllDeclaration" && node.exportKind === "type") {
      return;
    }

    super.assertModuleNodeAllowed(node);
  }

  parseExport(node) {
    node = super.parseExport(node);

    if (node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration") {
      node.exportKind = node.exportKind || "value";
    }

    return node;
  }

  parseExportDeclaration(node) {
    if (this.isContextual("type")) {
      node.exportKind = "type";
      const declarationNode = this.startNode();
      this.next();

      if (this.match(_types.types.braceL)) {
        node.specifiers = this.parseExportSpecifiers();
        this.parseExportFrom(node);
        return null;
      } else {
        return this.flowParseTypeAlias(declarationNode);
      }
    } else if (this.isContextual("opaque")) {
      node.exportKind = "type";
      const declarationNode = this.startNode();
      this.next();
      return this.flowParseOpaqueType(declarationNode, false);
    } else if (this.isContextual("interface")) {
      node.exportKind = "type";
      const declarationNode = this.startNode();
      this.next();
      return this.flowParseInterface(declarationNode);
    } else {
      return super.parseExportDeclaration(node);
    }
  }

  shouldParseExportStar() {
    return super.shouldParseExportStar() || this.isContextual("type") && this.lookahead().type === _types.types.star;
  }

  parseExportStar(node) {
    if (this.eatContextual("type")) {
      node.exportKind = "type";
    }

    return super.parseExportStar(node);
  }

  parseExportNamespace(node) {
    if (node.exportKind === "type") {
      this.unexpected();
    }

    return super.parseExportNamespace(node);
  }

  parseClassId(node, isStatement, optionalId) {
    super.parseClassId(node, isStatement, optionalId);

    if (this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration();
    }
  }

  isKeyword(name) {
    if (this.state.inType && name === "void") {
      return false;
    } else {
      return super.isKeyword(name);
    }
  }

  readToken(code) {
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (this.state.inType && (code === 62 || code === 60)) {
      return this.finishOp(_types.types.relational, 1);
    } else if ((0, _identifier.isIteratorStart)(code, next)) {
      this.state.isIterator = true;
      return super.readWord();
    } else {
      return super.readToken(code);
    }
  }

  toAssignable(node, isBinding, contextDescription) {
    if (node.type === "TypeCastExpression") {
      return super.toAssignable(this.typeCastToParameter(node), isBinding, contextDescription);
    } else {
      return super.toAssignable(node, isBinding, contextDescription);
    }
  }

  toAssignableList(exprList, isBinding, contextDescription) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];

      if (expr && expr.type === "TypeCastExpression") {
        exprList[i] = this.typeCastToParameter(expr);
      }
    }

    return super.toAssignableList(exprList, isBinding, contextDescription);
  }

  toReferencedList(exprList) {
    for (let i = 0; i < exprList.length; i++) {
      const expr = exprList[i];

      if (expr && expr._exprListItem && expr.type === "TypeCastExpression") {
        this.raise(expr.start, "Unexpected type cast");
      }
    }

    return exprList;
  }

  parseExprListItem(allowEmpty, refShorthandDefaultPos, refNeedsArrowPos) {
    const container = this.startNode();
    const node = super.parseExprListItem(allowEmpty, refShorthandDefaultPos, refNeedsArrowPos);

    if (this.match(_types.types.colon)) {
      container._exprListItem = true;
      container.expression = node;
      container.typeAnnotation = this.flowParseTypeAnnotation();
      return this.finishNode(container, "TypeCastExpression");
    } else {
      return node;
    }
  }

  checkLVal(expr, isBinding, checkClashes, contextDescription) {
    if (expr.type !== "TypeCastExpression") {
      return super.checkLVal(expr, isBinding, checkClashes, contextDescription);
    }
  }

  parseClassProperty(node) {
    if (this.match(_types.types.colon)) {
      node.typeAnnotation = this.flowParseTypeAnnotation();
    }

    return super.parseClassProperty(node);
  }

  parseClassPrivateProperty(node) {
    if (this.match(_types.types.colon)) {
      node.typeAnnotation = this.flowParseTypeAnnotation();
    }

    return super.parseClassPrivateProperty(node);
  }

  isClassMethod() {
    return this.isRelational("<") || super.isClassMethod();
  }

  isClassProperty() {
    return this.match(_types.types.colon) || super.isClassProperty();
  }

  isNonstaticConstructor(method) {
    return !this.match(_types.types.colon) && super.isNonstaticConstructor(method);
  }

  pushClassMethod(classBody, method, isGenerator, isAsync, isConstructor) {
    if (method.variance) {
      this.unexpected(method.variance.start);
    }

    delete method.variance;

    if (this.isRelational("<")) {
      method.typeParameters = this.flowParseTypeParameterDeclaration(false);
    }

    super.pushClassMethod(classBody, method, isGenerator, isAsync, isConstructor);
  }

  pushClassPrivateMethod(classBody, method, isGenerator, isAsync) {
    if (method.variance) {
      this.unexpected(method.variance.start);
    }

    delete method.variance;

    if (this.isRelational("<")) {
      method.typeParameters = this.flowParseTypeParameterDeclaration();
    }

    super.pushClassPrivateMethod(classBody, method, isGenerator, isAsync);
  }

  parseClassSuper(node) {
    super.parseClassSuper(node);

    if (node.superClass && this.isRelational("<")) {
      node.superTypeParameters = this.flowParseTypeParameterInstantiation();
    }

    if (this.isContextual("implements")) {
      this.next();
      const implemented = node.implements = [];

      do {
        const node = this.startNode();
        node.id = this.flowParseRestrictedIdentifier(true);

        if (this.isRelational("<")) {
          node.typeParameters = this.flowParseTypeParameterInstantiation();
        } else {
          node.typeParameters = null;
        }

        implemented.push(this.finishNode(node, "ClassImplements"));
      } while (this.eat(_types.types.comma));
    }
  }

  parsePropertyName(node) {
    const variance = this.flowParseVariance();
    const key = super.parsePropertyName(node);
    node.variance = variance;
    return key;
  }

  parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos, containsEsc) {
    if (prop.variance) {
      this.unexpected(prop.variance.start);
    }

    delete prop.variance;
    let typeParameters;

    if (this.isRelational("<")) {
      typeParameters = this.flowParseTypeParameterDeclaration(false);
      if (!this.match(_types.types.parenL)) this.unexpected();
    }

    super.parseObjPropValue(prop, startPos, startLoc, isGenerator, isAsync, isPattern, refShorthandDefaultPos, containsEsc);

    if (typeParameters) {
      (prop.value || prop).typeParameters = typeParameters;
    }
  }

  parseAssignableListItemTypes(param) {
    if (this.eat(_types.types.question)) {
      if (param.type !== "Identifier") {
        throw this.raise(param.start, "A binding pattern parameter cannot be optional in an implementation signature.");
      }

      param.optional = true;
    }

    if (this.match(_types.types.colon)) {
      param.typeAnnotation = this.flowParseTypeAnnotation();
    }

    this.finishNode(param, param.type);
    return param;
  }

  parseMaybeDefault(startPos, startLoc, left) {
    const node = super.parseMaybeDefault(startPos, startLoc, left);

    if (node.type === "AssignmentPattern" && node.typeAnnotation && node.right.start < node.typeAnnotation.start) {
      this.raise(node.typeAnnotation.start, "Type annotations must come before default assignments, " + "e.g. instead of `age = 25: number` use `age: number = 25`");
    }

    return node;
  }

  shouldParseDefaultImport(node) {
    if (!hasTypeImportKind(node)) {
      return super.shouldParseDefaultImport(node);
    }

    return isMaybeDefaultImport(this.state);
  }

  parseImportSpecifierLocal(node, specifier, type, contextDescription) {
    specifier.local = hasTypeImportKind(node) ? this.flowParseRestrictedIdentifier(true) : this.parseIdentifier();
    this.checkLVal(specifier.local, true, undefined, contextDescription);
    node.specifiers.push(this.finishNode(specifier, type));
  }

  parseImportSpecifiers(node) {
    node.importKind = "value";
    let kind = null;

    if (this.match(_types.types._typeof)) {
      kind = "typeof";
    } else if (this.isContextual("type")) {
      kind = "type";
    }

    if (kind) {
      const lh = this.lookahead();

      if (kind === "type" && lh.type === _types.types.star) {
        this.unexpected(lh.start);
      }

      if (isMaybeDefaultImport(lh) || lh.type === _types.types.braceL || lh.type === _types.types.star) {
        this.next();
        node.importKind = kind;
      }
    }

    super.parseImportSpecifiers(node);
  }

  parseImportSpecifier(node) {
    const specifier = this.startNode();
    const firstIdentLoc = this.state.start;
    const firstIdent = this.parseIdentifier(true);
    let specifierTypeKind = null;

    if (firstIdent.name === "type") {
      specifierTypeKind = "type";
    } else if (firstIdent.name === "typeof") {
      specifierTypeKind = "typeof";
    }

    let isBinding = false;

    if (this.isContextual("as") && !this.isLookaheadContextual("as")) {
      const as_ident = this.parseIdentifier(true);

      if (specifierTypeKind !== null && !this.match(_types.types.name) && !this.state.type.keyword) {
        specifier.imported = as_ident;
        specifier.importKind = specifierTypeKind;
        specifier.local = as_ident.__clone();
      } else {
        specifier.imported = firstIdent;
        specifier.importKind = null;
        specifier.local = this.parseIdentifier();
      }
    } else if (specifierTypeKind !== null && (this.match(_types.types.name) || this.state.type.keyword)) {
      specifier.imported = this.parseIdentifier(true);
      specifier.importKind = specifierTypeKind;

      if (this.eatContextual("as")) {
        specifier.local = this.parseIdentifier();
      } else {
        isBinding = true;
        specifier.local = specifier.imported.__clone();
      }
    } else {
      isBinding = true;
      specifier.imported = firstIdent;
      specifier.importKind = null;
      specifier.local = specifier.imported.__clone();
    }

    const nodeIsTypeImport = hasTypeImportKind(node);
    const specifierIsTypeImport = hasTypeImportKind(specifier);

    if (nodeIsTypeImport && specifierIsTypeImport) {
      this.raise(firstIdentLoc, "The `type` and `typeof` keywords on named imports can only be used on regular " + "`import` statements. It cannot be used with `import type` or `import typeof` statements");
    }

    if (nodeIsTypeImport || specifierIsTypeImport) {
      this.checkReservedType(specifier.local.name, specifier.local.start);
    }

    if (isBinding && !nodeIsTypeImport && !specifierIsTypeImport) {
      this.checkReservedWord(specifier.local.name, specifier.start, true, true);
    }

    this.checkLVal(specifier.local, true, undefined, "import specifier");
    node.specifiers.push(this.finishNode(specifier, "ImportSpecifier"));
  }

  parseFunctionParams(node) {
    const kind = node.kind;

    if (kind !== "get" && kind !== "set" && this.isRelational("<")) {
      node.typeParameters = this.flowParseTypeParameterDeclaration(false);
    }

    super.parseFunctionParams(node);
  }

  parseVarHead(decl) {
    super.parseVarHead(decl);

    if (this.match(_types.types.colon)) {
      decl.id.typeAnnotation = this.flowParseTypeAnnotation();
      this.finishNode(decl.id, decl.id.type);
    }
  }

  parseAsyncArrowFromCallExpression(node, call) {
    if (this.match(_types.types.colon)) {
      const oldNoAnonFunctionType = this.state.noAnonFunctionType;
      this.state.noAnonFunctionType = true;
      node.returnType = this.flowParseTypeAnnotation();
      this.state.noAnonFunctionType = oldNoAnonFunctionType;
    }

    return super.parseAsyncArrowFromCallExpression(node, call);
  }

  shouldParseAsyncArrow() {
    return this.match(_types.types.colon) || super.shouldParseAsyncArrow();
  }

  parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos) {
    let jsxError = null;

    if (_types.types.jsxTagStart && this.match(_types.types.jsxTagStart)) {
      const state = this.state.clone();

      try {
        return super.parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos);
      } catch (err) {
        if (err instanceof SyntaxError) {
          this.state = state;
          this.state.context.length -= 2;
          jsxError = err;
        } else {
          throw err;
        }
      }
    }

    if (jsxError != null || this.isRelational("<")) {
      let arrowExpression;
      let typeParameters;

      try {
        typeParameters = this.flowParseTypeParameterDeclaration();
        arrowExpression = this.forwardNoArrowParamsConversionAt(typeParameters, () => super.parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos));
        arrowExpression.typeParameters = typeParameters;
        this.resetStartLocationFromNode(arrowExpression, typeParameters);
      } catch (err) {
        throw jsxError || err;
      }

      if (arrowExpression.type === "ArrowFunctionExpression") {
        return arrowExpression;
      } else if (jsxError != null) {
        throw jsxError;
      } else {
        this.raise(typeParameters.start, "Expected an arrow function after this type parameter declaration");
      }
    }

    return super.parseMaybeAssign(noIn, refShorthandDefaultPos, afterLeftParse, refNeedsArrowPos);
  }

  parseArrow(node) {
    if (this.match(_types.types.colon)) {
      const state = this.state.clone();

      try {
        const oldNoAnonFunctionType = this.state.noAnonFunctionType;
        this.state.noAnonFunctionType = true;
        const typeNode = this.startNode();
        [typeNode.typeAnnotation, node.predicate] = this.flowParseTypeAndPredicateInitialiser();
        this.state.noAnonFunctionType = oldNoAnonFunctionType;
        if (this.canInsertSemicolon()) this.unexpected();
        if (!this.match(_types.types.arrow)) this.unexpected();
        node.returnType = typeNode.typeAnnotation ? this.finishNode(typeNode, "TypeAnnotation") : null;
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

  shouldParseArrow() {
    return this.match(_types.types.colon) || super.shouldParseArrow();
  }

  setArrowFunctionParameters(node, params) {
    if (this.state.noArrowParamsConversionAt.indexOf(node.start) !== -1) {
      node.params = params;
    } else {
      super.setArrowFunctionParameters(node, params);
    }
  }

  checkFunctionNameAndParams(node, isArrowFunction) {
    if (isArrowFunction && this.state.noArrowParamsConversionAt.indexOf(node.start) !== -1) {
      return;
    }

    return super.checkFunctionNameAndParams(node, isArrowFunction);
  }

  parseParenAndDistinguishExpression(canBeArrow) {
    return super.parseParenAndDistinguishExpression(canBeArrow && this.state.noArrowAt.indexOf(this.state.start) === -1);
  }

  parseSubscripts(base, startPos, startLoc, noCalls) {
    if (base.type === "Identifier" && base.name === "async" && this.state.noArrowAt.indexOf(startPos) !== -1) {
      this.next();
      const node = this.startNodeAt(startPos, startLoc);
      node.callee = base;
      node.arguments = this.parseCallExpressionArguments(_types.types.parenR, false);
      base = this.finishNode(node, "CallExpression");
    } else if (base.type === "Identifier" && base.name === "async" && this.isRelational("<")) {
      const state = this.state.clone();
      let error;

      try {
        const node = this.parseAsyncArrowWithTypeParameters(startPos, startLoc);
        if (node) return node;
      } catch (e) {
        error = e;
      }

      this.state = state;

      try {
        return super.parseSubscripts(base, startPos, startLoc, noCalls);
      } catch (e) {
        throw error || e;
      }
    }

    return super.parseSubscripts(base, startPos, startLoc, noCalls);
  }

  parseSubscript(base, startPos, startLoc, noCalls, subscriptState) {
    if (this.match(_types.types.questionDot) && this.isLookaheadRelational("<")) {
      this.expectPlugin("optionalChaining");
      subscriptState.optionalChainMember = true;

      if (noCalls) {
        subscriptState.stop = true;
        return base;
      }

      this.next();
      const node = this.startNodeAt(startPos, startLoc);
      node.callee = base;
      node.typeArguments = this.flowParseTypeParameterInstantiation();
      this.expect(_types.types.parenL);
      node.arguments = this.parseCallExpressionArguments(_types.types.parenR, false);
      node.optional = true;
      return this.finishNode(node, "OptionalCallExpression");
    } else if (!noCalls && this.shouldParseTypes() && this.isRelational("<")) {
      const node = this.startNodeAt(startPos, startLoc);
      node.callee = base;
      const state = this.state.clone();

      try {
        node.typeArguments = this.flowParseTypeParameterInstantiation();
        this.expect(_types.types.parenL);
        node.arguments = this.parseCallExpressionArguments(_types.types.parenR, false);

        if (subscriptState.optionalChainMember) {
          node.optional = false;
          return this.finishNode(node, "OptionalCallExpression");
        }

        return this.finishNode(node, "CallExpression");
      } catch (e) {
        if (e instanceof SyntaxError) {
          this.state = state;
        } else {
          throw e;
        }
      }
    }

    return super.parseSubscript(base, startPos, startLoc, noCalls, subscriptState);
  }

  parseNewArguments(node) {
    let targs = null;

    if (this.shouldParseTypes() && this.isRelational("<")) {
      const state = this.state.clone();

      try {
        targs = this.flowParseTypeParameterInstantiation();
      } catch (e) {
        if (e instanceof SyntaxError) {
          this.state = state;
        } else {
          throw e;
        }
      }
    }

    node.typeArguments = targs;
    super.parseNewArguments(node);
  }

  parseAsyncArrowWithTypeParameters(startPos, startLoc) {
    const node = this.startNodeAt(startPos, startLoc);
    this.parseFunctionParams(node);
    if (!this.parseArrow(node)) return;
    return this.parseArrowExpression(node, undefined, true);
  }

  readToken_mult_modulo(code) {
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (code === 42 && next === 47 && this.state.hasFlowComment) {
      this.state.hasFlowComment = false;
      this.state.pos += 2;
      this.nextToken();
      return;
    }

    super.readToken_mult_modulo(code);
  }

  skipBlockComment() {
    if (this.hasPlugin("flow") && this.hasPlugin("flowComments") && this.skipFlowComment()) {
      this.hasFlowCommentCompletion();
      this.state.pos += this.skipFlowComment();
      this.state.hasFlowComment = true;
      return;
    }

    let end;

    if (this.hasPlugin("flow") && this.state.hasFlowComment) {
      end = this.input.indexOf("*-/", this.state.pos += 2);
      if (end === -1) this.raise(this.state.pos - 2, "Unterminated comment");
      this.state.pos = end + 3;
      return;
    }

    super.skipBlockComment();
  }

  skipFlowComment() {
    const ch2 = this.input.charCodeAt(this.state.pos + 2);
    const ch3 = this.input.charCodeAt(this.state.pos + 3);

    if (ch2 === 58 && ch3 === 58) {
      return 4;
    }

    if (this.input.slice(this.state.pos + 2, 14) === "flow-include") {
      return 14;
    }

    if (ch2 === 58 && ch3 !== 58) {
      return 2;
    }

    return false;
  }

  hasFlowCommentCompletion() {
    const end = this.input.indexOf("*/", this.state.pos);

    if (end === -1) {
      this.raise(this.state.pos, "Unterminated comment");
    }
  }

};

exports.default = _default;