var typecheck = require('typeinference').typecheck,
    nodes = require('nodes').nodes,
    types = require('types'),
    parser = require('parser').parser,
    lexer = require('lexer'),
    _ = require('underscore');

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
                return _.map(a, function(v) {
                    return v.name;
                }).join(", ");
            };
            pushIndent();
            var compiledNodeBody = _.map(n.body, compileNode);
            var init = [];
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

            var compileAppendSemicolon = function(n) {
                return compileNode(n) + ';';
            };

            pushIndent();
            pushIndent();
            var compiledNodeIfTrueInit = joinIndent(_.map(n.ifTrue.slice(0, n.ifTrue.length - 1), compileAppendSemicolon));
            var compiledNodeIfTrueLast = compileNode(n.ifTrue[n.ifTrue.length - 1]);
            var compiledNodeIfFalseInit = joinIndent(_.map(n.ifFalse.slice(0, n.ifFalse.length - 1), compileAppendSemicolon));
            var compiledNodeIfFalseLast = compileNode(n.ifFalse[n.ifFalse.length - 1]);
            popIndent();
            popIndent();

            return "(function() {\n" +
                getIndent(1) + "if(" + compiledNodeCondition + ") {\n" +
                getIndent(2) + compiledNodeIfTrueInit + "return " + compiledNodeIfTrueLast + ";\n" +
                getIndent(1) + "} else {\n" +
                getIndent(2) + compiledNodeIfFalseInit + "return " + compiledNodeIfFalseLast + ";\n" +
                getIndent(1) + "}\n" +
                getIndent() + "})()";
        },
        // Let binding to JavaScript variable.
        visitLet: function() {
            return "var " + n.name + " = " + compileNode(n.value) + ";";
        },
        visitData: function() {
            _.each(n.tags, function(tag) {
                data[tag.name] = n.name;
            });
            var defs = _.map(n.tags, compileNode);
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
                    return "new nodes.Call(" + serialize(v.func) + ", [" + _.map(v.args, serialize).join(', ') + "])";
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
            var code = _.map(init, compileNode).join('\n') + '\nreturn ' + compileNode(last) + ';';
            macros[n.name] = 'var nodes = this.nodes; ' + code;
        },
        visitReturn: function() {
            return "return __monad__[\"return\"](" + compileNode(n.value) + ");";
        },
        visitBind: function() {
            return "return __monad__[\"bind\"](" + compileNode(n.value) +
                ", function(" + n.name + ") {\n" + pushIndent() +
                _.map(n.rest, compileNode).join("\n" + getIndent()) + "\n" +
                popIndent() + "});";
        },
        visitDo: function() {
            var compiledInit = [];
            var firstBind;
            var lastBind;
            var lastBindIndex = 0;
            _.each(n.body, function(node, i) {
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
            var args = _.map(n.vars, function(v) {
                return v.name;
            });
            var setters = _.map(n.vars, function(v, i) {
                return "this._" + i + " = " + v.name;
            });
            return "var " + n.name + " = function(" + args.join(", ") + "){" + setters.join(";") + "};";
        },
        visitMatch: function() {
            var flatMap = function(a, f) {
                return _.flatten(_.map(a, f));
            };

            var pathConditions = _.map(n.cases, function(c) {
                var getVars = function(pattern, varPath) {
                    return flatMap(pattern.vars, function(a, i) {
                        var nextVarPath = varPath.slice();
                        nextVarPath.push(i);

                        return a.accept({
                            visitIdentifier: function() {
                                if(a.value in data) return [];

                                var accessors = _.map(nextVarPath, function(x) {
                                    return "._" + x;
                                }).join('');
                                return ["var " + a.value + " = " + compileNode(n.value) + accessors + ";"];
                            },
                            visitPattern: function() {
                                return getVars(a, nextVarPath);
                            }
                        });
                    });
                };
                var vars = getVars(c.pattern, []);

                var getTagPaths = function(pattern, patternPath) {
                    return flatMap(pattern.vars, function(a, i) {
                        var nextPatternPath = patternPath.slice();

                        nextPatternPath.push(i);
                        return a.accept({
                            visitIdentifier: function() {
                                if(a.value in data) {
                                    return [{path: nextPatternPath, tag: a}];
                                }
                                return [];
                            },
                            visitPattern: function() {
                                var inner = getTagPaths(a, nextPatternPath);
                                inner.unshift({path: nextPatternPath, tag: a.tag});
                                return inner;
                            }
                        });
                    });
                };
                var tagPaths = getTagPaths(c.pattern, []);
                var compiledValue = compileNode(n.value);
                var extraConditions = _.map(tagPaths, function(e) {
                    return ' && ' + compiledValue + '._' + e.path.join('._') + ' instanceof ' + e.tag.value;
                }).join('');

                // More specific patterns need to appear first
                // Need to sort by the length of the path
                var maxTagPath = _.max(tagPaths, function(t) {
                    return t.path.length;
                });
                var maxPath = maxTagPath ? maxTagPath.path : [];

                return {
                    path: maxPath,
                    condition: "if(" + compiledValue + " instanceof " + c.pattern.tag.value +
                        extraConditions + ") {\n" + getIndent(2) +
                        joinIndent(vars, 2) + "return " + compileNode(c.value) +
                        ";\n" + getIndent(1) + "}"
                };
            });

            var cases = _.map(_.sortBy(pathConditions, function(t) {
                return -t.path.length;
            }), function(e) {
                return e.condition;
            });

            return "(function() {\n" + getIndent(1) + cases.join(" else ") + "\n" + getIndent() + "})()";
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
                return 'new ' + n.func.value + "(" + _.map(n.args, compileNode).join(", ") + ")";
            }
            return compileNode(n.func) + "(" + _.map(n.args, compileNode).join(", ") + ")";
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
        visitBinaryBooleanOperator: function() {
            return [compileNode(n.left), n.name, compileNode(n.right)].join(" ");
        },
        visitBinaryStringOperator: function() {
            return [compileNode(n.left), n.name, compileNode(n.right)].join(" ");
        },
        visitWith: function() {
            var args = compileNode(n.left) + ', ' + compileNode(n.right);
            var inner = _.map(['__l__', '__r__'], function(name) {
                return 'for(__n__ in ' + name + ') {\n' + getIndent(2) + '__o__[__n__] = ' + name + '[__n__];\n' + getIndent(1) + '}';
            });
            return joinIndent(['(function(__l__, __r__) {', 'var __o__ = {}, __n__;'], 1) + joinIndent(inner, 1) + 'return __o__;\n' + getIndent() + '})(' + args + ')';
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
            return '[' + _.map(n.values, compileNode).join(', ') + ']';
        },
        visitTuple: function() {
            return '[' + _.map(n.values, compileNode).join(', ') + ']';
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
    _.each(ast, function(v) {
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
    var fs = require('fs');
    var vm = require('vm');
    var stdout = process.stdout;
    var stdin = process.openStdin();
    var repl = readline.createInterface(stdin, stdout);

    var env = {};
    var sandbox = getSandbox();

    // Include the standard library
    var stdlib = fs.readFileSync('lib/std.roy', 'utf8');
    vm.runInNewContext(compile(stdlib, env).output, sandbox, 'eval');

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

    // Include the standard library
    filenames.unshift('lib/std.roy');

    var env = {};
    var sandbox = getSandbox();
    _.each(filenames, function(filename) {
        // Read the file content.
        var source = fs.readFileSync(filename, 'utf8');

        // Write the JavaScript output.
        var extension = /\.roy$/;
        console.assert(filename.match(extension), 'Filename must end with ".roy"');
        var compiled = compile(source, env);
        if(run) {
            output = vm.runInNewContext(compiled.output, sandbox, 'eval');
        } else {
            fs.writeFile(filename.replace(extension, '.js'), compiled.output, 'utf8');
        }
    });
};
exports.main = main;

if(exports && !module.parent) {
    main();
}
