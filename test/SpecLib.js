var typeinference = require('../src/typeinference'),
    parser = require('../src/parser'),
    lexer = require('../src/lexer'),
    // TODO: Remove
    compile = require('../src/compile');

function parseCode(s) {
    return parser.parse(lexer.tokenise(s));
}

exports.generate = function(c) {
    return typeinference.generate(parseCode(c)).state;
};

exports.typecheck = function(c) {
    return typeinference.typecheck(parseCode(c));
}
