var bnf = {
    // For type annotations
    "type": [
        ["typeFunction", "$$ = $1;"],
        ["nonFunctionType", "$$ = $1;"]
    ],
    "typeFunction": [
        ["nonFunctionType RIGHTARROW nonFunctionType", "$$ = new yy.TypeFunction($1, $3);"],
        ["nonFunctionType RIGHTARROW typeFunction", "$$ = new yy.TypeFunction($1, $3);"],
        ["( typeFunction ) RIGHTARROW nonFunctionType", "$$ = new yy.TypeFunction($2, $5);"],
        ["( typeFunction ) RIGHTARROW typeFunction", "$$ = new yy.TypeFunction($2, $5);"]
    ],
    "nonFunctionType": [
        ["IDENTIFIER optTypeParamList", "$$ = new yy.TypeName($1, $2);"],
        ["GENERIC", "$$ = new yy.Generic($1);"],
        ["[ type ]", "$$ = new yy.TypeArray($2);"],
        ["( typeList )", "$$ = new yy.TypeObject($2);"],
        ["{ GENERIC | optTypePairs }", "$$ = new yy.TypeRowObject($2, $4);"],
        ["{ optTypePairs }", "$$ = new yy.TypeObject($2);"],
        ["UNIT", "$$ = new yy.Unit();"]
    ],
    "typeList": [
        ["nonFunctionType", "$$ = [$1];"],
        ["typeList , nonFunctionType", "$$ = $1; $1.push($3);"]
    ],
    "optTypeParamList": [
        ["", "$$ = [];"],
        ["typeParamList", "$$ = $1;"]
    ],
    "typeParamList": [
        ["IDENTIFIER", "$$ = [new yy.TypeName($1, [])];"],
        ["GENERIC", "$$ = [new yy.Generic($1, [])];"],
        ["( type )", "$$ = [$2];"],
        ["typeParamList IDENTIFIER", "$$ = $1; $1.push(new yy.TypeName($2, []));"],
        ["typeParamList GENERIC", "$$ = $1; $1.push(new yy.Generic($2, []));"],
        ["typeParamList ( type )", "$$ = $1; $1.push($3);"]
    ],
    "optTypePairs": [
        ["", "$$ = {};"],
        ["keywordOrIdentifier : type", "$$ = {}; $$[$1] = $3;"],
        ["optTypePairs , keywordOrIdentifier : type", "$$ = $1; $1[$3] = $5;"]
    ],
    "dataParamList": [
        ["UNIT", "$$ = new yy.Unit();"],
        ["IDENTIFIER", "$$ = [{name: $1}];"],
        ["dataParamList IDENTIFIER", "$$ = $1; $1.push({name: $2});"]
    ],
    "optDataParamList": [
        ["", "$$ = [];"],
        ["dataParamList", "$$ = $1;"]
    ],
    "keywordOrIdentifier": [
        ["THEN", "$$ = $1;"],
        ["ELSE", "$$ = $1;"],
        ["DATA", "$$ = $1;"],
        ["TYPE", "$$ = $1;"],
        ["MATCH", "$$ = $1;"],
        ["CASE", "$$ = $1;"],
        ["DO", "$$ = $1;"],
        ["WITH", "$$ = $1;"],
        ["IDENTIFIER", "$$ = $1;"]
    ]
};
exports.bnf = bnf;

var grammar = {
    "startSymbol": "typefile",

    "bnf": {
        "typefile": [
            ["EOF", "return {};"],
            ["body EOF", "return $1;"]
        ],
        "body": [
            ["pair", "$$ = {types: {}, env: {}}; if($1.data) { $$.types[$1.name] = $1.params; } else { $$.env[$1.name] = $1.type; }"],
            ["body TERMINATOR pair", "$$ = $1; if($3.data) { $$.types[$3.name] = $3.params; } else { $$.env[$3.name] = $3.type; }"],
            ["body TERMINATOR", "$$ = $1;"]
        ],

        "pair": [
            ["IDENTIFIER : type", "$$ = {name: $1, type: $3, data: false};"],
            ["TYPE IDENTIFIER optDataParamList", "$$ = {name: $2, params: $3, data: true};"]
        ],

        "type": bnf.type,
        "nonFunctionType": bnf.nonFunctionType,
        "typeFunction": bnf.typeFunction,
        "typeList": bnf.typeList,
        "optTypeParamList": bnf.optTypeParamList,
        "typeParamList": bnf.typeParamList,
        "optTypePairs": bnf.optTypePairs,
        "dataParamList": bnf.dataParamList,
        "optDataParamList": bnf.optDataParamList,
        "keywordOrIdentifier": bnf.keywordOrIdentifier
    }
};
exports.grammar = grammar;
