var typecheck = require('./typeinference').typecheck,
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

var jsNodeIsExpression = function (node) {
    return !! (/Expression$/.test(node.type) || node.type === 'Identifier' || node.type === 'Literal');
};

var jsNodeIsStatement = function (node) {
    return !! (/Statement$/.test(node.type) || /Declaration$/.test(node.type));
};

var ensureJsASTStatement = function (node) {
    if (jsNodeIsExpression(node)) {
        return { type: "ExpressionStatement", expression: node };
    }
    return node;
};
var ensureJsASTStatements = function (nodes) {
    if (typeof nodes.length !== "undefined") {
        return _.map(
            _.filter(nodes, function (x) {
                // console.log("x:", x);
                // console.log("typeof x:", typeof x);
                return typeof x !== "undefined";
            }),
            ensureJsASTStatement
        );
    } else {
        throw new Error("ensureJsASTStatements wasn't given an Array, got " + nodes + " (" + typeof nodes + ")");
    }
};

// Separate end comments from other expressions
var splitComments = function(body) {
    return _.reduceRight(body, function(accum, node) {
        if(accum.length && node instanceof nodes.Comment) {
            if (! accum[0].comments) {
                accum[0].comments = [];
            }
            accum[0].comments.unshift(node);
            return accum;
        }
        accum.unshift(node);
        return accum;
    }, []);
};
// Ensure comments are attached to a statement where possible
var liftComments = function (jsAst) {
    var helper = function (node) {
        var result, i, comments = [];
        if (! (node && node.type)) {
            // Break out early when we're not looking at a proper node
            return [node, comments];
        }
        for (var key in node) if (node.hasOwnProperty(key)) {
            if (key === "leadingComments" && jsNodeIsExpression(node)) {
                // Lift comments from expressions
                comments = comments.concat(node[key]);
                delete node[key];
            } else if (node[key] && node[key].type) {
                // Recurse into child nodes...
                result = helper(node[key]);
                comments = comments.concat(result[1]);
            } else if (node[key] && node[key].length) {
                // ...and arrays of nodes
                for (i = 0; i < node[key].length; i += 1) {
                    result = helper(node[key][i]);
                    node[key][i] = result[0];
                    comments = comments.concat(result[1]);
                }
            }
        }
        if (jsNodeIsStatement(node) && comments.length) {
            // Attach lifted comments to statement nodes
            if (typeof node.leadingComments === "undefined") {
                node.leadingComments = [];
            }
            node.leadingComments = node.leadingComments.concat(comments);
            comments = [];
        }
        return [node, comments];
    };
    return helper(jsAst)[0];
};

var extraComments = [];

