var unicode = require('unicode-categories');

// http://es5.github.com/#x7.6
// ECMAscript identifier starts with `$`, `_`,
// or letter from (Lu Ll Lt Lm Lo Nl) unicode groups.
// Then identifier can also be from groups (Nd, Mn, Mc, or Pc).
// Roy identifier cannot have letter u03BB (greek lowercase lambda)
// because it's used in anonymous functions.
var IDENTIFIER = new RegExp(
    unicode.ECMA.identifier.source.replace('\\u03BB', '')
);

var NUMBER = /^-?[0-9]+(\.[0-9]+)?([eE][\-\+]?[0-9]+)?/;
var STRING = /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;
var COMMENT = /^\/\/.*/;
var WHITESPACE = /^[^\n\S]+/;
var INDENT = /^(?:\n[^\n\S]*)+/;
var GENERIC = /^#([a-z]+)/;
var SHEBANG = /^#!.*/;

var chunk;
var indent;
var indents;
var tokens;
var lineno;

var identifierToken = function() {
    var value,
        name,
        token = IDENTIFIER.exec(chunk);
    if(token) {
        value = token[0];
        switch(value) {
        case 'true':
        case 'false':
            name = 'BOOLEAN';
            break;
        case 'Function':
        case 'let':
        case 'if':
        case 'instance':
        case 'then':
        case 'else':
        case 'data':
        case 'type':
        case 'typeclass':
        case 'match':
        case 'case':
        case 'do':
        case 'return':
        case 'with':
        case 'where':
            name = value.toUpperCase();
            break;
        default:
            name = 'IDENTIFIER';
            break;
        }
        tokens.push([name, value, lineno]);
        return token[0].length;
    }
    return 0;
};

var numberToken = function() {
    var token = NUMBER.exec(chunk);
    if(token) {
        tokens.push(['NUMBER', token[0], lineno]);
        return token[0].length;
    }
    return 0;
};

var stringToken = function() {
  var token = STRING.exec(chunk);
  if (token) {
    tokens.push(['STRING', token[0], lineno]);
    return token[0].length;

  }
  return 0;
};

var genericToken = function() {
    var token = GENERIC.exec(chunk);
    if(token) {
        tokens.push(['GENERIC', token[1], lineno]);
        return token[0].length;
    }
    return 0;
};

var commentToken = function() {
    var token = COMMENT.exec(chunk);
    if(token) {
        tokens.push(['COMMENT', token[0], lineno]);
        return token[0].length;
    }
    return 0;
};

var whitespaceToken = function() {
    var token = WHITESPACE.exec(chunk);
    if(token) {
        return token[0].length;
    }
    return 0;
};

// If an OUTDENT is followed by a line continuer,
// the next TERMINATOR token is supressed.
var lineContinuer = {
    "where": true
};

var lineToken = function() {
    var token = INDENT.exec(chunk);
    if(token) {
        var lastNewline = token[0].lastIndexOf("\n") + 1;
        var size = token[0].length - lastNewline;
        var terminated = false;
        if(size > indent) {
            indents.push(size);
            tokens.push(['INDENT', size - indent, lineno]);
        } else {
            if(size < indent) {
                var last = indents[indents.length - 1];
                while(size < last) {
                    tokens.push(['OUTDENT', last - size, lineno]);
                    indents.pop();
                    last = indents[indents.length - 1];
                }
            }
            if(tokens.length > 0) {
                var lookahead = IDENTIFIER.exec(chunk.slice(token[0].length));

                if (!lookahead || !lineContinuer[lookahead[0]]) {
                    tokens.push(['TERMINATOR', token[0].substring(0, lastNewline), lineno]);
                }
            }
        }
        indent = size;
        return token[0].length;
    }
    return 0;
};

