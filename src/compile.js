var typecheck = require('./typeinference').typecheck,
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
var data = {};
var compileNode = function(n) {
    return n.accept({
	// Function definition to JavaScript function.
	visitFunction: function() {
	    var getArgs = function(a) {
		return a.map(function(v) {
		    return v.name;
		}).join(", ");
	    };
	    var compileNodedBody = n.body.map(compileNode);
	    var initString = '';;
	    if(compileNodedBody.length > 1) {
		initString = compileNodedBody.slice(0, compileNodedBody.length - 1).join(';') + ';';
	    }
	    var lastString = compileNodedBody[compileNodedBody.length - 1];
	    var varEquals = "";
	    if(n.name) {
		varEquals = "var " + n.name + " = ";
	    }
	    return varEquals + "function(" + getArgs(n.args) + ") {" + initString + "return " + lastString + ";}";
	},
	visitIfThenElse: function() {
	    var compileNodedCondition = compileNode(n.condition);
	    var compileNodedIfTrue = n.ifTrue.map(compileNode).join('');
	    var compileNodedIfFalse = n.ifFalse.map(compileNode).join('');
	    return "(function(){if(" + compileNodedCondition + "){return " + compileNodedIfTrue + "}else{return " + compileNodedIfFalse + "}})();";
	},
	// Let binding to JavaScript variable.
	visitLet: function() {
	    return "var " + n.name + " = " + compileNode(n.value) + ";";
	},
	visitData: function() {
	    n.tags.forEach(function(tag) {
		data[tag.name] = n.name;
	    });
	    var defs = n.tags.map(compileNode);
	    return defs.join("\n");
	},
	visitTag: function() {
	    var args = n.vars.map(function(v) {
		return v.name;
	    });
	    var setters = n.vars.map(function(v, i) {
		return "this._" + i + " = " + v.name;
	    });
	    return "var " + n.name + " = function(" + args.join(", ") + "){" + setters.join(";") + "};";
	},
	visitMatch: function() {
	    var cases = n.cases.map(function(c) {
		var assignments = c.pattern.vars.map(function(a, i) {
		    return "var " + a + " = " + compileNode(n.value) + "._" + i + ";";
		});
		return "if(" + compileNode(n.value) + " instanceof " + c.pattern.tag + "){" +  assignments.join("") + "return " + compileNode(c.value) + "}";
	    });
	    return "(function() {" + cases.join(" else ") + "})()";
	},
	// Call to JavaScript call.
	visitCall: function() {
	    if(data[n.func.value]) {
		return 'new ' + n.func.value + "(" + n.args.map(compileNode).join(", ") + ")";
	    }
	    return compileNode(n.func) + "(" + n.args.map(compileNode).join(", ") + ")";
	},
	visitAccess: function() {
	    return compileNode(n.value) + "." + n.property;
	},
	visitBinaryGenericOperator: function() {
	    return [compileNode(n.left), n.name, compileNode(n.right)].join(" ");
	},
	visitBinaryNumberOperator: function() {
	    return [compileNode(n.left), n.name, compileNode(n.right)].join(" ");
	},
	// Print all other nodes directly.
	visitComment: function() {
	    return n.value;
	},
	visitIdentifier: function() {
	    var prefix = '';
	    var suffix = '';
	    if(data[n.value]) {
		prefix = 'new ';
		suffix = '()';
	    }
	    return prefix + n.value + suffix;
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
	visitUnit: function() {
	    return "null";
	},
	visitArray: function() {
	    return '[' + n.values.map(compileNode).join(', ') + ']';
	},
	visitObject: function() {
	    var key;
	    var pairs = [];
	    for(key in n.values) {
		pairs.push(key + ": " + compileNode(n.values[key]));
	    }
	    return "{" + pairs.join(", ") + "}";
	}
    });
};

var compile = function(source) {
    // Parse the file to an AST.
    var tokens = lexer.tokenise(source);
    //console.log(tokens);
    var ast = parser.parse(tokens);
    //console.log(ast);
    
    // Typecheck the AST. Any type errors will throw an exception.
    var typeA = new types.Variable();
    var typeB = new types.Variable();
    typecheck(ast, {});
    
    // Output strict JavaScript.
    var output = ['"use strict";'];
    ast.forEach(function(v) {
	output.push(compileNode(v));
    });

    return output.join('\n');
};
exports.compile = compile;

var main = function() {
    if(process.argv.length < 3) {
	console.log('You must give a .roy file as an argument.');
	return;
    }

    (function() {
        var fs = require('fs');

	// Read the file content.
	var filename = process.argv[2];
	var source = fs.readFileSync(filename, 'utf8');
	
	// Write the JavaScript output.
	fs.writeFile(filename.replace(/roy$/, 'js'), compile(source), 'utf8');
    })();
};
exports.main = main;

if(!module.parent) {
    main();
}
