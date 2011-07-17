var typecheck = require('typeinference').typecheck,
    nodes = require('nodes').nodes,
    types = require('types'),
    parser = require('parser').parser,
    lexer = require('lexer');

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
var macros = {};
var indent = 0;
var getIndent = function(extra) {
    if(!extra) {
        extra = 0;
    }
    var spacing = "";
    var i;
    for(i = 0; i < indent + extra; i++) {
        spacing += "    ";
    }
    return spacing;
};
var joinIndent = function(args, extra) {
    var lineIndent = "\n" + getIndent(extra);
    var argIndent = args.join("\n" + getIndent(extra));
    if(argIndent) {
        return argIndent + lineIndent;
    }
    return "";
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
            var init = [];
            pushIndent();
            if(compiledNodeBody.length > 1) {
                init.push(compiledNodeBody.slice(0, compiledNodeBody.length - 1).join(';\n' + getIndent()) + ';');
            }
            var lastString = compiledNodeBody[compiledNodeBody.length - 1];
            var varEquals = "";
            if(n.name) {
                varEquals = "var " + n.name + " = ";
            }
            return varEquals + "function(" + getArgs(n.args) + ") {\n" +
                getIndent() + joinIndent(init) + "return " + lastString +
                ";\n" + popIndent() + "}";
        },
        visitIfThenElse: function() {
            var compiledNodeCondition = compileNode(n.condition);
            var compiledNodeIfTrueInit = n.ifTrue.slice(0, n.ifTrue.length - 1).map(compileNode).join(';') + ';';
            var compiledNodeIfTrueLast = compileNode(n.ifTrue[n.ifTrue.length - 1]);
            var compiledNodeIfFalseInit = n.ifFalse.slice(0, n.ifFalse.length - 1).map(compileNode).join(';') + ';';
            var compiledNodeIfFalseLast = compileNode(n.ifFalse[n.ifFalse.length - 1]);
            return "(function() {\n" + pushIndent() + "if(" +
                compiledNodeCondition + ") {\n" + compiledNodeIfTrueInit +
                pushIndent() + "return " + compiledNodeIfTrueLast + "\n" +
                popIndent() + "} else {\n" + compiledNodeIfFalseInit +
                pushIndent() + "return " + compiledNodeIfFalseLast + "\n" +
                popIndent() + "}})();";
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
        visitReplacement: function() {
            return n.value;
        },
        visitQuoted: function() {
            var serializeNode = {
                visitReplacement: function(v) {
                    return "new nodes.Replacement(" + compileNode(v.value) + ")";
                },
                visitIdentifier: function(v) {
                    return "new nodes.Identifier(" + JSON.stringify(v.value) + ")";
                },
                visitAccess: function(v) {
                    return "new nodes.Access(" + serialize(v.value) + ", " + JSON.stringify(v.property) + ")";
                },
                visitCall: function(v) {
                    return "new nodes.Call(" + serialize(v.func) + ", [" + v.args.map(serialize).join(', ') + "])";
                }
            };
            var serialize = function(v) {
                return v.accept(serializeNode);
            };
            return serialize(n.value);
        },
        visitMacro: function() {
            var init = n.body.slice(0, n.body.length - 1);
            var last = n.body[n.body.length - 1];
            var code = init.map(compileNode).join('\n') + '\nreturn ' + compileNode(last) + ';';
            macros[n.name] = 'var nodes = this.nodes; ' + code;
        },
        visitReturn: function() {
            return "return __monad__[\"return\"](" + compileNode(n.value) + ");";
        },
        visitBind: function() {
            return "return __monad__[\"bind\"](" + compileNode(n.value) +
                ", function(" + n.name + ") {\n" + pushIndent() +
                n.rest.map(compileNode).join("\n" + getIndent()) + "\n" +
                popIndent() + "});";
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
            return "(function(){\n" + pushIndent() + "var __monad__ = " +
                compileNode(n.value) + ";\n" + getIndent() +
                compiledInit.join('\n' + getIndent()) +
                compileNode(firstBind) + "\n" + popIndent() + "})()";
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
                return "if(" + compileNode(n.value) + " instanceof " + c.pattern.tag +
                    ") {\n" + getIndent(3) + joinIndent(assignments, 3) + "return " +
                    compileNode(c.value) + "\n" + getIndent(2) + "}";
            });
            return "(function() {\n" + getIndent(2) + cases.join(" else ") + "\n" + getIndent(1) + "})()";
        },
        // Call to JavaScript call.
        visitCall: function() {
            if(macros[n.func.value]) {
                // Is a macro
                var f = new Function(macros[n.func.value]);
                var tree = f.apply({nodes: nodes}, n.args);
                // TODO: Give an actual env
                typecheck([tree], {});
                return compileNode(tree);
            } else if(data[n.func.value]) {
                // Is a tag
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
        visitBinaryStringOperator: function() {
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

var compile = function(source, env, opts) {
    if(!env) env = {};
    if(!opts) opts = {};

    // Parse the file to an AST.
    var tokens = lexer.tokenise(source);
    var ast = parser.parse(tokens);

    // Typecheck the AST. Any type errors will throw an exception.
    var typeA = new types.Variable();
    var typeB = new types.Variable();
    var resultType = typecheck(ast, env);

    // Output strict JavaScript.
    var output = [];
    if(opts.strict) {
        output.push('"use strict";');
    }
    ast.forEach(function(v) {
        output.push(compileNode(v));
    });
    // Add a newline at the end
    output.push("");

    return {type: resultType, output: output.join('\n')};
};
exports.compile = compile;

var getSandbox = function() {
    var sandbox = {require: require};

    var name;
    for(name in global) {
        sandbox[name] = global[name];
    }

    return sandbox;
};

var nodeRepl = function() {
    var readline = require('readline');
    var vm = require('vm');
    var stdout = process.stdout;
    var stdin = process.openStdin();
    var repl = readline.createInterface(stdin, stdout);

    var env = {};
    var sandbox = getSandbox();

    repl.setPrompt('roy> ');
    repl.on('close', function() {
        stdin.destroy();
    });
    repl.on('line', function(line) {
        var compiled;
        var output;
        try {
            compiled = compile(line, env);
            output = vm.runInNewContext(compiled.output, sandbox, 'eval');
            if(typeof output != 'undefined') console.log(output + " : " + compiled.type);
        } catch(e) {
            console.log((e.stack || e.toString()) + '\n\n');
        }
        repl.prompt();
    });
    repl.prompt();
};

var main = function() {
    if(process.argv.length < 3) {
        nodeRepl();
    }

    var fs = require('fs');
    var filenames = process.argv.slice(2);

    var vm;
    var run = false;
    if(filenames[0] == '-r') {
        vm = require('vm');
        run = true;
        filenames.shift();
    }

    var env = {};
    filenames.forEach(function(filename) {
        // Read the file content.
        var source = fs.readFileSync(filename, 'utf8');

        // Write the JavaScript output.
        var extension = /\.roy$/;
        console.assert(filename.match(extension), 'Filename must end with ".roy"');
        var compiled = compile(source, env);
        if(run) {
            output = vm.runInNewContext(compiled.output, getSandbox(), 'eval');
        } else {
            fs.writeFile(filename.replace(extension, '.js'), compiled.output, 'utf8');
        }
    });
};
exports.main = main;

if(exports && !module.parent) {
    main();
}
