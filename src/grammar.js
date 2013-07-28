var typegrammar = require('./typegrammar').bnf;

// TODO: Getting lineno on arrays...
function n(s) {
    return s + "$$.lineno = yylineno;";
}

var grammar = {
    "startSymbol": "program",

    "operators": [
        ["left", "RIGHTARROW", "LEFTARROW", "RIGHTFATARROW", "ELEM", "NOTELEM",
          "FORALL", "COMPOSE"],
        ["right", "IF", "ELSE"],
        ["left", "BOOLOP"],
        ["left", "COMPARE", "WITH"],
        ["left", "+", "-", "@"],
        ["left", "MATH", "CONCAT"],
        ["left", "."]
    ],

    "bnf": {
        "program": [
            ["optBody EOF", n("return new yy.Module($1);")],
            ["SHEBANG TERMINATOR optBody EOF", n("return new yy.Module($3);")]
        ],
        "optBody": [
            ["", "$$ = [];"],
            ["body", "$$ = $1;"]
        ],
        "restBody": [
            ["", "$$ = [];"],
            ["TERMINATOR optBody", "$$ = $2;"]
        ],
        "body": [
            ["COMMENT restBody", n("$$ = [new yy.Comment($1)].concat($2);")],
            ["expression restBody", "$$ = [$1].concat($2);"],

            ["LET IDENTIFIER optType = blockExpression restBody", "$$ = [new yy.Let($2, $5, $3, $6)];"],
            ["LET IDENTIFIER paramList optType = blockExpression restBody", "$$ = [new yy.Let($2, [new yy.Function($3, $6)], $4, $7)];"],

            // data Maybe a = Some a | None
            ["DATA IDENTIFIER optDataParamList = dataList restBody", n("$$ = [new yy.Data($2, $3, $5, $6)];")],
            ["DATA IDENTIFIER optDataParamList = INDENT dataList outdentOrEof restBody", n("$$ = [new yy.Data($2, $3, $6, $8)];")],

            // type Person = {firstName: String, lastName: String}
            ["TYPE IDENTIFIER = type restBody", n("$$ = [new yy.Type($2, $4, $5)];")],

            ["TYPECLASS IDENTIFIER GENERIC { INDENT typeClassLines outdentOrEof TERMINATOR } restBody", "$$ = [new yy.TypeClass($2, new yy.Generic($3), $6, $10)];"],
            ["INSTANCE IDENTIFIER = IDENTIFIER type object restBody", "$$ = [new yy.Instance($2, $4, $5, $6, $7)];"]
        ],
        "blockExpression": [
            ["block", "$$ = $1;"],
            ["expression", "$$ = [$1];"]
        ],
        "block": [
            ["INDENT body outdentOrEof", "$$ = $2;"]
        ],
        "doBody": [
            ["doLine", "$$ = [$1];"],
            ["doBody TERMINATOR doLine", "$$ = $1; $1.push($3);"],
            ["doBody TERMINATOR", "$$ = $1;"]
        ],
        "doLine": [
            ["LET IDENTIFIER optType = blockExpression restDoBody", "$$ = new yy.Let($2, $5, $3, $6);"],
            ["LET IDENTIFIER paramList optType = blockExpression restDoBody", "$$ = new yy.Let($2, [new yy.Function($3, $6)], $4, $7);"],

            ["IDENTIFIER LEFTARROW doLine", n("$$ = {name: $1, value: $3};")],
            ["RETURN expression", n("$$ = {value: $2};")]
        ],
        "doBlock": [
            ["INDENT doBody outdentOrEof", "$$ = $2;"]
        ],
        "expression": [
            ["innerExpression", "$$ = $1;"],
            ["LAMBDA paramList RIGHTARROW expression", n("$$ = new yy.Function($2, [$4]);")],
            ["LAMBDA paramList RIGHTARROW block", n("$$ = new yy.Function($2, $4);")],
            ["MATCH innerExpression INDENT caseList outdentOrEof", n("$$ = new yy.Match($2, $4);")],
            ["DO innerExpression doBlock", n("$$ = new yy.Do($2, $3);")],
            ["ifThenElse", "$$ = $1;"]
        ],
        "callArgument": [
            ["( expression )", n("$$ = $2;")],
            ["! ( expression )", n("$$ = new yy.UnaryBooleanOperator($1, $3);")],
            ["accessor", "$$ = $1;"],
            ["callArgument @ callArgument", n("$$ = new yy.Access($1, $3);")],
            ["callArgument MATH callArgument", n("$$ = new yy.BinaryNumberOperator($2, $1, $3);")],
            ["callArgument CONCAT callArgument", n("$$ = new yy.BinaryStringOperator($2, $1, $3);")],
            ["callArgument + callArgument", n("$$ = new yy.BinaryNumberOperator($2, $1, $3);")],
            ["callArgument - callArgument", n("$$ = new yy.BinaryNumberOperator($2, $1, $3);")],
            ["callArgument BOOLOP callArgument", n("$$ = new yy.BinaryBooleanOperator($2, $1, $3);")],
            ["callArgument COMPARE callArgument", n("$$ = new yy.BinaryGenericOperator($2, $1, $3);")],
            ["callArgument WITH callArgument", n("$$ = new yy.With($1, $3);")],
            ["literal", "$$ = $1;"]
        ],
        "innerExpression": [
            ["call", "$$ = $1;"],
            ["callArgument", "$$ = $1;"]
        ],
        "caseList": [
            ["CASE pattern = expression", "$$ = [{pattern: $2, value: $4}];"],
            ["caseList TERMINATOR CASE pattern = expression", "$$ = $1; $1.push({pattern: $4, value: $6});"]
        ],
        "pattern": [
            ["innerPattern", "$$ = $1;"],
            ["identifier", n("$$ = {tag: $1, vars: []};")]
        ],
        "innerPattern": [
            ["( identifier patternIdentifiers )", n("$$ = {tag: $2, vars: $3};")]
        ],
        "patternIdentifiers": [
            ["identifier", "$$ = [$1];"],
            ["innerPattern", "$$ = [$1];"],
            ["patternIdentifiers innerPattern", "$$ = $1; $1.push($2);"],
            ["patternIdentifiers identifier", "$$ = $1; $1.push($2);"]
        ],
        "ifThenElse": [
            ["IF innerExpression THEN block TERMINATOR ELSE block", n("$$ = new yy.IfThenElse($2, $4, $7);")],
            ["IF innerExpression THEN innerExpression ELSE innerExpression", n("$$ = new yy.IfThenElse($2, [$4], [$6]);")]
        ],

        "dataList": [
            ["IDENTIFIER optTypeParamList", "$$ = [{name: $1, vars: $2}];"],
            ["dataList | IDENTIFIER optTypeParamList", "$$ = $1; $1.push({name: $3, vars: $4});"]
        ],

        // For type annotations (from the typegrammar module)
        "type": typegrammar.type,
        "typeList": typegrammar.typeList,
        "optTypeParamList": typegrammar.optTypeParamList,
        "typeParamList": typegrammar.typeParamList,
        "optTypeFunctionArgList": typegrammar.optTypeFunctionArgList,
        "typeFunctionArgList": typegrammar.typeFunctionArgList,
        "optTypePairs": typegrammar.optTypePairs,
        "dataParamList": typegrammar.dataParamList,
        "optDataParamList": typegrammar.optDataParamList,

        "typeClassLines": [
            ["IDENTIFIER : type", "$$ = {}; $$[$1] = $3;"],
            ["typeClassLines TERMINATOR IDENTIFIER : type", "$$ = $1; $1[$3] = $5;"]
        ],

        "function": [
            ["IDENTIFIER paramList optType = block optWhere", n("$$ = new yy.Let($1, [new yy.Function($2, $5, $6)], $3);")],
            ["IDENTIFIER paramList optType = expression", n("$$ = new yy.Let($1, [new yy.Function($2, [$5])], $3);")]
        ],
        "binding": [
            ["IDENTIFIER optType = expression", n("$$ = new yy.Let($1, [$4], $2);")],
            ["IDENTIFIER optType = block", n("$$ = new yy.Let($1, $4, $2);")]
        ],
        "paramList": [
            ["( )", "$$ = [];"],
            ["param", "$$ = [$1];"],
            ["paramList ( )", "$$ = $1;"],
            ["paramList param", "$$ = $1; $1.push($2);"]
        ],
        "param": [
            ["IDENTIFIER", n("$$ = {name: $1};")],
            ["( IDENTIFIER : type )", n("$$ = {name: $2, type: $4};")]
        ],
        "optType": [
            ["", ""],
            [": type", "$$ = $2"]
        ],
        "optWhere": [
            ["", "$$ = [];"],
            ["WHERE INDENT whereDecls outdentOrEof", "$$ = $3;"]
        ],
        "whereDecls": [
            ["whereDecl", "$$ = [$1];"],
            ["whereDecls TERMINATOR whereDecl", "$$ = $1; $1.push($3);"]
        ],
        "whereDecl": [
            ["dataDecl", "$$ = $1;"],
            ["IDENTIFIER paramList optType = block optWhere", n("$$ = new yy.Let($1, [new yy.Function($2, $5, $6)], $3);")],
            ["IDENTIFIER paramList optType = expression", n("$$ = new yy.Let($1, [new yy.Function($2, [$5])], $3);")]
        ],

        "call": [
            ["accessor argList", n("$$ = new yy.Call($1, $2);")],
            ["( expression ) argList", n("$$ = new yy.Call($2, $4);")]
        ],
        "argList": [
            ["( )", "$$ = [];"],
            ["callArgument", "$$ = [$1];"],
            ["argList ( )", "$$ = $1;"],
            ["argList callArgument", "$$ = $1; $1.push($2);"]
        ],
        "tuple": [
            ["( innerExpression , tupleList )", n("$4.unshift($2); $$ = new yy.Tuple($4);")]
        ],
        "tupleList": [
            ["innerExpression", "$$ = [$1];"],
            ["tupleList , innerExpression", "$$ = $1; $1.push($3);"]
        ],
        "literal": [
            ["NUMBER", n("$$ = new yy.Number($1);")],
            ["STRING", n("$$ = new yy.String($1);")],
            ["BOOLEAN", n("$$ = new yy.Boolean($1);")],
            ["tuple", "$$ = $1;"],
            ["[ optValues ]", n("$$ = new yy.Array($2);")],
            ["object", "$$ = $1;"]
        ],
        "object": [
            ["{ optPairs }", n("$$ = new yy.Object($2);")]
        ],
        "optValues": [
            ["", "$$ = [];"],
            ["INDENT arrayValues OUTDENT TERMINATOR", "$$ = $2;"],
            ["arrayValues", "$$ = $1;"]
        ],
        "arrayValues": [
            ["expression", "$$ = [$1];"],
            ["arrayValues , expression", "$$ = $1; $1.push($3);"],
            ["arrayValues , TERMINATOR expression", "$$ = $1; $1.push($4);"]
        ],
        "optPairs": [
            ["", "$$ = {};"],
            ["INDENT keyPairs OUTDENT TERMINATOR", "$$ = $2;"],
            ["keyPairs", "$$ = $1;"]
        ],
        "keyPairs": [
            ["keywordOrIdentifier : expression", "$$ = {}; $$[$1] = $3;"],
            ["keyPairs , keywordOrIdentifier : expression", "$$ = $1; $1[$3] = $5;"],
            ["keyPairs TERMINATOR optTerm keywordOrIdentifier : expression", "$$ = $1; $1[$4] = $6;"],
            ["STRING : expression", "$$ = {}; $$[$1] = $3;"],
            ["keyPairs , STRING : expression", "$$ = $1; $1[$3] = $5;"],
            ["keyPairs TERMINATOR optTerm STRING : expression", "$$ = $1; $1[$4] = $6;"],
            ["NUMBER : expression", "$$ = {}; $$[$1] = $3;"],
            ["keyPairs , NUMBER : expression", "$$ = $1; $1[$3] = $5;"],
            ["keyPairs TERMINATOR optTerm NUMBER : expression", "$$ = $1; $1[$4] = $6;"]
        ],
        "optTerm": [
            ["", ""],
            ["TERMINATOR", ""]
        ],
        "accessor": [
            ["IDENTIFIER", n("$$ = new yy.Identifier($1);")],
            ["accessor . keywordOrIdentifier", n("$$ = new yy.PropertyAccess($1, $3);")],
            ["( expression ) . keywordOrIdentifier", n("$$ = new yy.PropertyAccess($2, $5);")]
        ],
        "outdentOrEof": [
            ["OUTDENT", ""],
            ["EOF", ""]
        ],
        "keywordOrIdentifier": typegrammar.keywordOrIdentifier,
        "identifier": [
            ["IDENTIFIER", n("$$ = new yy.Identifier($1);")]
        ]
    }
};
exports.grammar = grammar;
