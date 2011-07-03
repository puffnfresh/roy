(function(exports) {
    var IDENTIFIER = /^[a-zA-Z$_][a-zA-Z0-9$_]*/;
    var NUMBER = /^-?[0-9]+(\.[0-9]+)?/;
    var COMMENT = /^\/\/.*/;
    var WHITESPACE = /^[^\n\S]+/;
    var INDENT = /^(?:\n[^\n\S]*)+/;

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
            case 'let':
            case 'fn':
            case 'if':
            case 'then':
            case 'else':
            case 'data':
            case 'match':
            case 'case':
            case 'do':
            case 'bind':
            case 'return':
            case 'macro':
                name = value.toUpperCase();
                break;
            default:
                name = 'IDENTIFIER'
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
        var firstChar = chunk.charAt(0),
            quoted = false,
            nextChar;
        if(firstChar == '"' || firstChar == "'") {
            for(var i = 1; i < chunk.length; i++) {
                if(!quoted) {
                    nextChar = chunk.charAt(i);
                    if(nextChar == "\\") {
                        quoted = true;
                    } else if(nextChar == firstChar) {
                        tokens.push(['STRING', chunk.substring(0, i + 1), lineno]);
                        return i + 1;
                    }
                } else {
                    quoted = false;
                }
            }
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
                        tokens.push(['TERMINATOR', token[0].substring(0, lastNewline), lineno]);
                        indents.pop();
                        last = indents[indents.length - 1];
                        terminated = true;
                    }
                }
                if(!terminated) {
                    tokens.push(['TERMINATOR', token[0].substring(0, lastNewline), lineno]);
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
        case '=':
            next = chunk.slice(0, 2);
            switch(next) {
            case '==':
                tokens.push([next, next, lineno]);
                return 2;
            }
            tokens.push([tag, tag, lineno]);
            return 1;
        case '!':
            next = chunk.slice(0, 2);
            switch(next) {
            case '!=':
                tokens.push([next, next, lineno]);
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
            switch(next) {
            case '[|':
            case '|]':
                tokens.push([next, next, lineno]);
                return 2;
            }
            tokens.push([tag, tag, lineno]);
            return 1;
        case ']':
        case ':':
        case '.':
        case ',':
        case '+':
        case '-':
        case '&':
        case '|':
        case '{':
        case '}':
        case '(':
        case ')':
            tokens.push([tag, tag, lineno]);
            return 1;
        }
        return 0;
    };

    exports.tokenise = function(source) {
        indent = 0;
        indents = [];
        tokens = [];
        lineno = 1;
        var i = 0;
        while(chunk = source.slice(i)) {
            var diff = identifierToken() || numberToken() || stringToken() || commentToken() || whitespaceToken() || lineToken() || literalToken();
            if(!diff) {
                throw "Couldn't tokenise: " + chunk.substring(0, chunk.indexOf("\n"));;
            }
            lineno += source.slice(i, i + diff).split('\n').length - 1;
            i += diff;
        }
        tokens.push(['EOF', '', lineno]);
        return tokens;
    };

    if(!module.parent) {
        exports.tokenise([
            "// Testing",
            " ",
            "let x =",
            " 8",
            " if true then 10 else 100",
            " if true then",
            "  false",
            " else",
            "  true",
            " // Inner comment",
            " console.log 10 * 20",
            " console.log [1, 2, 3].length",
            " true",
            "console.log 'example'"
        ].join("\n"));
        console.log(tokens);
    }
})(typeof exports == 'undefined' ? this['./lexer'] = {} : exports);
