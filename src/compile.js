var typecheck = require('./typeinference').typecheck,
    loadModule = require('./modules').loadModule,
    exportType = require('./modules').exportType,
    types = require('./types'),
    nodeToType = require('./typeinference').nodeToType,
    nodes = require('./nodes'),
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

function isExpression(node) {
    return (/Expression$/).test(node.type) || node.type == 'Identifier' || node.type == 'Literal';
}

function isStatement(node) {
    return (/Statement$/).test(node.type) || /Declaration$/.test(node.type);
}

function flatMap(a, f) {
    return _.flatten(_.map(a, f));
}

function ensureStatement(node) {
    if(isExpression(node)) {
        return {
            type: "ExpressionStatement",
            expression: node
        };
    }
    return node;
}

function ensureStatements(nodes) {
    // Some nodes have multiple statements, anything that emits
    // multiple statements should be flattened with its context.
    function flattenBlocks(node) {
        if(node.type == "BlockStatement") {
            return node.body;
        }
        return [node];
    }

    return flatMap(_.filter(nodes, _.identity), _.compose(flattenBlocks, ensureStatement));
}

// Separate end comments from other expressions
function splitComments(body) {
    return _.reduceRight(body, function(accum, node) {
        if(accum.length && node instanceof nodes.Comment) {
            if(!accum[0].comments) {
                accum[0].comments = [];
            }
            accum[0].comments.unshift(node);
            return accum;
        }
        accum.unshift(node);
        return accum;
    }, []);
}

// Ensure comments are attached to a statement where possible
function liftComments(jsNode) {
    var helper = function (node) {
        var comments = [],
            result,
            key,
            i;

        if(!(node && node.type)) {
            // Break out early when we're not looking at a proper node
            return [node, comments];
        }

        for(key in node) if(node.hasOwnProperty(key)) {
            if(key == "leadingComments" && isExpression(node)) {
                // Lift comments from expressions
                comments = comments.concat(node[key]);
                delete node[key];
            } else if(node[key] && node[key].type) {
                // Recurse into child nodes...
                result = helper(node[key]);
                comments = comments.concat(result[1]);
            } else if(node[key] && node[key].length) {
                // ...and arrays of nodes
                for(i = 0; i < node[key].length; i += 1) {
                    result = helper(node[key][i]);
                    node[key][i] = result[0];
                    comments = comments.concat(result[1]);
                }
            }
        }

        if(isStatement(node) && comments.length) {
            // Attach lifted comments to statement nodes
            if(typeof node.leadingComments == "undefined") {
                node.leadingComments = [];
            }
            node.leadingComments = node.leadingComments.concat(comments);
            comments = [];
        }

        return [node, comments];
    };
    return helper(jsNode)[0];
}

function blockToExpression(nodes) {
    if(nodes.length == 1) {
        return nodes[0];
    }

    return {
        type: "CallExpression",
        'arguments': [],
        callee: {
            type: "FunctionExpression",
            id: null,
            params: [],
            body: {
                type: "BlockStatement",
                body: ensureStatements(nodes).slice(0, nodes.length - 1).concat([{
                    type: "ReturnStatement",
                    argument: nodes[nodes.length - 1]
                }])
            }
        }
    };
}

var extraComments = [];

