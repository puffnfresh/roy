var typegrammar = require('./typegrammar').bnf;

var n = function(s) {
    return s + "$$.lineno = yylineno;";
};

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
            ["EOF", "return new yy.Module([]);"],
            ["SHEBANG TERMINATOR body EOF", "return new yy.Module($3);"],
            ["SHEBANG TERMINATOR EOF", "return new yy.Module([]);"],
            ["body EOF", "return new yy.Module($1);"]
        ],
        "body": [
            ["line", "$$ = [$1];"],
            ["body TERMINATOR line", "$$ = $1; $1.push($3);"],
            ["body TERMINATOR", "$$ = $1;"]
        ],
        "line": [
            ["statement", "$$ = $1;"],
            ["expression", "$$ = $1;"],
            ["COMMENT", n("$$ = new yy.Comment($1);")]
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
            ["line", "$$ = $1;"],
            ["IDENTIFIER LEFTARROW expression", n("$$ = new yy.Bind($1, $3);")],
            ["RETURN expression", n("$$ = new yy.Return($2);")]
        ],
        "doBlock": [
            ["INDENT doBody outdentOrEof", "$$ = $2;"]
        ],
        "statement": [
            ["LET function", "$$ = $2;"],
            ["LET binding", "$$ = $2;"],
            ["dataDecl", "$$ = $1;"],
            ["typeDecl", "$$ = $1;"],
            ["typeClassDecl", "$$ = $1;"],
            ["instanceDecl", "$$ = $1;"]
        ],
        "expression": [
            ["innerExpression", "$$ = $1;"],
            ["LAMBDA paramList optType RIGHTARROW expression", n("$$ = new yy.Function(undefined, $2, [$5], $3);")],
            ["LAMBDA paramList optType RIGHTARROW block", n("$$ = new yy.Function(undefined, $2, $5, $3);")],
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
            ["CASE pattern = expression", "$$ = [new yy.Case($2, $4)];"],
            ["caseList TERMINATOR CASE pattern = expression", "$$ = $1; $1.push(new yy.Case($4, $6));"]
        ],
        "pattern": [
            ["innerPattern", "$$ = $1;"],
            ["identifier", n("$$ = new yy.Pattern($1, []);")]
        ],
        "innerPattern": [
            ["( identifier patternIdentifiers )", n("$$ = new yy.Pattern($2, $3);")]
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

        // data Maybe a = Some a | None
        "dataDecl": [
            ["DATA IDENTIFIER optDataParamList = dataList", n("$$ = new yy.Data($2, $3, $5);")],
            ["DATA IDENTIFIER optDataParamList = INDENT dataList outdentOrEof", n("$$ = new yy.Data($2, $3, $6);")]
        ],
        "dataList": [
            ["IDENTIFIER optTypeParamList", "$$ = [new yy.Tag($1, $2)];"],
            ["dataList | IDENTIFIER optTypeParamList", "$$ = $1; $1.push(new yy.Tag($3, $4));"]
        ],

        // type Person = {firstName: String, lastName: String}
        "typeDecl": [
            ["TYPE IDENTIFIER = type", n("$$ = new yy.Type($2, $4);")]
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

        "typeClassDecl": [
            ["TYPECLASS IDENTIFIER GENERIC { INDENT typeClassLines outdentOrEof TERMINATOR }", "$$ = new yy.TypeClass($2, new yy.Generic($3), $6);"]
        ],
        "typeClassLines": [
            ["IDENTIFIER : type", "$$ = {}; $$[$1] = $3;"],
            ["typeClassLines TERMINATOR IDENTIFIER : type", "$$ = $1; $1[$3] = $5;"]
        ],

        "instanceDecl": [
            ["INSTANCE IDENTIFIER = IDENTIFIER type object", "$$ = new yy.Instance($2, $4, $5, $6);"]
        ],

        "function": [
            ["IDENTIFIER paramList optType = block optWhere", n("$$ = new yy.Function($1, $2, $5, $3, $6);")],
            ["IDENTIFIER paramList optType = expression", n("$$ = new yy.Function($1, $2, [$5], $3, []);")]
        ],
        "binding": [
            ["IDENTIFIER optType = expression", n("$$ = new yy.Let($1, $4, $2);")],
            ["IDENTIFIER optType = INDENT expression outdentOrEof", n("$$ = new yy.Let($1, $5, $2);")]
        ],
        "paramList": [
            ["( )", "$$ = [];"],
            ["param", "$$ = [$1];"],
            ["paramList ( )", "$$ = $1;"],
            ["paramList param", "$$ = $1; $1.push($2);"]
        ],
        "param": [
            ["IDENTIFIER", n("$$ = new yy.Arg($1);")],
            ["( IDENTIFIER : type )", n("$$ = new yy.Arg($2, $4);")]
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
            ["IDENTIFIER paramList optType = block optWhere", n("$$ = new yy.Function($1, $2, $5, $3, $6);")],
            ["IDENTIFIER paramList optType = expression", n("$$ = new yy.Function($1, $2, [$5], $3, []);")]
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
