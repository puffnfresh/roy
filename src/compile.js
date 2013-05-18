var typecheck = require('./typeinference').typecheck,
    macroexpand = require('./macroexpand').macroexpand,
    loadModule = require('./modules').loadModule,
    exportType = require('./modules').exportType,
    types = require('./types'),
    nodeToType = require('./typeinference').nodeToType,
    nodes = require('./nodes').nodes,
    lexer = require('./lexer'),
    parser = require('../lib/parser').parser,
    typeparser = require('../lib/typeparser').parser,
    escodegen = require('escodegen'),
    _ = require('underscore');

// Assigning the nodes to `parser.yy` allows the grammar to access the nodes from
// the `yy` namespace.
parser.yy = typeparser.yy = nodes;

parser.lexer = typeparser.lexer =  {
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

// Separate end comments from other expressions
var splitComments = function(body) {
    return _.reduceRight(body, function(accum, node) {
        if(!accum.body.length && node instanceof nodes.Comment) {
            accum.comments.unshift(node);
            return accum;
        }
        accum.body.unshift(node);
        return accum;
    }, {
        body: [],
        comments: []
    });
};

// Compile an abstract syntax tree (AST) node to JavaScript.
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

var compileNodeWithEnvToJsAST = function(n, env, opts) {
    if(!opts) opts = {};
    var compileNode = function(n) {
        return compileNodeWithEnvToJsAST(n, env);
    };
    return n.accept({
        // Function definition to JavaScript function.
        visitFunction: function() {
            var body = {
                type: "BlockStatement",
                body: []
            };
            if (n.whereDecls.length) {
                _.each(n.whereDecls, function (w) {
                    body.body.push(compileNode(w));
                });
            }
            var exprsWithoutComments = _.map(splitComments(n.body).body, compileNode);
            exprsWithoutComments.push({
                type: "ReturnStatement",
                argument: exprsWithoutComments.pop()
            });
            var func = {
                type: "FunctionExpression",
                id: null,
                params: _.map(n.args, function (a) {
                    return {
                        type: "Identifier",
                        name: a
                    };
                }),
                body: body
            };
            if (! n.name) {
                return func;
            }
            return {
                type: "VariableDeclaration",
                kind: "var",
                declarations: [{
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: n.name
                    },
                    init: func
                }]
            };
        },
        visitIfThenElse: function() {
            var ifTrue = _.map(splitComments(n.ifTrue).body, compileNode);
            if (ifTrue.length) {
                ifTrue.push({
                    type: "ReturnStatement",
                    argument: ifTrue.pop()
                });
            }

            var ifFalse = _.map(splitComments(n.ifFalse).body, compileNode);
            if (ifFalse.length) {
                ifFalse.push({
                    type: "ReturnStatement",
                    argument: ifFalse.pop()
                });
            }

            var funcBody = [{
                type: "IfStatement",
                test: compileNode(n.condition),
                consequent: {
                    type: "BlockStatement",
                    body: ifTrue
                },
                alternate: {
                    type: "BlockStatement",
                    body: ifFalse
                }
            }];

            return {
                type: "CallExpression",
                'arguments': [],
                callee: {
                    type: "FunctionExpression",
                    id: null,
                    params: [],
                    body: {
                        type: "BlockStatement",
                        body: funcBody
                    }
                }
            };
        },
        // Let binding to JavaScript variable.
        visitLet: function() {
            return {
                type: "VariableDeclaration",
                id: {
                    type: "Identifier",
                    name: n.name
                },
                init: compileNode(n.value)
            };
        },
        visitInstance: function() {
            return {
                type: "VariableDeclaration",
                id: {
                    type: "Identifier",
                    name: n.name
                },
                init: compileNode(n.object)
            };
        },
        visitAssignment: function() {
            return {
                type: "AssignmentExpression",
                operator: "=",
                left: compileNode(n.name),
                right: compileNode(n.value)
            };
        },
        visitData: function() {
            return {
                type: "VariableDeclaration",
                kind: "var",
                declarations: _.map(n.tags, compileNode)
            };
        },
        visitExpression: function() {
            // Pass-through
            return compileNode(n.value);
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
                visitPropertyAccess: function(v) {
                    return "new nodes.PropertyAccess(" + serialize(v.value) + ", " + JSON.stringify(v.property) + ")";
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
        visitReturn: function() {
            return {
                type: "ExpressionStatement",
                expression: {
                    type: "CallExpression",
                    callee: {
                        type: "MemberExpression",
                        computed: false,
                        object: {
                            type: "Identifier",
                            name: "__monad__"
                        },
                        property: {
                            type: "Identifier",
                            name: "return"
                        }
                    },
                    "arguments": [compileNode(n.value)]
                }
            };
        },
        visitBind: function() {
            var body = _.map(n.rest.slice(0, n.rest.length - 1), compileNode);
            body.push({
                type: "ReturnStatement",
                argument: compileNode(n.rest[n.rest.length - 1])
            });
            return {
                type: "CallExpression",
                callee: {
                    type: "MemberExpression",
                    computed: false,
                    object: {
                        type: "Identifier",
                        name: "__monad__"
                    },
                    property: {
                        type: "Identifier",
                        name: "bind"
                    }
                },
                "arguments": [compileNode(n.value), {
                    type: "FunctionExpression",
                    id: null,
                    params: [{
                        type: "Identifier",
                        name: n.name
                    }],
                    body: body
                }]
            };
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
            if(lastBind) {
                lastBind.rest = n.body.slice(lastBindIndex + 1);
            }
            var body = {
                type: "BlockStatement",
                body: [{
                    type: "VariableDeclaration",
                    kind: "var",
                    declarations: [{
                        type: "VariableDeclarator",
                        id: {
                            type: "Identifier",
                            name: "__monad__"
                        },
                        init: compileNode(n.value)
                    }]
                }]
            };
            body.body = compiledInit.concat(body.body);
            return {
                type: "CallExpression",
                "arguments": [],
                callee: body
            };
        },
        visitTag: function() {
            var tagName = {
                type: "Identifier",
                name: n.name
            };
            var args = _.map(n.vars, function(v, i) {
                return {
                    type: "Identifier",
                    name: v.value + "_" + i
                };
            });
            var setters = _.map(args, function(v, i) {
                return { // "this._" + i + " = " + v;
                    type: "ExpressionStatement",
                    expression: {
                        type: "AssignmentExpression",
                        operator: "=",
                        left: {
                            type: "MemberExpression",
                            computed: false,
                            object: {
                                type: "ThisExpression"
                            },
                            property: {
                                type: "Identifier",
                                name: "_" + i
                            }
                        },
                        right: v
                    }
                };
            });
            var constructorCheck = {
                type: "IfStatement",
                test: {
                    type: "UnaryExpression",
                    operator: "!",
                    argument: {
                        type: "BinaryExpression",
                        operator: "instanceof",
                        left: { type: "ThisExpression" },
                        right: tagName
                    }
                },
                consequent: {
                    type: "BlockStatement",
                    body: [{
                        type: "ReturnStatement",
                        argument: {
                            type: "NewExpression",
                            callee: tagName,
                            'arguments': args
                        }
                    }]
                },
                alternate: null
            };
            setters.unshift(constructorCheck);
            var constructorBody = {
                type: "BlockStatement",
                body: setters
            };
            return {
                type: "VariableDeclarator",
                id: tagName,
                init: {
                    type: "FunctionExpression",
                    id: null,
                    params: args,
                    body: constructorBody
                }
            };
        },
        visitMatch: function() {
            var flatMap = function(a, f) {
                return _.flatten(_.map(a, f));
            };

            var compiledValue = compileNode(n.value);
            var valuePlaceholder = '_m';

            var pathConditions = _.map(n.cases, function(c) {
                var getVars = function(pattern, varPath) {
                    return flatMap(pattern.vars, function(a, i) {
                        var nextVarPath = varPath.slice();
                        nextVarPath.push(i);

                        return a.accept({
                            visitIdentifier: function() {
                                if(a.value == '_') return [];

                                var accessors = _.map(nextVarPath, function(x) {
                                    return "._" + x;
                                }).join('');
                                return ["var " + a.value + " = " + valuePlaceholder + accessors + ";"];
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
                var extraConditions = _.map(tagPaths, function(e) {
                    return ' && ' + valuePlaceholder + '._' + e.path.join('._') + ' instanceof ' + e.tag.value;
                }).join('');

                // More specific patterns need to appear first
                // Need to sort by the length of the path
                var maxTagPath = _.max(tagPaths, function(t) {
                    return t.path.length;
                });
                var maxPath = maxTagPath ? maxTagPath.path : [];

                return {
                    path: maxPath,
                    condition: "if(" + valuePlaceholder + " instanceof " + c.pattern.tag.value +
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

            return "(function(" + valuePlaceholder + ") {\n" + getIndent(1) + cases.join(" else ") + "\n" + getIndent() + "})(" + compiledValue + ")";
        },
        // Call to JavaScript call.
        visitCall: function() {
            var typeClasses = '';
            if(n.typeClassInstance) {
                typeClasses = n.typeClassInstance + ', ';
            }
            if(n.func.value == 'import') {
                return importModule(JSON.parse(n.args[0].value), env, opts);
            }
            return compileNode(n.func) + "(" + typeClasses + _.map(n.args, compileNode).join(", ") + ")";
        },
        visitPropertyAccess: function() {
            return {
                type: "MemberExpression",
                computed: false,
                object: compileNode(n.value),
                property: { type: "Identifier", name: n.property }
            };
        },
        visitAccess: function() {
            return {
                type: "MemberExpression",
                computed: true,
                object: compileNode(n.value),
                property: compileNode(n.property)
            };
        },
        visitUnaryBooleanOperator: function() {
            return [n.name, compileNode(n.value)].join(" ");
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
            var copyLoop = function (varName) {
                return {
                    type: "ForInStatement",
                    left: { type: "Identifier", name: "__n__" },
                    right: { type: "Identifier", name: varName },
                    body: {
                        type: "BlockStatement",
                        body: [{
                            type: "ExpressionStatement",
                            expression: {
                                type: "AssignmentExpression",
                                operator: "=",
                                left: {
                                    type: "MemberExpression",
                                    computed: true,
                                    object: { type: "Identifier", name: "__o__" },
                                    property: { type: "Identifier", name: "__n__" }
                                },
                                right: {
                                    type: "MemberExpression",
                                    computed: true,
                                    object: { type: "Identifier", name: varName },
                                    property: { type: "Identifier", name: "__n__" }
                                }
                            }
                        }]
                    }
                };
            };
            var funcBody = [];
            funcBody.push({
                type: "VariableDeclaration",
                kind: "var",
                declarations: [{
                    type: "VariableDeclarator",
                    id: { type: "Identifier", name: "__o__" },
                    init: { type: "ObjectExpression", properties: [] }
                }, {
                    type: "VariableDeclarator",
                    id: { type: "Identifier", name: "__n__" },
                    init: null
                }]
            });
            funcBody.push(copyLoop("__l__"));
            funcBody.push(copyLoop("__r__"));

            return {
                type: "CallExpression",
                'arguments': _.map([n.left, n.right], compileNode),
                callee: {
                    type: "FunctionExpression",
                    id: null,
                    params: [
                        { type: "Identifier", name: "__l__" },
                        { type: "Identifier", name: "__r__" }
                    ],
                    body: { type: "BlockStatement", body: funcBody }
                }
            };
        },
        // Print all other nodes directly.
        visitComment: function() {
            return n.value;
        },
        visitIdentifier: function() {
            if(n.typeClassInstance) {
                return {
                    type: "MemberExpression",
                    computed: false,
                    object: {
                        type: "Identifier",
                        name: n.typeClassInstance
                    },
                    property: {
                        type: "Identifier",
                        name: n.value
                    }
                };
            }
            return {
                type: "Identifier",
                name: n.value
            };
        },
        visitNumber: function() {
            return {
                type: "Literal",
                value: parseFloat(n.value)
            };
        },
        visitString: function() {
            /*jshint evil: true */
            return {
                type: "Literal",
                value: eval(n.value)
            };
        },
        visitBoolean: function() {
            return {
                type: "Literal",
                value: n.value === "true"
            };
        },
        visitUnit: function() {
            return {
                type: "Literal",
                value: null
            };
        },
        visitArray: function() {
            return {
                type: "ArrayExpression",
                elements: _.map(n.values, compileNode)
            };
        },
        visitTuple: function() {
            return {
                type: "ArrayExpression",
                elements: _.map(n.values, compileNode)
            };
        },
        visitObject: function() {
            var key, pairs = [];
            for(key in n.values) {
                pairs.push({
                    type: "Property",
                    key: {
                        type: "Identifier",
                        name: key
                    },
                    value: compileNode(n.values[key])
                });
            }
            return {
                type: "ObjectExpression",
                properties: pairs
            };
        }
    });
};
exports.compileNodeWithEnvToJsAST = compileNodeWithEnvToJsAST;
var compileNodeWithEnv = function (n, env, opts) {
    var ast = compileNodeWithEnvToJsAST(n, env, opts);
    if (typeof ast === "string") {
        return ast;
    }
    var generated = escodegen.generate(ast);
    return generated;
};
exports.compileNodeWithEnv = compileNodeWithEnv;

var compile = function(source, env, aliases, opts) {
    if(!env) env = {};
    if(!aliases) aliases = {};
    if(!opts) opts = {};

    if(!opts.exported) opts.exported = {};

    // Parse the file to an AST.
    var tokens = lexer.tokenise(source);
    var ast = parser.parse(tokens);
    ast = macroexpand(ast, env, opts);

    // Typecheck the AST. Any type errors will throw an exception.
    var resultType = typecheck(ast, env, aliases);

    // Export types
    ast = _.map(ast, function(n) {
        if(n instanceof nodes.Call && n.func.value == 'export') {
            return exportType(n.args[0], env, opts.exported, opts.nodejs);
        }
        return n;
    });

    var output = [];

    if(!opts.nodejs) {
        output.push("(function() {");
    }

    if(opts.strict) {
        output.push('"use strict";');
    }

    var outputLine = output.length + 1;
    _.each(ast, function(v) {
        var compiled = compileNodeWithEnv(v, env, opts),
            j, lineCount;

        if(compiled) {
            lineCount = compiled.split('\n').length;

            if(opts.sourceMap && v.lineno > 1) {
                opts.sourceMap.addMapping({
                    source: opts.filename,
                    original: {
                        line: v.lineno,
                        column: 0
                    },
                    generated: {
                        line: outputLine,
                        column: 0
                    }
                });
            }
            outputLine += lineCount;

            output.push(compiled + (v instanceof nodes.Comment ? '' : ';'));
        }
    });

    if(!opts.nodejs) {
        output.push("})();");
    }

    // Add a newline at the end
    output.push("");

    return {type: resultType, output: output.join('\n')};
};
exports.compile = compile;

var getSandbox = function() {
    var sandbox = {require: require, exports: exports};

    var name;
    for(name in global) {
        sandbox[name] = global[name];
    }

    return sandbox;
};

var getFileContents = function(filename) {
    var fs = require('fs'),
        exts = ["", ".roy", ".lroy"],
        filenames = _.map(exts, function(ext){
            return filename + ext;
        }),
        foundFilename,
        source,
        err,
        i;

    // Check to see if an extension is specified, if so, don't bother
    // checking others
    if (/\..+$/.test(filename)) {
        source = fs.readFileSync(filename, 'utf8');
        filenames = [filename];
    } else {
        foundFilename = _.find(filenames, function(filename) {
            return fs.existsSync(filename);
        });
        if(foundFilename) {
            source = fs.readFileSync(foundFilename, 'utf8');
        }
    }

    if(!source) {
        throw new Error("File(s) not found: " + filenames.join(", "));
    }

    return source;
};

var nodeRepl = function(opts) {
    var readline = require('readline'),
        path = require('path'),
        vm = require('vm'),
        prettyPrint = require('./prettyprint').prettyPrint;

    var stdout = process.stdout;
    var stdin = process.openStdin();
    var repl = readline.createInterface(stdin, stdout);

    var env = {};
    var sources = {};
    var aliases = {};
    var sandbox = getSandbox();

    // Prologue
    console.log("Roy: " + opts.info.description);
    console.log(opts.info.author);
    console.log(":? for help");

    var colorLog = function(color) {
        var args = [].slice.call(arguments, 1);

        if(opts.colorConsole) {
            args[0] = '\u001b[' + color + 'm' + args[0];
            args[args.length - 1] = args[args.length - 1] + '\u001b[0m';
        }

        console.log.apply(console, args);
    };

    // Include the standard library
    var fs = require('fs');
    var prelude = fs.readFileSync(path.dirname(__dirname) + '/lib/prelude.roy', 'utf8');
    vm.runInNewContext(compile(prelude, env, {}, {nodejs: true}).output, sandbox, 'eval');
    repl.setPrompt('roy> ');
    repl.on('close', function() {
        stdin.destroy();
    });
    repl.on('line', function(line) {
        var compiled;
        var output;

        var filename;
        var source;

        var tokens;
        var ast;

        // Check for a "metacommand"
        // e.g. ":q" or ":l test.roy"
        var metacommand = line.replace(/^\s+/, '').split(' ');
        try {
            switch(metacommand[0]) {
            case ":q":
                // Exit
                process.exit();
                break;
            case ":l":
                // Load
                filename = metacommand[1];
                source = getFileContents(filename);
                compiled = compile(source, env, aliases, {nodejs: true, filename: ".", run: true});
                break;
            case ":t":
                if(metacommand[1] in env) {
                    console.log(env[metacommand[1]].toString());
                } else {
                    colorLog(33, metacommand[1], "is not defined.");
                }
                break;
            case ":s":
                // Source
                if(sources[metacommand[1]]) {
                    colorLog(33, metacommand[1], "=", prettyPrint(sources[metacommand[1]]));
                } else {
                    if(metacommand[1]){
                        colorLog(33, metacommand[1], "is not defined.");
                    }else{
                        console.log("Usage :s command ");
                        console.log(":s [identifier] :: show original code about identifier.");
                    }
                }
                break;
            case ":?":
                // Help
                colorLog(32, "Commands available from the prompt");
                console.log(":l -- load and run an external file");
                console.log(":q -- exit REPL");
                console.log(":s -- show original code about identifier");
                console.log(":t -- show the type of the identifier");
                console.log(":? -- show help");
                break;
            default:
                // The line isn't a metacommand

                // Remember the source if it's a binding
                tokens = lexer.tokenise(line);
                ast = parser.parse(tokens);
                ast[0].accept({
                    visitLet: function(n) {
                        sources[n.name] = n.value;
                    }
                });

                // Just eval it
                compiled = compile(line, env, aliases, {nodejs: true, filename: ".", run: true});
                break;
            }

            if(compiled) {
                output = vm.runInNewContext(compiled.output, sandbox, 'eval');

                if(typeof output != 'undefined') {
                    colorLog(32, (typeof output == 'object' ? JSON.stringify(output) : output) + " : " + compiled.type);
                }
            }
        } catch(e) {
            colorLog(31, (e.stack || e.toString()));
        }
        repl.prompt();
    });
    repl.prompt();
};

var writeModule = function(env, exported, filename) {
    var fs = require('fs');

    var moduleOutput = _.map(exported, function(v, k) {
        if(v instanceof types.TagType) {
            return 'type ' + v.toString().replace(/#/g, '');
        }
        return k + ': ' + v.toString();
    }).join('\n') + '\n';
    fs.writeFile(filename, moduleOutput, 'utf8');
};

var importModule = function(name, env, opts) {
    var addTypesToEnv = function(moduleTypes) {
        _.each(moduleTypes, function(v, k) {
            var dataType = [new types.TagNameType(k)];
            _.each(function() {
                dataType.push(new types.Variable());
            });
            env[k] = new types.TagType(dataType);
        });
    };

    var moduleTypes;
    if(opts.nodejs) {
        // Need to convert to absolute paths for the CLI
        if(opts.run) {
            var path = require("path");
            name = path.resolve(path.dirname(opts.filename), name);
        }

        moduleTypes = loadModule(name, opts);
        addTypesToEnv(moduleTypes.types);
        var variable = name.substr(name.lastIndexOf("/") + 1);
        env[variable] = new types.Variable();
        var props = {};
        _.each(moduleTypes.env, function(v, k) {
            props[k] = nodeToType(v, env, {});
        });
        env[variable] = new types.ObjectType(props);

        console.log("Using sync CommonJS module:", name);

        return variable + " = require(" + JSON.stringify(name) + ")";
    } else {
        moduleTypes = loadModule(name, opts);
        addTypesToEnv(moduleTypes.types);
        _.each(moduleTypes.env, function(v, k) {
            env[k] = nodeToType(v, env, {});
        });

        if(console) console.log("Using browser module:", name);

        return "";
    }
};

var processFlags = function(argv, opts) {
    if(argv.length === 0) {
        nodeRepl(opts);
        return;
    }

    switch(argv[0]) {
    case "-v":
    case "--version":
        console.log("Roy: " + opts.info.description);
        console.log(opts.info.version);
        process.exit();
         break;
    case "-h":
    case "--help":
        console.log("Roy: " + opts.info.description + "\n");
        console.log("-b --browser   : wrap the output in a top level function");
        console.log("-c --color     : colorful REPL mode");
        console.log("-h --help      : show this help");
        console.log("-p             : run without prelude (standard library)");
        console.log("-r [file]      : run Roy-code without JavaScript output");
        console.log("-s --stdio     : read script from stdin and output to stdout");
        console.log("-v --version   : show current version");
        return;
    case "-s":
    case "--stdio":
        var source = '';
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', function(data) {
            source += data;
        });
        process.stdin.on('end', function() {
            console.log(compile(source, null, null, opts).output);
        });
        return;
    case "-p":
        opts.includePrelude = false;
        /* falls through */
    case "-r":
        opts.run = true;
        argv.shift();
        break;
    case "-b":
    case "--browser":
        opts.nodejs = false;
        argv.shift();
        break;
    case "-c":
    case "--color":
        opts.colorConsole = true;
        nodeRepl(opts);
        return;
    default:
        runRoy(argv, opts);
        return;
    }

    processFlags(argv, opts);
};

var runRoy = function(argv, opts) {
    var fs = require('fs');
    var path = require('path');
    var vm = require('vm');

    var extensions = /\.l?roy$/;
    var literateExtension = /\.lroy$/;

    var exported;
    var env = {};
    var aliases = {};
    var sandbox = getSandbox();

    if(opts.run) {
        // Include the standard library
        if(opts.includePrelude) {
            argv.unshift(path.dirname(__dirname) + '/lib/prelude.roy');
        }
    } else {
        var modules = [];
        if(!argv.length || argv[0] != 'lib/prelude.roy') {
            modules.push(path.dirname(__dirname) + '/lib/prelude');
        }
        _.each(modules, function(module) {
            var moduleTypes = loadModule(module, {filename: '.'});
            _.each(moduleTypes.env, function(v, k) {
                env[k] = new types.Variable();
                env[k] = nodeToType(v, env, aliases);
            });
        });
    }

    _.each(argv, function(filename) {
        // Read the file content.
        var source = getFileContents(filename);

        if(filename.match(literateExtension)) {
            // Strip out the Markdown.
            source = source.match(/^ {4,}.+$/mg).join('\n').replace(/^ {4}/gm, '');
        } else {
            console.assert(filename.match(extensions), 'Filename must end with ".roy" or ".lroy"');
        }

        exported = {};
        var outputPath = filename.replace(extensions, '.js');
        var SourceMapGenerator = require('source-map').SourceMapGenerator;
        var sourceMap = new SourceMapGenerator({file: path.basename(outputPath)});

        var compiled = compile(source, env, aliases, {
            nodejs: opts.nodejs,
            filename: filename,
            run: opts.run,
            exported: exported,
            sourceMap: sourceMap
        });
        if(opts.run) {
            // Execute the JavaScript output.
            output = vm.runInNewContext(compiled.output, sandbox, 'eval');
        } else {
            // Write the JavaScript output.
            fs.writeFile(outputPath, compiled.output + '//@ sourceMappingURL=' + path.basename(outputPath) + '.map\n', 'utf8');
            fs.writeFile(outputPath + '.map', sourceMap.toString(), 'utf8');
            writeModule(env, exported, filename.replace(extensions, '.roym'));
        }
    });
};

var main = function() {
    var argv = process.argv.slice(2);

    // Roy package information
    var fs = require('fs');
    var path = require('path');

    // Meta-commands configuration
    var opts = {
        colorConsole: false,
        info: JSON.parse(fs.readFileSync(path.dirname(__dirname) + '/package.json', 'utf8')),
        nodejs: true,
        run: false,
        includePrelude: true
    };

    processFlags(argv, opts);
};
exports.main = main;

if(exports && !module.parent) {
    main();
}



