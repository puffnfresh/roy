var sys = require('sys'),
    Parser = require('jison').Parser;

var grammar = {
    "startSymbol": "program",

    "operators": [
	["left", "=="],
	["left", "+", "-"],
	["left", "%"],
	["left", "."]
    ],

    "bnf": {
	"program": [
	    ["EOF", "return [];"],
	    ["body EOF", "return $1;"]
	],
	"body": [
	    ["line", "$$ = [$1];"],
	    ["body TERMINATOR line", "$$ = $1; $1.push($3);"],
	    ["body TERMINATOR", "$$ = $1;"]
	],
	"line": [
	    ["statement", "$$ = $1;"],
	    ["expression", "$$ = $1;"],
	    ["COMMENT", "$$ = new yy.Comment($1);"]
	],
	"block": [
	    ["INDENT body OUTDENT", "$$ = $2;"],
	    ["INDENT OUTDENT", "$$ = $1;"]
	],
	"statement": [
	    ["letFunction", "$$ = $1;"],
	    ["letBinding", "$$ = $1;"]
	],
	"expression": [
	    ["innerExpression", "$$ = $1;"],
	    ["call", "$$ = $1;"]
	],
	"innerExpression": [
	    ["ifThenElse", "$$ = $1;"],
	    ["( expression )", "$$ = $2;"],
	    ["accessor", "$$ = $1;"],
	    ["innerExpression + innerExpression", "$$ = new yy.Operator($2, $1, $3);"],
	    ["innerExpression % innerExpression", "$$ = new yy.Operator($2, $1, $3);"],
	    ["innerExpression == innerExpression", "$$ = new yy.Operator($2, $1, $3);"],
	    ["literal", "$$ = $1;"]
	],
	"ifThenElse": [
	    ["IF innerExpression THEN block TERMINATOR ELSE block", "$$ = new yy.IfThenElse($2, $4, $7);"]
	],
	"letFunction": [
	    ["LET IDENTIFIER paramList optType = block", "$$ = new yy.Function($2, $3, $6, $4);"],
	    ["LET IDENTIFIER paramList optType = expression", "$$ = new yy.Function($2, $3, [$6], $4);"]
	],
	"letBinding": [
	    ["LET IDENTIFIER optType = expression", "$$ = new yy.Let($2, $5, $3);"],
	    ["LET IDENTIFIER optType = INDENT expression OUTDENT", "$$ = new yy.Let($2, $6, $3);"]
	],
	"paramList": [
	    ["param", "$$ = [$1];"],
	    ["paramList param", "$$ = $1; $1.push($2);"]
	],
	"param": [
	    ["IDENTIFIER", "$$ = new yy.Arg($1);"],
	    ["( IDENTIFIER : identifier )", "$$ = new yy.Arg($2, $4);"]
	],
	"optType": [
	    ["", ""],
	    [": identifier", "$$ = $2"]
	],
	"call": [
	    ["accessor argList", "$$ = new yy.Call($1, $2);"],
	    ["( expression ) argList", "$$ = new yy.Call($2, $4);"]
	],
	"argList": [
	    ["innerExpression", "$$ = [$1];"],
	    ["argList innerExpression", "$$ = $1; $1.push($2);"]
	],
	"literal": [
	    ["NUMBER", "$$ = new yy.Number($1);"],
	    ["STRING", "$$ = new yy.String($1);"],
	    ["BOOLEAN", "$$ = new yy.Boolean($1);"],
	    ["[ optValues ]", "$$ = new yy.Array($2);"],
	    ["{ optPairs }", "$$ = new yy.Object($2);"]
	],
	"optValues": [
	    ["", "$$ = [];"],
	    ["arrayValues", "$$ = $1;"]
	],
	"arrayValues": [
	    ["expression", "$$ = [$1];"],
	    ["arrayValues , expression", "$$ = $1; $1.push($3);"]
	],
	"optPairs": [
	    ["", "$$ = {};"],
	    ["keyPairs", "$$ = $1;"]
	],
	"keyPairs": [
	    ["STRING : expression", "$$ = {}; $$[$1] = $3;"],
	    ["keyPairs , STRING : expression", "$$ = $1; $1[$3] = $5;"]
	],
	"accessor": [
	    ["IDENTIFIER", "$$ = new yy.Identifier($1);"],
	    ["accessor . IDENTIFIER", "$$ = new yy.Access($1, $3);"]
	],
	"identifier": [
	    ["IDENTIFIER", "$$ = new yy.Identifier($1);"]
	]
    }
};

var parser = new Parser(grammar, {debug: true});

var fs = require('fs');
fs.writeFile('src/parser.js', parser.generate());
