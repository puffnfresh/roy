var fs = require('fs'),
    typecheck = require('./typeinference').typecheck,
    nodes = require('./nodes').nodes,
    types = require('./types'),
    parser = require('./parser').parser,
    lexer = require('./lexer');

// Assigning the nodes to `parser.yy` allows the grammar to access the nodes from
// the `yy` namespace.
parser.yy = nodes;

parser.lexer =  {
    "lex": function() {
	var token = this.tokens[this.pos] ? this.tokens[this.pos++] : ['EOF'];
	this.yytext = token[1];
	this.yylineno = token[2];
	return token[0];
    },
    
    "setInput": function(tokens) {
	this.tokens = tokens;
	this.pos = 0;
    },

    "upcomingInput": function() {
	return "";
    }
};

// Compile an abstract syntax tree (AST) node to JavaScript.
var compile = function(n) {
    return n.accept({
	// Function definition to JavaScript function.
	visitFunction: function() {
	    var getArgs = function(a) {
		return a.map(function(v) {
		    return v.name;
		}).join(", ");
	    };
	    var compiledBody = n.body.map(compile);
	    var initString = compiledBody.slice(0, compiledBody.length - 1).join('');
	    var lastString = compiledBody[compiledBody.length - 1];
	    return "var " + n.name + " = function(" + getArgs(n.args) + ") {" + initString + "return " + lastString + ";};";
	},
	visitIfThenElse: function() {
	    var compiledCondition = compile(n.condition);
	    var compiledIfTrue = n.ifTrue.map(compile).join('');
	    var compiledIfFalse = n.ifFalse.map(compile).join('');
	    return "(function(){if(" + compiledCondition + "){return " + compiledIfTrue + "}else{return " + compiledIfFalse + "}})();";
	},
	// Let binding to JavaScript variable.
	visitLet: function() {
	    return "var " + n.name + " = " + compile(n.value) + ";";
	},
	// Call to JavaScript call.
	visitCall: function() {
	    return compile(n.func) + "(" + n.args.map(compile).join(", ") + ")";
	},
	visitAccess: function() {
	    return compile(n.value) + "." + n.property;
	},
	visitOperator: function() {
	    return [compile(n.left), n.name, compile(n.right)].join(" ");
	},
	// Print all other nodes directly.
	visitComment: function() {
	    return n.value;
	},
	visitIdentifier: function() {
	    return n.value;
	},
	visitNumber: function() {
	    return n.value;
	},
	visitString: function() {
	    return n.value;
	},
	visitBoolean: function() {
	    return n.value;
	},
	visitArray: function() {
	    return '[' + n.values.map(compile).join(', ') + ']';
	},
	visitObject: function() {
	    var key;
	    var pairs = [];
	    for(key in n.values) {
		pairs.push(key + ": " + compile(n.values[key]));
	    }
	    return "{" + pairs.join(", ") + "}";
	}
    });
};

if(process.argv.length < 3) {
    console.log('You must give a .roy file as an argument.');
    return;
}

// Read the file content.
var filename = process.argv[2];
var source = fs.readFileSync(filename, 'utf8');
//console.log(source);
// Parse the file to an AST.
var tokens = lexer.tokenise(source);
//console.log(tokens);
var ast = parser.parse(tokens);
//console.log(ast);

// Typecheck the AST. Any type errors will throw an exception.
var typeA = new types.Variable();
var typeB = new types.Variable();
typecheck(ast, {
    'console': new types.ObjectType({
	'log': new types.FunctionType([typeA, typeB]),
	'info': new types.FunctionType([typeA, typeB]),
	'warn': new types.FunctionType([typeA, typeB]),
	'error': new types.FunctionType([typeA, typeB]),
	'trace': new types.FunctionType([typeA, typeB]),
	'assert': new types.FunctionType([typeA, typeB])
    })
});

// Output strict JavaScript.
var output = ['"use strict";'];
ast.forEach(function(v) {
    output.push(compile(v));
});

// Write the JavaScript output.
fs.writeFile(filename.replace(/roy$/, 'js'), output.join('\n'), 'utf8');
