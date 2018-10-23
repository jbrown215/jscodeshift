"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Token = void 0;

var _identifier = require("../util/identifier");

var _types = require("./types");

var _context = require("./context");

var _location = _interopRequireDefault(require("../parser/location"));

var _location2 = require("../util/location");

var _whitespace = require("../util/whitespace");

var _state = _interopRequireDefault(require("./state"));

var _isDigit = function isDigit(code) {
  return code >= 48 && code <= 57;
};

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const VALID_REGEX_FLAGS = "gmsiyu";
const forbiddenNumericSeparatorSiblings = {
  decBinOct: [46, 66, 69, 79, 95, 98, 101, 111],
  hex: [46, 88, 95, 120]
};
const allowedNumericSeparatorSiblings = {};
allowedNumericSeparatorSiblings.bin = [48, 49];
allowedNumericSeparatorSiblings.oct = [...allowedNumericSeparatorSiblings.bin, 50, 51, 52, 53, 54, 55];
allowedNumericSeparatorSiblings.dec = [...allowedNumericSeparatorSiblings.oct, 56, 57];
allowedNumericSeparatorSiblings.hex = [...allowedNumericSeparatorSiblings.dec, 65, 66, 67, 68, 69, 70, 97, 98, 99, 100, 101, 102];

class Token {
  constructor(state) {
    this.type = state.type;
    this.value = state.value;
    this.start = state.start;
    this.end = state.end;
    this.loc = new _location2.SourceLocation(state.startLoc, state.endLoc);
  }

}

exports.Token = Token;

class Tokenizer extends _location.default {
  constructor(options, input) {
    super();
    this.state = new _state.default();
    this.state.init(options, input);
    this.isLookahead = false;
  }

  next() {
    if (this.options.tokens && !this.isLookahead) {
      this.state.tokens.push(new Token(this.state));
    }

    this.state.lastTokEnd = this.state.end;
    this.state.lastTokStart = this.state.start;
    this.state.lastTokEndLoc = this.state.endLoc;
    this.state.lastTokStartLoc = this.state.startLoc;
    this.nextToken();
  }

  eat(type) {
    if (this.match(type)) {
      this.next();
      return true;
    } else {
      return false;
    }
  }

  match(type) {
    return this.state.type === type;
  }

  isKeyword(word) {
    return (0, _identifier.isKeyword)(word);
  }

  lookahead() {
    const old = this.state;
    this.state = old.clone(true);
    this.isLookahead = true;
    this.next();
    this.isLookahead = false;
    const curr = this.state;
    this.state = old;
    return curr;
  }

  setStrict(strict) {
    this.state.strict = strict;
    if (!this.match(_types.types.num) && !this.match(_types.types.string)) return;
    this.state.pos = this.state.start;

    while (this.state.pos < this.state.lineStart) {
      this.state.lineStart = this.input.lastIndexOf("\n", this.state.lineStart - 2) + 1;
      --this.state.curLine;
    }

    this.nextToken();
  }

  curContext() {
    return this.state.context[this.state.context.length - 1];
  }

  nextToken() {
    const curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) this.skipSpace();
    this.state.containsOctal = false;
    this.state.octalPosition = null;
    this.state.start = this.state.pos;
    this.state.startLoc = this.state.curPosition();

    if (this.state.pos >= this.input.length) {
      this.finishToken(_types.types.eof);
      return;
    }