var literalToken = function() {
    var tag = chunk.slice(0, 1);
    var next;
    switch(tag) {
    case '<':
        next = chunk.slice(0, 2);
        if(next == '<=') {
            tokens.push(['COMPARE', next, lineno]);
            return 2;
        } else if(next == '<-') {
            tokens.push(['LEFTARROW', next, lineno]);
            return 2;
        } else if(next == '<<') {
            tokens.push(['MATH', next, lineno]);
            return 2;
        }
        tokens.push(['COMPARE', tag, lineno]);
        return 1;
    case '>':
        next = chunk.slice(0, 2);
        if(next == '>=') {
            tokens.push(['COMPARE', next, lineno]);
            return 2;
        } else if(next == '>>') {
            tokens.push(['MATH', next, lineno]);
            return 2;
        }
        tokens.push(['COMPARE', tag, lineno]);
        return 1;
    case '=':
        next = chunk.slice(0, 2);
        if(next == '==') {
            tokens.push(['COMPARE', next, lineno]);
            return 2;
        }
        tokens.push([tag, tag, lineno]);
        return 1;
    case '!':
        next = chunk.slice(0, 2);
        if(next == '!=') {
            tokens.push(['COMPARE', next, lineno]);
            return 2;
        }
        tokens.push([tag, tag, lineno]);
        return 1;
    case '*':
    case '/':
    case '%':
        tokens.push(['MATH', tag, lineno]);
        return 1;
    case '[':
    case '|':
        next = chunk.slice(0, 2);
        if(next == '||') {
            tokens.push(['BOOLOP', next, lineno]);
            return 2;
        }
        tokens.push([tag, tag, lineno]);
        return 1;
    case ')':
        if(tokens[tokens.length-1][0] == 'TERMINATOR') {
            tokens.pop();
        }
        tokens.push([tag, tag, lineno]);
        return 1;
    case '+':
        next = chunk.slice(0, 2);
        if(next == '++') {
            tokens.push(['CONCAT', tag, lineno]);
            return 2;
        }
        tokens.push([tag, tag, lineno]);
        return 1;
    case '-':
        next = chunk.slice(0, 2);
        if (next == '->') {
            tokens.push(['RIGHTARROW', next, lineno]);
            return 2;
        }
        tokens.push([tag, tag, lineno]);
        return 1;
    case '&':
        next = chunk.slice(0, 2);
        if(next == '&&') {
            tokens.push(['BOOLOP', next, lineno]);
            return 2;
        }
        return 0;
    case 'λ':
    case '\\':
        tokens.push(['LAMBDA', tag, lineno]);
        return 1;
    case '←':
        tokens.push(['LEFTARROW', tag, lineno]);
        return 1;
    case '→':
        tokens.push(['RIGHTARROW', tag, lineno]);
        return 1;
    case '⇒':
        tokens.push(['RIGHTFATARROW', tag, lineno]);
        return 1;
    case '@':
    case ']':
    case ':':
    case '.':
    case ',':
    case '{':
    case '}':
    case '(':
        tokens.push([tag, tag, lineno]);
        return 1;
    }
    return 0;
};

var shebangToken = function() {
    var token = SHEBANG.exec(chunk);
    if (token) {
        tokens.push(['SHEBANG', token[0], lineno]);
        return token[0].length;
    }
    return 0;
};

exports.tokenise = function(source) {
    /*jshint boss:true*/
    indent = 0;
    indents = [];
    tokens = [];
    lineno = 0;
    var i = 0;
    while(chunk = source.slice(i)) {
        var diff = identifierToken() || numberToken() || stringToken() || genericToken() || commentToken() || whitespaceToken() || lineToken() || literalToken() || shebangToken();
        if(!diff) {
            throw "Couldn't tokenise: " + chunk.substring(0, chunk.indexOf("\n") > -1 ? chunk.indexOf("\n") : chunk.length);
        }
        lineno += source.slice(i, i + diff).split('\n').length - 1;
        i += diff;
    }
    tokens.push(['EOF', '', lineno]);
    return tokens;
};
