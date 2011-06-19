(function(exports) {
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
    var indent = 0;
    var getIndent = function(thisIndent) {
        if(!thisIndent) {
            thisIndent = indent;
        }
        var spacing = "";
        var i;
        for(i = 0; i < thisIndent; i++) {
            spacing += "    ";
        }
        return spacing;
    };
    var pushIndent = function() {
        indent++;
        return getIndent();
    };
    var popIndent = function() {
        indent--;
        return getIndent();
    };
    var compileNode = function(n) {
        return n.accept({
            // Function definition to JavaScript function.
            visitFunction: function() {
                var getArgs = function(a) {
                    return a.map(function(v) {
                        return v.name;
                    }).join(", ");
                };
                var compiledNodeBody = n.body.map(compileNode);
                var initString = '';;
                pushIndent();
                if(compiledNodeBody.length > 1) {
                    initString = getIndent() + compiledNodeBody.slice(0, compiledNodeBody.length - 1).join(';\n' + getIndent()) + ';';
                }
                var lastString = compiledNodeBody[compiledNodeBody.length - 1];
                var varEquals = "";
                if(n.name) {
                    varEquals = "var " + n.name + " = ";
                }
                return varEquals + "function(" + getArgs(n.args) + ") {\n" + initString + "\n" + getIndent() + "return " + lastString + ";\n" + popIndent() + "}";
            },
            visitIfThenElse: function() {
                var compiledNodeCondition = compileNode(n.condition);
                var compiledNodeIfTrue = n.ifTrue.map(compileNode).join('');
                var compiledNodeIfFalse = n.ifFalse.map(compileNode).join('');
                return "(function() {\n" + pushIndent() + "if(" + compiledNodeCondition + ") {\n" + pushIndent() + "return " + compiledNodeIfTrue + "\n" + popIndent() + "} else {\n" + pushIndent() + "return " + compiledNodeIfFalse + "\n" + popIndent() + "}})();";
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
            visitReturn: function() {
                return "return __monad__[\"return\"](" + compileNode(n.value) + ");";
            },
            visitBind: function() {
                return "return __monad__[\"bind\"](" + compileNode(n.value) + ", function(" + n.name + ") {\n" + pushIndent() + n.rest.map(compileNode).join("\n" + getIndent()) + "\n" + popIndent() + "});";
            },
            visitDo: function() {
                var compiledInit = [];
                var firstBind;
                var lastBind;
                var lastBindIndex = 0;
                n.body.forEach(function(node, i) {
                    if(node instanceof nodes.Bind) {
                        if(!lastBind) {
                            firstBind = node;
                        } else {
                            lastBind.rest = n.body.slice(lastBindIndex + 1, i + 1);
                        }
                        lastBindIndex = i;
                        lastBind = node;
                    } else {
                        if(!lastBind) {
                            compiledInit.push(compileNode(node));
                        }
                    }
                });
                lastBind.rest = n.body.slice(lastBindIndex + 1);
                return "(function(){\n" + pushIndent() + "var __monad__ = " + compileNode(n.value) + ";\n" + getIndent() + compiledInit.join('\n' + getIndent()) + compileNode(firstBind) + "\n" + popIndent() + "})()";
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
                pushIndent();
                pushIndent();
                var cases = n.cases.map(function(c) {
                    var assignments = c.pattern.vars.map(function(a, i) {
                        return "var " + a + " = " + compileNode(n.value) + "._" + i + ";";
                    });
                    return "if(" + compileNode(n.value) + " instanceof " + c.pattern.tag + ") {\n" + pushIndent() + assignments.join("\n" + getIndent()) + "\n" + getIndent() + "return " + compileNode(c.value) + "\n" + popIndent() + "}";
                });
                popIndent();
                popIndent();
                return "(function() {\n" + getIndent(indent + 2) + cases.join(" else ") + "\n" + getIndent(indent + 1) + "})()";
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
                pushIndent();
                for(key in n.values) {
                    pairs.push("\"" + key + "\": " + compileNode(n.values[key]));
                }
                return "{\n" + getIndent() + pairs.join(",\n" + getIndent()) + "\n" + popIndent() + "}";
            }
        });
    };

    var compile = function(source) {
        // Parse the file to an AST.
        var tokens = lexer.tokenise(source);
        var ast = parser.parse(tokens);

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

        var fs = require('fs');

        // Read the file content.
        var filename = process.argv[2];
        var source = fs.readFileSync(filename, 'utf8');

        // Write the JavaScript output.
        var extension = /\.roy$/;
        console.assert(filename.match(extension), 'Filename must end with ".roy"');
        fs.writeFile(filename.replace(extension, '.js'), compile(source), 'utf8');
    };
    exports.main = main;

    if(!module.parent) {
        main();
    }
})(typeof exports == 'undefined' ? this['./compile'] = {} : exports);
