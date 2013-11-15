var _ = require('underscore'),
    typeinference = require('../src/typeinference'),
    parser = require('../lib/parser'),
    lexer = require('../src/lexer'),
    // TODO: Remove
    compile = require('../src/compile');

function parseCode(s) {
    return parser.parse(lexer.tokenise(s));
}

exports.generate = function(c) {
    return parseCode(c).extend(typeinference.memoizedGenerate).sequence(typeinference.State).chain(function(result) {
        return typeinference.solve(result.attribute.constraints).map(function(substitutions) {
            return result.extend(function(node) {
                return node.attribute.substitute(substitutions);
            });
        });
    }).evalState(typeinference.GenerateState.init).attribute;
};

exports.typecheck = function(c) {
    return typeinference.typecheck(parseCode(c)).attribute;
}