    if (curContext.override) {
      curContext.override(this);
    } else {
      this.readToken(this.input.codePointAt(this.state.pos));
    }
  }

  readToken(code) {
    if ((0, _identifier.isIdentifierStart)(code) || code === 92) {
      this.readWord();
    } else {
      this.getTokenFromCode(code);
    }
  }

  pushComment(block, text, start, end, startLoc, endLoc) {
    const comment = {
      type: block ? "CommentBlock" : "CommentLine",
      value: text,
      start: start,
      end: end,
      loc: new _location2.SourceLocation(startLoc, endLoc)
    };

    if (!this.isLookahead) {
      if (this.options.tokens) this.state.tokens.push(comment);
      this.state.comments.push(comment);
      this.addComment(comment);
    }
  }

  skipBlockComment() {
    const startLoc = this.state.curPosition();
    const start = this.state.pos;
    const end = this.input.indexOf("*/", this.state.pos += 2);
    if (end === -1) this.raise(this.state.pos - 2, "Unterminated comment");
    this.state.pos = end + 2;
    _whitespace.lineBreakG.lastIndex = start;
    let match;

    while ((match = _whitespace.lineBreakG.exec(this.input)) && match.index < this.state.pos) {
      ++this.state.curLine;
      this.state.lineStart = match.index + match[0].length;
    }

    this.pushComment(true, this.input.slice(start + 2, end), start, this.state.pos, startLoc, this.state.curPosition());
  }

  skipLineComment(startSkip) {
    const start = this.state.pos;
    const startLoc = this.state.curPosition();
    let ch = this.input.charCodeAt(this.state.pos += startSkip);

    if (this.state.pos < this.input.length) {
      while (ch !== 10 && ch !== 13 && ch !== 8232 && ch !== 8233 && ++this.state.pos < this.input.length) {
        ch = this.input.charCodeAt(this.state.pos);
      }
    }

    this.pushComment(false, this.input.slice(start + startSkip, this.state.pos), start, this.state.pos, startLoc, this.state.curPosition());
  }

  skipSpace() {
    loop: while (this.state.pos < this.input.length) {
      const ch = this.input.charCodeAt(this.state.pos);

      switch (ch) {
        case 13:
          if (this.input.charCodeAt(this.state.pos + 1) === 10) {
            ++this.state.pos;
          }

        case 10:
        case 8232:
        case 8233:
          ++this.state.pos;
          ++this.state.curLine;
          this.state.lineStart = this.state.pos;
          break;

        case 47:
          switch (this.input.charCodeAt(this.state.pos + 1)) {
            case 42:
              this.skipBlockComment();
              break;

            case 47:
              this.skipLineComment(2);
              break;

            default:
              break loop;
          }

          break;

        default:
          if ((0, _whitespace.isWhitespace)(ch)) {
            ++this.state.pos;
          } else {
            break loop;
          }

      }
    }
  }

  finishToken(type, val) {
    this.state.end = this.state.pos;
    this.state.endLoc = this.state.curPosition();
    const prevType = this.state.type;
    this.state.type = type;
    this.state.value = val;
    this.updateContext(prevType);
  }

  readToken_dot() {
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (next >= 48 && next <= 57) {
      this.readNumber(true);
      return;
    }

    const next2 = this.input.charCodeAt(this.state.pos + 2);

    if (next === 46 && next2 === 46) {
      this.state.pos += 3;
      this.finishToken(_types.types.ellipsis);
    } else {
      ++this.state.pos;
      this.finishToken(_types.types.dot);
    }
  }

  readToken_slash() {
    if (this.state.exprAllowed && !this.state.inType) {
      ++this.state.pos;
      this.readRegexp();
      return;
    }

    const next = this.input.charCodeAt(this.state.pos + 1);

    if (next === 61) {
      this.finishOp(_types.types.assign, 2);
    } else {
      this.finishOp(_types.types.slash, 1);
    }
  }

  readToken_interpreter() {
    if (this.state.pos !== 0 || this.state.input.length < 2) return false;
    const start = this.state.pos;
    this.state.pos += 1;
    let ch = this.input.charCodeAt(this.state.pos);
    if (ch !== 33) return false;

    while (ch !== 10 && ch !== 13 && ch !== 8232 && ch !== 8233 && ++this.state.pos < this.input.length) {
      ch = this.input.charCodeAt(this.state.pos);
    }

    const value = this.input.slice(start + 2, this.state.pos);
    this.finishToken(_types.types.interpreterDirective, value);
    return true;
  }

  readToken_mult_modulo(code) {
    let type = code === 42 ? _types.types.star : _types.types.modulo;
    let width = 1;
    let next = this.input.charCodeAt(this.state.pos + 1);
    const exprAllowed = this.state.exprAllowed;

    if (code === 42 && next === 42) {
      width++;
      next = this.input.charCodeAt(this.state.pos + 2);
      type = _types.types.exponent;
    }

    if (next === 61 && !exprAllowed) {
      width++;
      type = _types.types.assign;
    }

    this.finishOp(type, width);
  }

  readToken_pipe_amp(code) {
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (next === code) {
      if (this.input.charCodeAt(this.state.pos + 2) === 61) {
        this.finishOp(_types.types.assign, 3);
      } else {
        this.finishOp(code === 124 ? _types.types.logicalOR : _types.types.logicalAND, 2);
      }

      return;
    }

    if (code === 124) {
      if (next === 62) {
        this.finishOp(_types.types.pipeline, 2);
        return;
      } else if (next === 125 && this.hasPlugin("flow")) {
        this.finishOp(_types.types.braceBarR, 2);
        return;
      }
    }

    if (next === 61) {
      this.finishOp(_types.types.assign, 2);
      return;
    }

    this.finishOp(code === 124 ? _types.types.bitwiseOR : _types.types.bitwiseAND, 1);
  }

  readToken_caret() {
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (next === 61) {
      this.finishOp(_types.types.assign, 2);
    } else {
      this.finishOp(_types.types.bitwiseXOR, 1);
    }
  }

  readToken_plus_min(code) {
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (next === code) {
      if (next === 45 && !this.inModule && this.input.charCodeAt(this.state.pos + 2) === 62 && _whitespace.lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.pos))) {
        this.skipLineComment(3);
        this.skipSpace();
        this.nextToken();
        return;
      }

      this.finishOp(_types.types.incDec, 2);
      return;
    }

    if (next === 61) {
      this.finishOp(_types.types.assign, 2);
    } else {
      this.finishOp(_types.types.plusMin, 1);
    }
  }

  readToken_lt_gt(code) {
    const next = this.input.charCodeAt(this.state.pos + 1);
    let size = 1;

    if (next === code) {
      size = code === 62 && this.input.charCodeAt(this.state.pos + 2) === 62 ? 3 : 2;

      if (this.input.charCodeAt(this.state.pos + size) === 61) {
        this.finishOp(_types.types.assign, size + 1);
        return;
      }

      this.finishOp(_types.types.bitShift, size);
      return;
    }

    if (next === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.state.pos + 2) === 45 && this.input.charCodeAt(this.state.pos + 3) === 45) {
      this.skipLineComment(4);
      this.skipSpace();
      this.nextToken();
      return;
    }

    if (next === 61) {
      size = 2;
    }

    this.finishOp(_types.types.relational, size);
  }

  readToken_eq_excl(code) {
    const next = this.input.charCodeAt(this.state.pos + 1);

    if (next === 61) {
      this.finishOp(_types.types.equality, this.input.charCodeAt(this.state.pos + 2) === 61 ? 3 : 2);
      return;
    }

    if (code === 61 && next === 62) {
      this.state.pos += 2;
      this.finishToken(_types.types.arrow);
      return;
    }

    this.finishOp(code === 61 ? _types.types.eq : _types.types.bang, 1);
  }

  readToken_question() {
    const next = this.input.charCodeAt(this.state.pos + 1);
    const next2 = this.input.charCodeAt(this.state.pos + 2);

    if (next === 63 && !this.state.inType) {
      if (next2 === 61) {
        this.finishOp(_types.types.assign, 3);
      } else {
        this.finishOp(_types.types.nullishCoalescing, 2);
      }
    } else if (next === 46 && !(next2 >= 48 && next2 <= 57)) {
      this.state.pos += 2;
      this.finishToken(_types.types.questionDot);
    } else {
      ++this.state.pos;
      this.finishToken(_types.types.question);
    }
  }

  getTokenFromCode(code) {
    switch (code) {
      case 35:
        if (this.state.pos === 0 && this.readToken_interpreter()) {
          return;
        }

        if ((this.hasPlugin("classPrivateProperties") || this.hasPlugin("classPrivateMethods")) && this.state.classLevel > 0) {
          ++this.state.pos;
          this.finishToken(_types.types.hash);
          return;
        } else {
          this.raise(this.state.pos, `Unexpected character '${String.fromCodePoint(code)}'`);
        }

      case 46:
        this.readToken_dot();
        return;

      case 40:
        ++this.state.pos;
        this.finishToken(_types.types.parenL);
        return;

      case 41:
        ++this.state.pos;
        this.finishToken(_types.types.parenR);
        return;

      case 59:
        ++this.state.pos;
        this.finishToken(_types.types.semi);
        return;

      case 44:
        ++this.state.pos;
        this.finishToken(_types.types.comma);
        return;

      case 91:
        ++this.state.pos;
        this.finishToken(_types.types.bracketL);
        return;

      case 93:
        ++this.state.pos;
        this.finishToken(_types.types.bracketR);
        return;

      case 123:
        if (this.hasPlugin("flow") && this.input.charCodeAt(this.state.pos + 1) === 124) {
          this.finishOp(_types.types.braceBarL, 2);
        } else {
          ++this.state.pos;
          this.finishToken(_types.types.braceL);
        }

        return;

      case 125:
        ++this.state.pos;
        this.finishToken(_types.types.braceR);
        return;

      case 58:
        if (this.hasPlugin("functionBind") && this.input.charCodeAt(this.state.pos + 1) === 58) {
          this.finishOp(_types.types.doubleColon, 2);
        } else {
          ++this.state.pos;
          this.finishToken(_types.types.colon);
        }

        return;

      case 63:
        this.readToken_question();
        return;

      case 64:
        ++this.state.pos;
        this.finishToken(_types.types.at);
        return;

      case 96:
        ++this.state.pos;
        this.finishToken(_types.types.backQuote);
        return;

      case 48:
        {
          const next = this.input.charCodeAt(this.state.pos + 1);

          if (next === 120 || next === 88) {
            this.readRadixNumber(16);
            return;
          }

          if (next === 111 || next === 79) {
            this.readRadixNumber(8);
            return;
          }

          if (next === 98 || next === 66) {
            this.readRadixNumber(2);
            return;
          }
        }

      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        this.readNumber(false);
        return;

      case 34:
      case 39:
        this.readString(code);
        return;

      case 47:
        this.readToken_slash();
        return;

      case 37:
      case 42:
        this.readToken_mult_modulo(code);
        return;

      case 124:
      case 38:
        this.readToken_pipe_amp(code);
        return;

      case 94:
        this.readToken_caret();
        return;

      case 43:
      case 45:
        this.readToken_plus_min(code);
        return;

      case 60:
      case 62:
        this.readToken_lt_gt(code);
        return;

      case 61:
      case 33:
        this.readToken_eq_excl(code);
        return;

      case 126:
        this.finishOp(_types.types.tilde, 1);
        return;
    }

    this.raise(this.state.pos, `Unexpected character '${String.fromCodePoint(code)}'`);
  }

  finishOp(type, size) {
    const str = this.input.slice(this.state.pos, this.state.pos + size);
    this.state.pos += size;
    this.finishToken(type, str);
  }

  readRegexp() {
    const start = this.state.pos;
    let escaped, inClass;

    for (;;) {
      if (this.state.pos >= this.input.length) {
        this.raise(start, "Unterminated regular expression");
      }

      const ch = this.input.charAt(this.state.pos);

      if (_whitespace.lineBreak.test(ch)) {
        this.raise(start, "Unterminated regular expression");
      }

      if (escaped) {
        escaped = false;
      } else {
        if (ch === "[") {
          inClass = true;
        } else if (ch === "]" && inClass) {
          inClass = false;
        } else if (ch === "/" && !inClass) {
          break;
        }

        escaped = ch === "\\";
      }

      ++this.state.pos;
    }

    const content = this.input.slice(start, this.state.pos);
    ++this.state.pos;
    let mods = "";

    while (this.state.pos < this.input.length) {
      const char = this.input[this.state.pos];
      const charCode = this.input.codePointAt(this.state.pos);

      if (VALID_REGEX_FLAGS.indexOf(char) > -1) {
        if (mods.indexOf(char) > -1) {
          this.raise(this.state.pos + 1, "Duplicate regular expression flag");
        }

        ++this.state.pos;
        mods += char;
      } else if ((0, _identifier.isIdentifierChar)(charCode) || charCode === 92) {
        this.raise(this.state.pos + 1, "Invalid regular expression flag");
      } else {
        break;
      }
    }

    this.finishToken(_types.types.regexp, {
      pattern: content,
      flags: mods
    });
  }

  readInt(radix, len) {
    const start = this.state.pos;
    const forbiddenSiblings = radix === 16 ? forbiddenNumericSeparatorSiblings.hex : forbiddenNumericSeparatorSiblings.decBinOct;
    const allowedSiblings = radix === 16 ? allowedNumericSeparatorSiblings.hex : radix === 10 ? allowedNumericSeparatorSiblings.dec : radix === 8 ? allowedNumericSeparatorSiblings.oct : allowedNumericSeparatorSiblings.bin;
    let total = 0;

    for (let i = 0, e = len == null ? Infinity : len; i < e; ++i) {
      const code = this.input.charCodeAt(this.state.pos);
      let val;

      if (this.hasPlugin("numericSeparator")) {
        const prev = this.input.charCodeAt(this.state.pos - 1);
        const next = this.input.charCodeAt(this.state.pos + 1);

        if (code === 95) {
          if (allowedSiblings.indexOf(next) === -1) {
            this.raise(this.state.pos, "Invalid or unexpected token");
          }

          if (forbiddenSiblings.indexOf(prev) > -1 || forbiddenSiblings.indexOf(next) > -1 || Number.isNaN(next)) {
            this.raise(this.state.pos, "Invalid or unexpected token");
          }

          ++this.state.pos;
          continue;
        }
      }

      if (code >= 97) {
        val = code - 97 + 10;
      } else if (code >= 65) {
        val = code - 65 + 10;
      } else if (_isDigit(code)) {
        val = code - 48;
      } else {
        val = Infinity;
      }

      if (val >= radix) break;
      ++this.state.pos;
      total = total * radix + val;
    }

    if (this.state.pos === start || len != null && this.state.pos - start !== len) {
      return null;
    }

    return total;
  }

  readRadixNumber(radix) {
    const start = this.state.pos;
    let isBigInt = false;
    this.state.pos += 2;
    const val = this.readInt(radix);

    if (val == null) {
      this.raise(this.state.start + 2, "Expected number in radix " + radix);
    }

    if (this.hasPlugin("bigInt")) {
      if (this.input.charCodeAt(this.state.pos) === 110) {
        ++this.state.pos;
        isBigInt = true;
      }
    }

    if ((0, _identifier.isIdentifierStart)(this.input.codePointAt(this.state.pos))) {
      this.raise(this.state.pos, "Identifier directly after number");
    }

    if (isBigInt) {
      const str = this.input.slice(start, this.state.pos).replace(/[_n]/g, "");
      this.finishToken(_types.types.bigint, str);
      return;
    }

    this.finishToken(_types.types.num, val);
  }

  readNumber(startsWithDot) {
    const start = this.state.pos;
    let octal = this.input.charCodeAt(start) === 48;
    let isFloat = false;
    let isBigInt = false;

    if (!startsWithDot && this.readInt(10) === null) {
      this.raise(start, "Invalid number");
    }

    if (octal && this.state.pos == start + 1) octal = false;
    let next = this.input.charCodeAt(this.state.pos);

    if (next === 46 && !octal) {
      ++this.state.pos;
      this.readInt(10);
      isFloat = true;
      next = this.input.charCodeAt(this.state.pos);
    }

    if ((next === 69 || next === 101) && !octal) {
      next = this.input.charCodeAt(++this.state.pos);

      if (next === 43 || next === 45) {
        ++this.state.pos;
      }

      if (this.readInt(10) === null) this.raise(start, "Invalid number");
      isFloat = true;
      next = this.input.charCodeAt(this.state.pos);
    }

    if (this.hasPlugin("bigInt")) {
      if (next === 110) {
        if (isFloat || octal) this.raise(start, "Invalid BigIntLiteral");
        ++this.state.pos;
        isBigInt = true;
      }
    }

    if ((0, _identifier.isIdentifierStart)(this.input.codePointAt(this.state.pos))) {
      this.raise(this.state.pos, "Identifier directly after number");
    }

    const str = this.input.slice(start, this.state.pos).replace(/[_n]/g, "");

    if (isBigInt) {
      this.finishToken(_types.types.bigint, str);
      return;
    }

    let val;

    if (isFloat) {
      val = parseFloat(str);
    } else if (!octal || str.length === 1) {
      val = parseInt(str, 10);
    } else if (this.state.strict) {
      this.raise(start, "Invalid number");
    } else if (/[89]/.test(str)) {
      val = parseInt(str, 10);
    } else {
      val = parseInt(str, 8);
    }

    this.finishToken(_types.types.num, val);
  }

  readCodePoint(throwOnInvalid) {
    const ch = this.input.charCodeAt(this.state.pos);
    let code;

    if (ch === 123) {
      const codePos = ++this.state.pos;
      code = this.readHexChar(this.input.indexOf("}", this.state.pos) - this.state.pos, throwOnInvalid);
      ++this.state.pos;

      if (code === null) {
        --this.state.invalidTemplateEscapePosition;
      } else if (code > 0x10ffff) {
        if (throwOnInvalid) {
          this.raise(codePos, "Code point out of bounds");
        } else {
          this.state.invalidTemplateEscapePosition = codePos - 2;
          return null;
        }
      }
    } else {
      code = this.readHexChar(4, throwOnInvalid);
    }

    return code;
  }

  readString(quote) {
    let out = "",
        chunkStart = ++this.state.pos;
    const hasJsonStrings = this.hasPlugin("jsonStrings");

    for (;;) {
      if (this.state.pos >= this.input.length) {
        this.raise(this.state.start, "Unterminated string constant");
      }

      const ch = this.input.charCodeAt(this.state.pos);
      if (ch === quote) break;

      if (ch === 92) {
        out += this.input.slice(chunkStart, this.state.pos);
        out += this.readEscapedChar(false);
        chunkStart = this.state.pos;
      } else if (hasJsonStrings && (ch === 8232 || ch === 8233)) {
        ++this.state.pos;
        ++this.state.curLine;
      } else if ((0, _whitespace.isNewLine)(ch)) {
        this.raise(this.state.start, "Unterminated string constant");
      } else {
        ++this.state.pos;
      }
    }

    out += this.input.slice(chunkStart, this.state.pos++);
    this.finishToken(_types.types.string, out);
  }

  readTmplToken() {
    let out = "",
        chunkStart = this.state.pos,
        containsInvalid = false;

    for (;;) {
      if (this.state.pos >= this.input.length) {
        this.raise(this.state.start, "Unterminated template");
      }

      const ch = this.input.charCodeAt(this.state.pos);

      if (ch === 96 || ch === 36 && this.input.charCodeAt(this.state.pos + 1) === 123) {
        if (this.state.pos === this.state.start && this.match(_types.types.template)) {
          if (ch === 36) {
            this.state.pos += 2;
            this.finishToken(_types.types.dollarBraceL);
            return;
          } else {
            ++this.state.pos;
            this.finishToken(_types.types.backQuote);
            return;
          }
        }

        out += this.input.slice(chunkStart, this.state.pos);
        this.finishToken(_types.types.template, containsInvalid ? null : out);
        return;
      }

      if (ch === 92) {
        out += this.input.slice(chunkStart, this.state.pos);
        const escaped = this.readEscapedChar(true);

        if (escaped === null) {
          containsInvalid = true;
        } else {
          out += escaped;
        }

        chunkStart = this.state.pos;
      } else if ((0, _whitespace.isNewLine)(ch)) {
        out += this.input.slice(chunkStart, this.state.pos);
        ++this.state.pos;

        switch (ch) {
          case 13:
            if (this.input.charCodeAt(this.state.pos) === 10) {
              ++this.state.pos;
            }

          case 10:
            out += "\n";
            break;

          default:
            out += String.fromCharCode(ch);
            break;
        }

        ++this.state.curLine;
        this.state.lineStart = this.state.pos;
        chunkStart = this.state.pos;
      } else {
        ++this.state.pos;
      }
    }
  }

  readEscapedChar(inTemplate) {
    const throwOnInvalid = !inTemplate;
    const ch = this.input.charCodeAt(++this.state.pos);
    ++this.state.pos;

    switch (ch) {
      case 110:
        return "\n";

      case 114:
        return "\r";

      case 120:
        {
          const code = this.readHexChar(2, throwOnInvalid);
          return code === null ? null : String.fromCharCode(code);
        }

      case 117:
        {
          const code = this.readCodePoint(throwOnInvalid);
          return code === null ? null : String.fromCodePoint(code);
        }

      case 116:
        return "\t";

      case 98:
        return "\b";

      case 118:
        return "\u000b";

      case 102:
        return "\f";

      case 13:
        if (this.input.charCodeAt(this.state.pos) === 10) {
          ++this.state.pos;
        }

      case 10:
        this.state.lineStart = this.state.pos;
        ++this.state.curLine;
        return "";

      default:
        if (ch >= 48 && ch <= 55) {
          const codePos = this.state.pos - 1;
          let octalStr = this.input.substr(this.state.pos - 1, 3).match(/^[0-7]+/)[0];
          let octal = parseInt(octalStr, 8);

          if (octal > 255) {
            octalStr = octalStr.slice(0, -1);
            octal = parseInt(octalStr, 8);
          }

          if (octal > 0) {
            if (inTemplate) {
              this.state.invalidTemplateEscapePosition = codePos;
              return null;
            } else if (this.state.strict) {
              this.raise(codePos, "Octal literal in strict mode");
            } else if (!this.state.containsOctal) {
              this.state.containsOctal = true;
              this.state.octalPosition = codePos;
            }
          }

          this.state.pos += octalStr.length - 1;
          return String.fromCharCode(octal);
        }

        return String.fromCharCode(ch);
    }
  }

  readHexChar(len, throwOnInvalid) {
    const codePos = this.state.pos;
    const n = this.readInt(16, len);

    if (n === null) {
      if (throwOnInvalid) {
        this.raise(codePos, "Bad character escape sequence");
      } else {
        this.state.pos = codePos - 1;
        this.state.invalidTemplateEscapePosition = codePos - 1;
      }
    }

    return n;
  }

  readWord1() {
    this.state.containsEsc = false;
    let word = "",
        first = true,
        chunkStart = this.state.pos;

    while (this.state.pos < this.input.length) {
      const ch = this.input.codePointAt(this.state.pos);

      if ((0, _identifier.isIdentifierChar)(ch)) {
        this.state.pos += ch <= 0xffff ? 1 : 2;
      } else if (this.state.isIterator && ch === 64) {
        this.state.pos += 1;
      } else if (ch === 92) {
        this.state.containsEsc = true;
        word += this.input.slice(chunkStart, this.state.pos);
        const escStart = this.state.pos;

        if (this.input.charCodeAt(++this.state.pos) !== 117) {
          this.raise(this.state.pos, "Expecting Unicode escape sequence \\uXXXX");
        }

        ++this.state.pos;
        const esc = this.readCodePoint(true);

        if (!(first ? _identifier.isIdentifierStart : _identifier.isIdentifierChar)(esc, true)) {
          this.raise(escStart, "Invalid Unicode escape");
        }

        word += String.fromCodePoint(esc);
        chunkStart = this.state.pos;
      } else {
        break;
      }

      first = false;
    }

    return word + this.input.slice(chunkStart, this.state.pos);
  }

  isIterator(word) {
    return word === "@@iterator" || word === "@@asyncIterator";
  }

  readWord() {
    const word = this.readWord1();
    let type = _types.types.name;

    if (this.isKeyword(word)) {
      if (this.state.containsEsc) {
        this.raise(this.state.pos, `Escape sequence in keyword ${word}`);
      }

      type = _types.keywords[word];
    }

    if (this.state.isIterator && (!this.isIterator(word) || !this.state.inType)) {
      this.raise(this.state.pos, `Invalid identifier ${word}`);
    }

    this.finishToken(type, word);
  }

  braceIsBlock(prevType) {
    if (prevType === _types.types.colon) {
      const parent = this.curContext();

      if (parent === _context.types.braceStatement || parent === _context.types.braceExpression) {
        return !parent.isExpr;
      }
    }

    if (prevType === _types.types._return) {
      return _whitespace.lineBreak.test(this.input.slice(this.state.lastTokEnd, this.state.start));
    }

    if (prevType === _types.types._else || prevType === _types.types.semi || prevType === _types.types.eof || prevType === _types.types.parenR) {
      return true;
    }

    if (prevType === _types.types.braceL) {
      return this.curContext() === _context.types.braceStatement;
    }

    if (prevType === _types.types.relational) {
      return true;
    }

    return !this.state.exprAllowed;
  }

  updateContext(prevType) {
    const type = this.state.type;
    let update;

    if (type.keyword && (prevType === _types.types.dot || prevType === _types.types.questionDot)) {
      this.state.exprAllowed = false;
    } else if (update = type.updateContext) {
      update.call(this, prevType);
    } else {
      this.state.exprAllowed = type.beforeExpr;
    }
  }

}

exports.default = Tokenizer;