function compileNode(n) {
    var result = n.accept({
        visitModule: function() {
            var nodes = _.map(splitComments(n.body), compileNode);
            return {
                type: "Program",
                body: ensureStatements(nodes)
            };
        },
        visitFunction: function() {
            var exprsWithoutComments = _.map(splitComments(n.value), compileNode),
                body = _.map(n.whereDecls, function(w) {
                    return compileNode(w);
                });

            exprsWithoutComments[exprsWithoutComments.length - 1] = {
                type: "ReturnStatement",
                argument: exprsWithoutComments[exprsWithoutComments.length - 1]
            };

            return {
                type: "FunctionExpression",
                id: null,
                params: _.map(n.args, function(a) {
                    return {
                        type: "Identifier",
                        name: a.name
                    };
                }),
                body: {
                    type: "BlockStatement",
                    body: ensureStatements(body.concat(exprsWithoutComments))
                }
            };
        },
        visitIfThenElse: function() {
            return {
                type: "ConditionalExpression",
                test: compileNode(n.condition),
                consequent: blockToExpression(_.map(splitComments(n.ifTrue), compileNode)),
                alternate: blockToExpression(_.map(splitComments(n.ifFalse), compileNode))
            };
        },
        visitLet: function() {
            return {
                type: "BlockStatement",
                body: [{
                    type: "VariableDeclaration",
                    kind: "var",
                    declarations: [{
                        type: "VariableDeclarator",
                        id: {
                            type: "Identifier",
                            name: n.name
                        },
                        init: blockToExpression(_.map(n.value, compileNode))
                    }]
                }].concat(ensureStatements(_.map(n.body, compileNode)))
            };
        },
        visitTypeClass: function() {
            return {
                type: "BlockStatement",
                body: ensureStatements(_.map(n.body, compileNode))
            };
        },
        visitInstance: function() {
            return {
                type: "BlockStatement",
                body: [{
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
                }].concat(ensureStatements(_.map(n.body, compileNode)))
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
            function compileTag(tag) {
                var tagName = {
                    type: "Identifier",
                    name: tag.name
                };
                var args = _.map(tag.vars, function(v, i) {
                    return {
                        type: "Identifier",
                        name: v.value + "_" + i
                    };
                });
                var setters = _.map(args, function(v, i) {
                    // "this._" + i + " = " + v;
                    return {
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
                    body: ensureStatements(setters)
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
            }

            return {
                type: "BlockStatement",
                body: [{
                    type: "VariableDeclaration",
                    kind: "var",
                    declarations: _.map(n.tags, compileTag)
                }].concat(ensureStatements(_.map(n.body, compileNode)))
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
                        body: ensureStatements(body)
                    }
                }]
            };
        },
        visitDo: function() {
            throw new Error("TODO: Compile do notation");
        },
        visitMatch: function() {
            var valuePlaceholder = '__match';
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
                    if(decls.length) {
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
                var makeCondition = function(e) {
                    var pieces = _.reduceRight(e.path, function(structure, piece) {
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
                if(tagPaths.length) {
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
                var maxPath = maxTagPath != -Infinity ? maxTagPath.path : [];

                var body = [];
                if(vars) {
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
                if(extraConditions) {
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
                            body: ensureStatements(body)
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
                        body: ensureStatements(cases)
                    }
                }
            };
        },
        visitCall: function() {
            var args = _.map(n.args, compileNode);
            return {
                type: "CallExpression",
                "arguments": args,
                callee: compileNode(n.func)
            };
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
            var funcBody = [];

            function copyLoop(varName) {
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
            }

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
                    body: {
                        type: "BlockStatement",
                        body: ensureStatement(funcBody)
                    }
                }
            };
        },

        // Print all other nodes directly.
        visitIdentifier: function() {
            var identifier = {
                type: "Identifier",
                name: n.value
            };

            if(n.attribute.witness) {
                return {
                    type: "MemberExpression",
                    object: {
                        type: "Identifier",
                        name: n.attribute.witness
                    },
                    property: identifier
                };
            }
            return identifier;
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
                value: n.value == "true"
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
            var pairs = [],
                cleanedKey,
                key;

            for(key in n.values) {
                // TODO: Urgh, not properly handling strings.
                if(key[0] == "'" || key[0] == '"') {
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

    if(typeof result == "undefined"){
        if(n.comments && n.comments.length) {
            extraComments = extraComments.concat(n.comments);
        }
    } else {
        if(extraComments && extraComments.length) {
            if(!(n.comments && n.comments.length)) {
                n.comments = extraComments;
            } else {
                n.comments = extraComments.concat(n.comments);
            }
            extraComments = [];
        }
        result.leadingComments = _.map(n.comments, function(c) {
            var lines = c.value.split(/\r\n|\r|\n/g);
            return {
                type: lines.length > 1 ? "Block" : "Line",
                value: c.value
            };
        });
    }

    return result;
}
exports.compileNode = compileNode;

function compile(source, opts) {
    var tokens = lexer.tokenise(source),
        untypedNode = parser.parse(tokens),
        typedNode = typecheck(untypedNode),
        jsNode;

    if(!opts) opts = {};

    if(!opts.exported) opts.exported = {};

    // Export types
    // TODO: Fix exporting
    /*typedNode.body = _.map(royNode.body, function(n) {
        if(n instanceof nodes.Call && n.func.value == 'export') {
            return exportType(n.args[0], {}, opts.exported, opts.nodejs);
        }
        return n;
    });*/

    jsNode = liftComments(compileNode(typedNode));
    if(!opts.nodejs) {
        jsNode.body = [{
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
                        body: jsNode.body
                    }
                }
            }
        }];
    }

    if(opts.strict) {
        jsNode.body.unshift({
            type: "ExpressionStatement",
            expression: {
                type: "Literal",
                value: "use strict"
            }
        });
    }

    return {
        type: typedNode.attribute.type,
        output: escodegen.generate(jsNode, {
            comment: true
        })
    };
}
exports.compile = compile;
