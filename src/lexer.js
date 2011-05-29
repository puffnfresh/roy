var IDENTIFIER = /^[a-zA-Z$_][a-zA-Z0-9$_]*/;
var NUMBER = /^-?[0-9]+(\.[0-9]+)?/;
var COMMENT = /^\/\/.*/;
var WHITESPACE = /^[^\n\S]+/;
var INDENT = /^(?:\n[^\n\S]*)+/;

var chunk;

var indent = 0;
var indents = []
var tokens = [];

var identifierToken = function() {
    var value,
        name,
        token = IDENTIFIER.exec(chunk);
    if(token) {
	value = token[0];
	switch(value) {
	case 'let':
	    name = 'LET';
	    break;
	case 'if':
	    name = 'IF';
	    break;
	case 'then':
	    name = 'THEN';
	    break;
	case 'else':
	    name = 'ELSE';
	    break;
	case 'true':
	case 'false':
	    name = 'BOOLEAN';
	    break;
	default:
	    name = 'IDENTIFIER'
	    break;
	}
	tokens.push([name, value]);
	return token[0].length;
    }

    return 0;
};

var numberToken = function() {
    var token = NUMBER.exec(chunk);
    if(token) {
	tokens.push(['NUMBER', token[0]]);
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
		    tokens.push(['STRING', chunk.substring(0, i + 1)]);
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
	tokens.push(['COMMENT', token[0]]);
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
	if(size > indent) {
	    indents.push(size);
	    tokens.push(['INDENT', size - indent]);
	} else {
	    if(size < indent) {
		var last = indents[indents.length - 1];
		while(size < last) {
		    tokens.push(['OUTDENT', last - size]);
		    indents.pop();
		    last = indents[indents.length - 1];
		}
	    }
	    tokens.push(['TERMINATOR', token[0].substring(0, lastNewline)]);
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
	var next = chunk.slice(0, 2);
	switch(next) {
	case '==':
	    tokens.push([next, next]);
	    return 2;
	}
	tokens.push([tag, tag]);
	return 1;
    case ':':
    case '.':
    case ',':
    case '+':
    case '-':
    case '*':
    case '/':
    case '%':
    case '[':
    case ']':
    case '{':
    case '}':
    case '(':
    case ')':
	tokens.push([tag, tag]);
	return 1;
    }

    return 0;
};

exports.tokenise = function(source) {
    var i = 0;
    while(chunk = source.slice(i)) {
	var diff = identifierToken() || numberToken() || stringToken() || commentToken() || whitespaceToken() || lineToken() || literalToken();
	if(!diff) {
	    throw "Couldn't tokenise: " + chunk.substring(0, chunk.indexOf("\n"));;
	}
	i += diff;
    }

    tokens.push(['EOF', '']);

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
