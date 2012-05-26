var typeinference = require('../src/typeinference'),
    parser = require('../src/parser'),
    lexer = require('../src/lexer');

function parseCode(s) {
    return parser.parse(lexer.tokenise(s));
}

exports.generate = function(c) {
    return typeinference.typecheck(parseCode(c));
};
