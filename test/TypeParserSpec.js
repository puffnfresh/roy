describe('compiler', function(){
    var jison = require('jison'),
        typegrammar = require('../src/typegrammar'),
        typeinference = require('../src/typeinference'),
        types = require('../src/types'),
        lexer = require('../src/lexer'),
        nodes = require('../src/nodes');

    typegrammar.startSymbol = 'oneType';
    typegrammar.bnf.oneType = [['type EOF', 'return $1;']];

    typeparser = new jison.Parser(typegrammar, { debug: true, noDefaultResolve: true });

    typeparser.yy = nodes;

    typeparser.lexer =  {
        "lex": function() {
            var token = this.tokens[this.pos] ? this.tokens[this.pos++] : ['EOF'];
            if ( token[2] != this.yylineno ) {
                this.column = 0
            } else {
                this.column += token[1].length;
            }

            this.yytext = token[1];
            this.yylineno = token[2];
            return token[0];
        },
        "setInput": function(tokens) {
            this.tokens = tokens;
            this.pos = 0;
            this.column = 0;
        },
        "upcomingInput": function() {
            return "";
        },
        "showPosition": function() {
            return 'column: ' + this.column;
        }
    };

    function parsedType(s) {
        var tokens = lexer.tokenise(s);
        var v = typeparser.parse(tokens);
        return typeinference.nodeToType(v, {}, {}).evalState(typeinference.GenerateState.init);
    }

    function expectEqualTypes(subject, target) {
        // FIXME: Use intentional equality once it is implemented
        expect(subject.toString()).toEqual(target.toString());
    }

    it('should parse atomic types', function() {
        expectEqualTypes( parsedType('Number'), new types.NumberType() );
        expectEqualTypes( parsedType('Boolean'),new types.BooleanType() );
        expectEqualTypes( parsedType('String'), new types.StringType() );
    });

    it('should parse object types', function() {
        expectEqualTypes( parsedType('{}'), new types.ObjectType({}) );
        expectEqualTypes( parsedType('{foo:String}'), new types.ObjectType({foo: new types.StringType()}) );

        expectEqualTypes( parsedType('{foo:String, baz:Number}'),
                          new types.ObjectType({
                              foo: new types.StringType(),
                              baz: new types.NumberType()
                          }));
        // TODO: expectEqualTypes( parsedType('{\n\tfoo:String\n}'), new types.ObjectType({foo: new types.StringType()}) );
    });

    it('should parse function types', function() {
        expectEqualTypes( parsedType('Function(String, String)'),
                          new types.FunctionType([new types.StringType(), new types.StringType()]) );
    });

    it('should parse array types', function() {
        expectEqualTypes( parsedType('[Number]'),
                          new types.ArrayType(new types.NumberType()) );
    });
});