var compileNodeWithEnvToJsAST = function(n, env, opts) {
    if(!opts) opts = {};
    var compileNode = function(n) {
        return compileNodeWithEnvToJsAST(n, env);
    };
    var result = n.accept({
        // Top level file
        visitModule: function() {
            var nodes = _.map(splitComments(n.body), compileNode);
            return {
                type: "Program",
                body: ensureJsASTStatements(nodes)
            };
        },
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
            var exprsWithoutComments = _.map(splitComments(n.body), compileNode);
            exprsWithoutComments.push({
                type: "ReturnStatement",
                argument: exprsWithoutComments.pop()
            });
            body.body = ensureJsASTStatements(body.body.concat(exprsWithoutComments));
            var func = {
                type: "FunctionExpression",
                id: null,
                params: _.map(n.args, function (a) {
                    return {
                        type: "Identifier",
                        name: a.name
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
            var ifTrue = _.map(splitComments(n.ifTrue), compileNode);
            if (ifTrue.length) {
                ifTrue.push({
                    type: "ReturnStatement",
                    argument: ifTrue.pop()
                });
            }
            ifTrue = ensureJsASTStatements(ifTrue);

            var ifFalse = _.map(splitComments(n.ifFalse), compileNode);
            if (ifFalse.length) {
                ifFalse.push({
                    type: "ReturnStatement",
                    argument: ifFalse.pop()
                });
            }
            ifFalse = ensureJsASTStatements(ifFalse);

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
                kind: "var",
                declarations: [{
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: n.name
                    },
                    init: compileNode(n.value)
                }]
            };
        },
        visitInstance: function() {
            return {
                type: "VariableDeclaration",
                kind: "var",
                declarations: [{
                    type: "VariableDeclarator",
                    id: {
                        type: "Identifier",
                        name: n.name
                    },
                    init: compileNode(n.object)
                }]
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
        visitReturn: function() {
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
                        name: "return"
                    }
                },
                "arguments": [compileNode(n.value)]
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
                    body: {
                        type: "BlockStatement",
                        body: ensureJsASTStatements(body)
                    }
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
            var monadDecl = {
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
            };
            var body = {
                type: "BlockStatement",
                body: []
            };
            body.body = _.flatten([monadDecl, compiledInit, {
                type: "ReturnStatement",
                argument: compileNode(firstBind)
            }]);
            return {
                type: "CallExpression",
                "arguments": [],
                callee: {
                    type: "FunctionExpression",
                    id: null,
                    params: [],
                    body: body
                }
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
                body: ensureJsASTStatements(setters)
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
            valuePlaceholder = '__match';
            var flatMap = function(a, f) {
                return _.flatten(_.map(a, f));
            };

            var pathConditions = _.map(n.cases, function(c) {
                var getVars = function(pattern, varPath) {
                    var decls = flatMap(pattern.vars, function(a, i) {
                        var nextVarPath = varPath.slice();
                        nextVarPath.push(i);

                        return a.accept({
                            visitIdentifier: function() {

                                if(a.value == '_') return [];

                                var value = _.reduceRight(nextVarPath, function(structure, varPathName) {
                                    return {
                                        type: "MemberExpression",
                                        computed: false,
                                        object: structure,
                                        property: { type: "Identifier", name: "_" + varPathName }
                                    };
                                }, { type: "Identifier", name: valuePlaceholder });
                                return [{
                                    type: "VariableDeclarator",
                                    id: { type: "Identifier", name: a.value },
                                    init: value
                                }];
                            },
                            visitPattern: function() {
                                return getVars(a, nextVarPath).declarations;
                            }
                        });
                    });
                    if (decls.length) {
                        return {
                            type: "VariableDeclaration",
                            kind: "var",
                            declarations: decls
                        };
                    }
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
                var makeCondition = function (e) {
                    var pieces = _.reduceRight(e.path, function (structure, piece) {
                        return {
                            type: "MemberExpression",
                            computed: false,
                            object: structure,
                            property: { type: "Identifier", name: "_" + piece }
                        };
                    }, { type: "Identifier", name: valuePlaceholder });
                    return {
                        type: "BinaryExpression",
                        operator: "instanceof",
                        left: pieces,
                        right: { type: "Identifier", name: e.tag.value }
                    };
                };
                var extraConditions = null;
                if (tagPaths.length) {
                    var lastCondition = makeCondition(tagPaths.pop());
                    extraConditions = _.reduceRight(tagPaths, function(conditions, e) {
                        return {
                            type: "LogicalExpression",
                            operator: "&&",
                            left: e,
                            right: conditions
                        };
                    }, lastCondition);
                }

                // More specific patterns need to appear first
                // Need to sort by the length of the path
                var maxTagPath = _.max(tagPaths, function(t) {
                    return t.path.length;
                });
                var maxPath = maxTagPath ? maxTagPath.path : [];

                var body = [];
                if (vars) {
                    body.push(vars);
                }
                body.push({
                    type: "ReturnStatement",
                    argument: compileNode(c.value)
                });
                var test = {
                    type: "BinaryExpression",
                    operator: "instanceof",
                    left: { type: "Identifier", name: valuePlaceholder },
                    right: { type: "Identifier", name: c.pattern.tag.value }
                };
                if (extraConditions) {
                    test = {
                        type: "LogicalExpression",
                        operator: "&&",
                        left: test,
                        right: extraConditions
                    };
                }
                return {
                    path: maxPath,
                    condition: {
                        type: "IfStatement",
                        test: test,
                        consequent: {
                            type: "BlockStatement",
                            body: ensureJsASTStatements(body)
                        },
                        alternate: null
                    }
                };
            });

            var cases = _.map(_.sortBy(pathConditions, function(t) {
                return -t.path.length;
            }), function(e) {
                return e.condition;
            });

            return {
                type: "CallExpression",
                "arguments": [compileNode(n.value)],
                callee: {
                    type: "FunctionExpression",
                    id: null,
                    params: [{ type: "Identifier", name: valuePlaceholder }],
                    body: {
                        type: "BlockStatement",
                        body: ensureJsASTStatements(cases)
                    }
                }
            };
        },
        // Call to JavaScript call.
        visitCall: function() {
            var args = _.map(n.args, compileNode);
            if (n.typeClassInstance) {
                args.unshift({
                    type: "Identifier",
                    name: n.typeClassInstance
                });
            }

            return {
                type: "CallExpression",
                "arguments": args,
                callee: compileNode(n.func)
            };
            // if(n.func.value == 'import') {
            //     return importModule(JSON.parse(n.args[0].value), env, opts);
            // }
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
            return {
                type: "UnaryExpression",
                operator: n.name,
                argument: compileNode(n.value)
            };
        },
        visitBinaryGenericOperator: function() {
            return {
                type: "BinaryExpression",
                operator: n.name,
                left: compileNode(n.left),
                right: compileNode(n.right)
            };
        },
        visitBinaryNumberOperator: function() {
            return {
                type: "BinaryExpression",
                operator: n.name,
                left: compileNode(n.left),
                right: compileNode(n.right)
            };
        },
        visitBinaryBooleanOperator: function() {
            return {
                type: "BinaryExpression",
                operator: n.name,
                left: compileNode(n.left),
                right: compileNode(n.right)
            };
        },
        visitBinaryStringOperator: function() {
            return {
                type: "BinaryExpression",
                operator: n.name,
                left: compileNode(n.left),
                right: compileNode(n.right)
            };
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
            funcBody.push({
                type: "ReturnStatement",
                argument: { type: "Identifier", name: "__o__" }
            });

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
                    body: { type: "BlockStatement", body: ensureJsASTStatement(funcBody) }
                }
            };
        },
        // Print all other nodes directly.
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
            var cleanedKey, key, pairs = [];

            for(key in n.values) {
                if (key[0] === "'" || key[0] === '"') {
                    cleanedKey = String.prototype.slice.call(key, 1, key.length-1);
                } else {
                    cleanedKey = key;
                }
                pairs.push({
                    type: "Property",
                    key: {
                        type: "Literal",
                        value: cleanedKey
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
    if (typeof result === "undefined"){
        if (n.comments && n.comments.length) {
            extraComments = extraComments.concat(n.comments);
        }
    } else {
        if (extraComments && extraComments.length) {
            if (! (n.comments && n.comments.length)) {
                n.comments = extraComments;
            } else {
                n.comments = extraComments.concat(n.comments);
            }
            extraComments = [];
        }
        result.leadingComments = _.map(n.comments, function (c) {
            var lines = c.value.split(/\r\n|\r|\n/g);
            return {
                type: lines.length > 1 ? "Block" : "Line",
                value: c.value
            };
        });
    }
    return result;
};
exports.compileNodeWithEnvToJsAST = compileNodeWithEnvToJsAST;
var compileNodeWithEnv = function (n, env, opts) {
    var ast = compileNodeWithEnvToJsAST(n, env, opts);
    if (typeof ast === "string") {
//        console.warn("Got AST already transformed into string: ", ast);
        return ast;
    } else if (typeof ast === "undefined") {
        return "";
    } else {
        ast = liftComments(ast);
        var generated = escodegen.generate(ensureJsASTStatement(ast), {comment: true});
        return generated;
    }
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

    // Typecheck the AST. Any type errors will throw an exception.
    var resultType = typecheck(ast.body, env, aliases);

    // Export types
    ast.body = _.map(ast.body, function(n) {
        if(n instanceof nodes.Call && n.func.value == 'export') {
            return exportType(n.args[0], env, opts.exported, opts.nodejs);
        }
        return n;
    });

    var jsAst = liftComments(compileNodeWithEnvToJsAST(ast, env, opts));
    if (!opts.nodejs) {
        jsAst.body = [{
            type: "ExpressionStatement",
            expression: {
                type: "CallExpression",
                'arguments': [],
                callee: {
                    type: "FunctionExpression",
                    id: null,
                    params: [],
                    body: {
                        type: "BlockStatement",
                        body: jsAst.body
                    }
                }
            }
        }];
    }

    if (opts.strict) {
        jsAst.body.unshift({
            type: "ExpressionStatement",
            expression: {
                type: "Literal",
                value: "use strict"
            }
        });
    }

    return {
        type: resultType,
        output: escodegen.generate(
            ensureJsASTStatement(jsAst),
            {
                comment: true
            }
        )
    };
};
exports.compile = compile;
