var unicode = require('unicode-categories'),
    _ = require('underscore');

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
var COMMENT = /^\/\/(.*)/;
var WHITESPACE = /^[^\n\S]+/;
var INDENT = /^(?:\n[^\n\S]*)+/;
var GENERIC = /^#([a-z]+)/;
var SHEBANG = /^#!.*/;

var keywordTokens = {
    'true':      'BOOLEAN',
    'false':     'BOOLEAN',
    'Function':  'FUNCTION',
    'let':       'LET',
    'if':        'IF',
    'instance':  'INSTANCE',
    'then':      'THEN',
    'else':      'ELSE',
    'data':      'DATA',
    'type':      'TYPE',
    'typeclass': 'TYPECLASS',
    'match':     'MATCH',
    'case':      'CASE',
    'do':        'DO',
    'return':    'RETURN',
    'with':      'WITH',
    'where':     'WHERE'
};

var indent;
var indents;
var tokens;
var lineno;

var identifierToken = function(chunk) {
    var token = IDENTIFIER.exec(chunk);

    if(token) {
        var value = token[0],
            name = keywordTokens[value] || 'IDENTIFIER';

        tokens.push([name, value, lineno]);
        return token[0].length;
    }
    return 0;
};

var numberToken = function(chunk) {
    var token = NUMBER.exec(chunk);
    if(token) {
        tokens.push(['NUMBER', token[0], lineno]);
        return token[0].length;
    }
    return 0;
};

var stringToken = function(chunk) {
  var token = STRING.exec(chunk);
  if(token) {
    tokens.push(['STRING', token[0], lineno]);
    return token[0].length;
  }
  return 0;
};

var genericToken = function(chunk) {
    var token = GENERIC.exec(chunk);
    if(token) {
        tokens.push(['GENERIC', token[1], lineno]);
        return token[0].length;
    }
    return 0;
};

var commentToken = function(chunk) {
    var token = COMMENT.exec(chunk);
    if(token) {
        tokens.push(['COMMENT', token[1], lineno]);
        return token[0].length;
    }
    return 0;
};

var whitespaceToken = function(chunk) {
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

var lineToken = function(chunk) {
    var token = INDENT.exec(chunk);
    if(token) {
        var lastNewline = token[0].lastIndexOf("\n") + 1;
        var size = token[0].length - lastNewline;
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

                if(!lookahead || !lineContinuer[lookahead[0]]) {
                    tokens.push(['TERMINATOR', token[0].substring(0, lastNewline), lineno]);
                }
            }
        }

        indent = size;
        return token[0].length;
    }
    return 0;
};

var literalToken = function(chunk) {
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
        if(next == '->') {
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

var shebangToken = function(chunk) {
    var token = SHEBANG.exec(chunk);
    if(token) {
        tokens.push(['SHEBANG', token[0], lineno]);
        return token[0].length;
    }
    return 0;
};

var tokenise = function(source, tokenizers) {
    /*jshint boss:true*/
    var i = 0, chunk;

    function getDiff(chunk) {
        return _.foldl(tokenizers, function(diff, tokenizer) {
            return diff ? diff : tokenizer.apply(tokenizer, [chunk]);
        }, 0);
    }

    while(chunk = source.slice(i)) {
        var diff = getDiff(chunk);
        if(!diff) {
            throw "Couldn't tokenise: " + chunk.substring(0, chunk.indexOf("\n") > -1 ? chunk.indexOf("\n") : chunk.length);
        }
        lineno += source.slice(i, i + diff).split('\n').length - 1;
        i += diff;
    }

    return tokens;
};

exports.tokenise = function(source) {
    indent = 0;
    indents = [];
    tokens = [];
    lineno = 0;
    
    return tokenise(source, [identifierToken, numberToken,
            stringToken, genericToken, commentToken, whitespaceToken,
            lineToken, literalToken, shebangToken]
            ).concat([['EOF', '', lineno]]);
};
