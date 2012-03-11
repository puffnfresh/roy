// ## Algorithm W (Damas-Hindley-Milner)
//
// This is based on Robert Smallshire's [Python code](http://bit.ly/bbVmmX).
// Which is based on Andrew's [Scala code](http://bit.ly/aztXwD). Which is based
// on Nikita Borisov's [Perl code](http://bit.ly/myq3uA). Which is based on Luca
// Cardelli's [Modula-2 code](http://bit.ly/Hjpvb). Wow.

// Type variable and built-in types are defined in the `types` module.
var t = require('./types'),
    n = require('./nodes').nodes,
    _ = require('underscore');

// ### Unification
//
// This is the process of finding a type that satisfies some given constraints.
// In this system, unification will try to satisfy that either:
//
// 1. `t1` and `t2` are equal type variables
// 2. `t1` and `t2` are equal types
//
// In case #1, if `t1` is a type variable and `t2` is not currently equal,
// unification will set `t1` to have an instance of `t2`. When `t1` is pruned,
// it will unchain to a type without an instance.
//
// In case #2, do a deep unification on the type, using recursion.
//
// If neither constraint can be met, the process will throw an error message.
var unify = function(t1, t2) {
    var alias = t1.aliased || t2.aliased;
    var i;
    t1 = prune(t1);
    t2 = prune(t2);
    if(t1 instanceof t.Variable) {
        if(t1 != t2) {
            if(occursInType(t1, t2)) {
                throw "Recursive unification";
            }
            t1.instance = t2;
        }
    } else if(t1 instanceof t.BaseType && t2 instanceof t.Variable) {
        unify(t2, t1);
    } else if(t1 instanceof t.NativeType || t2 instanceof t.NativeType) {
        // do nothing.
        // coercing Native to any type.
    } else if(t1 instanceof t.BaseType && t2 instanceof t.BaseType) {
        var t1str = t1.aliased || t1.toString();
        var t2str = t2.aliased || t2.toString();
        if(t1.name != t2.name || t1.types.length != t2.types.length) {
            throw new Error("Type error: " + t1str + " is not " + t2str);
        }
        if(t1 instanceof t.ObjectType) {
            for(i in t2.props) {
                if(!(i in t1.props)) {
                    throw new Error("Type error: " + t1str + " is not " + t2str);
                }
                unify(t1.props[i], t2.props[i]);
            }
        }
        for(i = 0; i < Math.min(t1.types.length, t2.types.length); i++) {
            unify(t1.types[i], t2.types[i]);
        }
        if(alias) t1.aliased = t2.aliased = alias;
    } else {
        throw new Error("Not unified: " + t1 + ", " + t2);
    }
};

// ### Prune
//
// This will unchain variables until it gets to a type or variable without an
// instance. See `unify` for some details about type variable instances.
var prune = function(type) {
    if(type instanceof t.Variable && type.instance) {
        type.instance = prune(type.instance);
        return type.instance;
    }
    return type;
};

// ### Fresh type
//
// Getting a "fresh" type will create a recursive copy. When a generic type
// variable is encountered, a new variable is generated and substituted in.
//
// A fresh type is only returned when an identifier is found during analysis.
// See `analyse` for some context.
var fresh = function(type, nonGeneric, mappings) {
    if(!mappings) mappings = {};

    type = prune(type);
    if(type instanceof t.Variable) {
        if(occursInTypeArray(type, nonGeneric)) {
            return type;
        } else {
            if(!mappings[type.id]) {
                mappings[type.id] = new t.Variable();
            }
            return mappings[type.id];
        }
    }

    var freshed = new type.constructor(type.map(function(type) {
        return fresh(type, nonGeneric, mappings);
    }));
    if(type.aliased) freshed.aliased = type.aliased;
    return freshed;
};

// ### Occurs check
//
// These functions check whether the type `t2` is equal to or contained within
// the type `t1`. Used for checking recursive definitions in `unify` and
// checking if a variable is non-generic in `fresh`.
var occursInType = function(t1, t2) {
    t2 = prune(t2);
    if(t2 == t1) {
        return true;
    } else if(t2 instanceof t.ObjectType) {
        var types = [];
        for(var prop in t2.props) {
            types.push(t2.props[prop]);
        }
        return occursInTypeArray(t1, types);
    } else if(t2 instanceof t.BaseType) {
        return occursInTypeArray(t1, t2.types);
    }
    return false;
};

var occursInTypeArray = function(t1, types) {
    return _.map(types, function(t2) {
        return occursInType(t1, t2);
    }).indexOf(true) >= 0;
};

// ### Helper functions for function definitions
// 
// recursively process where declarations.
var analyseFunction = function(functionDecl, funcType, env, nonGeneric, data, aliases) {
    var types = [];
    var newEnv = _.clone(env);

    var argNames = {};
    _.each(functionDecl.args, function(arg, i) {
        if(argNames[arg.name]) {
            throw new Error("Repeated function argument '" + arg.name + "'");
        }

        var argType;
        if(arg.type) {
            argType = nodeToType(arg.type, env, aliases);
        } else {
            argType = funcType.types[i];
        }
        newEnv[arg.name] = argType;
        argNames[arg.name] = argType;
        types.push(argType);
    });

    var newData = _.clone(data);

    analyseWhereDataDecls(functionDecl.whereDecls, newEnv, nonGeneric, newData, aliases);

    var whereFunctionTypeMap =
        analyseWhereFunctions(functionDecl.whereDecls, newEnv, nonGeneric, newData, aliases);

    for(var name in whereFunctionTypeMap) {
        newEnv[name] = whereFunctionTypeMap[name];
    }

    var scopeTypes = _.map(withoutComments(functionDecl.body), function(expression) {
        return analyse(expression, newEnv, nonGeneric, newData, aliases);
    });

    var resultType = scopeTypes[scopeTypes.length - 1];
    types.push(resultType);

    var annotationType;
    if(functionDecl.type) {
        annotationType = nodeToType(functionDecl.type, env, aliases);
        unify(resultType, annotationType);
    }

    return new t.FunctionType(types);
};
var analyseWhereFunctions = function(whereDecls, env, nonGeneric, data, aliases) {
    var newNonGeneric = nonGeneric.slice();

    var newEnv = _.clone(env);

    var functionDecls = _.filter(whereDecls, function(whereDecl) {
        return whereDecl instanceof n.Function;
    });

    _.each(functionDecls, function(functionDecl) {
        var funcTypeAndNonGenerics = createTemporaryFunctionType(functionDecl);
        var funcType = funcTypeAndNonGenerics[0];

        newNonGeneric = newNonGeneric.concat(funcTypeAndNonGenerics[1]);

        newEnv[functionDecl.name] = funcType;
    });

    var functionTypes = {};
    _.each(functionDecls, function(functionDecl) {
        var functionType = newEnv[functionDecl.name];

        functionTypes[functionDecl.name] =
            analyseFunction(functionDecl, functionType, newEnv, newNonGeneric, data, aliases);
    });

    return functionTypes;
};
var createTemporaryFunctionType = function(node) {
    var nonGeneric = [];

    var tempTypes = _.map(node.args, function(arg) {
        var typeVar = new t.Variable();

        if (!arg.type) {
            nonGeneric.push(typeVar);
        }

        return typeVar;
    });

    tempTypes.push(new t.Variable());

    return [new t.FunctionType(tempTypes), nonGeneric];
};
var analyseWhereDataDecls = function(whereDecls, env, nonGeneric, data, aliases) {
    var dataDecls = _.filter(whereDecls, function(whereDecl) {
        return whereDecl instanceof n.Data;
    });

    _.each(dataDecls, function(dataDecl) {
        var nameType = new t.TagNameType(dataDecl.name);
        var types = [nameType];

        if(env[dataDecl.name]) {
            throw new Error("Multiple declarations of type constructor: " + dataDecl.name);
        }

        var argNames = {};
        var argEnv = _.clone(env);
        _.each(dataDecl.args, function(arg) {
            if(argNames[arg.name]) {
                throw new Error("Repeated type variable '" + arg.name + "'");
            }

            var argType;
            if(arg.type) {
                argType = nodeToType(arg, argEnv, aliases);
            } else {
                argType = new t.Variable();
            }
            argEnv[arg.name] = argType;
            argNames[arg.name] = argType;
            types.push(argType);
        });

        env[dataDecl.name] = new t.TagType(types);
    });

    _.each(dataDecls, function(dataDecl) {
        var type = env[dataDecl.name];
        var newEnv = _.clone(env);

        _.each(dataDecl.args, function(arg, i) {
            var argType = type.types[i + 1];
            newEnv[arg.name] = argType;
        });

        _.each(dataDecl.tags, function(tag) {
            if(env[tag.name]) {
                throw new Error("Multiple declarations for data constructor: " + tag.name);
            }

            var tagTypes = [];
            _.each(tag.vars, function(v, i) {
                tagTypes[i] = nodeToType(v, newEnv, aliases);
            });
            tagTypes.push(type);
            env[tag.name] = new t.FunctionType(tagTypes);
        });
    });
};

// Want to skip typing of comments in bodies
var withoutComments = function(xs) {
    return _.filter(xs, function(x) {
        return !(x instanceof n.Comment);
    });
};

// ### Type analysis
//
// `analyse` is the core inference function. It takes an AST node and returns
// the infered type.
var analyse = function(node, env, nonGeneric, data, aliases) {
    if(!nonGeneric) nonGeneric = [];

    return node.accept({
        // #### Function definition
        //
        // Assigns a type variable to each typeless argument and return type.
        //
        // Each typeless argument also gets added to the non-generic scope
        // array. The `fresh` function can then return the existing type from
        // the scope.
        //
        // Assigns the function's type in the environment and returns it.
        //
        // We create temporary types for recursive definitions.
        visitFunction: function() {
            var newNonGeneric = nonGeneric.slice();

            var newEnv = _.clone(env);

            var funcTypeAndNonGenerics = createTemporaryFunctionType(node);
            var funcType = funcTypeAndNonGenerics[0];

            newNonGeneric = newNonGeneric.concat(funcTypeAndNonGenerics[1]);

            if (node.name) {
                newEnv[node.name] = funcType;
            }

            var functionType = analyseFunction(node, funcType, newEnv, newNonGeneric, data, aliases);

            if(node.name) {
                env[node.name] = functionType;
            }

            return functionType;
        },
        visitIfThenElse: function() {
            var ifTrueScopeTypes = _.map(withoutComments(node.ifTrue), function(expression) {
                return analyse(expression, env, nonGeneric, data, aliases);
            });
            var ifTrueType = ifTrueScopeTypes[ifTrueScopeTypes.length - 1];

            var ifFalseScopeTypes = _.map(withoutComments(node.ifFalse), function(expression) {
                return analyse(expression, env, nonGeneric, data, aliases);
            });
            var ifFalseType = ifFalseScopeTypes[ifFalseScopeTypes.length - 1];

            unify(ifTrueType, ifFalseType);

            return ifTrueType;
        },
        // #### Function call
        //
        // Ensures that all argument types `unify` with the defined function and
        // returns the function's result type.
        visitCall: function() {
            var types = _.map(node.args, function(arg) {
                return analyse(arg, env, nonGeneric, data, aliases);
            });

            var funType = analyse(node.func, env, nonGeneric, data, aliases);
            if(prune(funType) instanceof t.NativeType) {
                return new t.NativeType();
            }

            if(prune(funType) instanceof t.TagType) {
                var mappings = {};
                var tagType = fresh(env[node.func.value], nonGeneric, mappings);

                _.each(tagType, function(x, i) {
                    if(!types[i]) throw new Error("Not enough arguments to " + node.func.value);

                    var index = tagType.types.indexOf(x);
                    if(index != -1) {
                        unify(funType.types[index], types[i]);
                    }
                    unify(x, types[i]);
                });

                return funType;
            }

            var resultType = new t.Variable();
            types.push(resultType);
            unify(new t.FunctionType(types), funType);

            return resultType;
        },
        // #### Let binding
        //
        // Infer the value's type, assigns it in the environment and returns it.
        visitLet: function() {
            var valueType = analyse(node.value, env, nonGeneric, data, aliases);

            var annotationType;
            if(node.type) {
                annotationType = nodeToType(node.type, env, aliases);
                if(prune(valueType) instanceof t.NativeType) {
                    valueType = annotationType;
                } else {
                    unify(valueType, annotationType);
                }
            }

            env[node.name] = valueType;

            return valueType;
        },
        visitAssignment: function() {
            var valueType = analyse(node.value, env, nonGeneric, data, aliases);

            if(env[node.name]) {
                if(prune(valueType) instanceof t.NativeType) {
                    return env[node.name];
                } else {
                    unify(valueType, env[node.name]);
                }
            } else {
                env[node.name] = valueType;
            }

            return valueType;
        },
        visitExpression: function() {
            return analyse(node.value, env, nonGeneric, data, aliases);
        },
        visitDo: function() {
            // TODO: Make cleaner
            return env[node.value.value].props['return'].types[1];
        },
        visitPropertyAccess: function() {
            var valueType = analyse(node.value, env, nonGeneric, data, aliases);

            if(prune(valueType) instanceof t.NativeType) {
                return new t.NativeType();
            }

            // TODO: Properly generate property constraints
            if(valueType instanceof t.ObjectType) {
                if(!valueType.props[node.property]) {
                    valueType.props[node.property] = new t.Variable();
                }
            } else {
                var propObj = {};
                propObj[node.property] = new t.Variable();
                unify(valueType, new t.ObjectType(propObj));
            }

            return prune(valueType).getPropertyType(node.property);
        },
        visitAccess: function() {
            var valueType = analyse(node.value, env, nonGeneric, data, aliases);

            if(prune(valueType) instanceof t.NativeType) {
                return new t.NativeType();
            }

            unify(valueType, new t.ArrayType(new t.Variable()));

            var accessType = analyse(node.property, env, nonGeneric, data, aliases);
            unify(accessType, new t.NumberType());
            return prune(valueType).type;
        },
        visitBinaryGenericOperator: function() {
            var leftType = analyse(node.left, env, nonGeneric, data, aliases);
            var rightType = analyse(node.right, env, nonGeneric, data, aliases);
            unify(leftType, rightType);

            return new t.BooleanType();
        },
        visitBinaryNumberOperator: function() {
            var resultType = new t.NumberType();
            var leftType = analyse(node.left, env, nonGeneric, data, aliases);
            var rightType = analyse(node.right, env, nonGeneric, data, aliases);
            unify(leftType, resultType);
            unify(rightType, resultType);

            return resultType;
        },
        visitBinaryBooleanOperator: function() {
            var resultType = new t.BooleanType();
            var leftType = analyse(node.left, env, nonGeneric, data, aliases);
            var rightType = analyse(node.right, env, nonGeneric, data, aliases);
            unify(leftType, resultType);
            unify(rightType, resultType);

            return resultType;
        },
        visitBinaryStringOperator: function() {
            var resultType = new t.StringType();
            var leftType = analyse(node.left, env, nonGeneric, data, aliases);
            var rightType = analyse(node.right, env, nonGeneric, data, aliases);
            unify(leftType, resultType);
            unify(rightType, resultType);

            return resultType;
        },
        visitWith: function() {
            var leftType = analyse(node.left, env, nonGeneric, data, aliases);
            var rightType = analyse(node.right, env, nonGeneric, data, aliases);
            var combinedTypes = {};

            var emptyObjectType = new t.ObjectType({});
            unify(leftType, emptyObjectType);
            unify(rightType, emptyObjectType);

            var name;
            for(name in leftType.props) {
                combinedTypes[name] = leftType.props[name];
            }
            for(name in rightType.props) {
                combinedTypes[name] = rightType.props[name];
            }

            return new t.ObjectType(combinedTypes);
        },
        visitData: function() {
            analyseWhereDataDecls([node], env, nonGeneric, data, aliases);

            return new t.NativeType();
        },
        visitMatch: function() {
            var resultType = new t.Variable();
            var value = analyse(node.value, env, nonGeneric, data, aliases);

            var newEnv = _.clone(env);

            _.each(node.cases, function(nodeCase) {
                var newNonGeneric = nonGeneric.slice();

                var tagType = newEnv[nodeCase.pattern.tag.value];
                if(!tagType) {
                    throw new Error("Couldn't find the tag: " + nodeCase.pattern.tag.value);
                }
                unify(value, fresh(_.last(prune(tagType).types), newNonGeneric));

                var argNames = {};
                var addVarsToEnv = function(p, lastPath) {
                    _.each(p.vars, function(v, i) {
                        var index = tagType.types.indexOf(env[p.tag.value][i]);
                        var path = lastPath.slice();
                        path.push(index);

                        var currentValue = value;
                        for(var x = 0; x < path.length && path[x] != -1; x++) {
                            currentValue = prune(currentValue).types[path[x]];
                        }

                        v.accept({
                            visitIdentifier: function() {
                                if(v.value == '_') return;

                                if(argNames[v.value]) {
                                    throw new Error('Repeated variable "' + v.value + '" in pattern');
                                }

                                newEnv[v.value] = env[p.tag.value][i];
                                newNonGeneric.push(currentValue);
                                argNames[v.value] = newEnv[v.value];
                            },
                            visitPattern: function() {
                                var resultType = fresh(_.last(prune(newEnv[v.tag.value]).types), newNonGeneric);
                                unify(currentValue, resultType);

                                addVarsToEnv(v, path);
                            }
                        });
                    });
                };
                addVarsToEnv(nodeCase.pattern, []);

                var caseType = analyse(nodeCase.value, newEnv, newNonGeneric, data, aliases);
                if(caseType instanceof t.FunctionType && caseType.types.length == 1) {
                    // For tags that don't have arguments
                    unify(resultType, _.last(caseType.types));
                } else {
                    unify(resultType, caseType);
                }
            });
            return resultType;
        },
        // Type alias
        visitType: function() {
            aliases[node.name] = nodeToType(node.value, env, aliases);
            aliases[node.name].aliased = node.name;
            return new t.NativeType();
        },
        // #### Identifier
        //
        // Creates a `fresh` copy of a type if the name is found in an
        // environment, otherwise throws an error.
        visitIdentifier: function() {
            var name = node.value;
            if(!env[name]) {
                return new t.NativeType();
            }
            return fresh(env[name], nonGeneric);
        },
        // #### Primitive type
        visitNumber: function() {
            return new t.NumberType();
        },
        visitString: function() {
            return new t.StringType();
        },
        visitBoolean: function() {
            return new t.BooleanType();
        },
        visitArray: function() {
            var valueType = new t.Variable();
            _.each(node.values, function(v) {
                unify(valueType, analyse(v, env, nonGeneric, data, aliases));
            });
            return new t.ArrayType(valueType);
        },
        visitTuple: function() {
            var propTypes = {};
            _.each(node.values, function(v, i) {
                propTypes[i] = analyse(v, env, nonGeneric, data, aliases);
            });
            return new t.ObjectType(propTypes);
        },
        visitObject: function() {
            var propTypes = {};
            var prop;
            for(prop in node.values) {
                propTypes[prop] = analyse(node.values[prop], env, nonGeneric, data, aliases);
            }
            return new t.ObjectType(propTypes);
        }
    });
};

// Converts an AST node to type system type.
var nodeToType = function(n, env, aliases) {
    return n.accept({
        visitGeneric: function(g) {
            return new t.Variable(g.value);
        },
        visitTypeFunction: function(tf) {
            return new t.FunctionType(_.map(tf.args, function(v) {
                return nodeToType(v, env, aliases);
            }));
        },
        visitTypeArray: function(ta) {
            return new t.ArrayType(nodeToType(ta.value, env, aliases));
        },
        visitTypeName: function(tn) {
            if(tn.value in aliases) {
                return aliases[tn.value];
            }

            if(!tn.args.length) {
                switch(tn.value) {
                case 'Number':
                    return new t.NumberType();
                case 'String':
                    return new t.StringType();
                case 'Boolean':
                    return new t.BooleanType();
                }
            }

            var envType = env[tn.value];
            if(envType) {
                if(prune(envType) instanceof t.Variable) {
                    return envType;
                }

                if(tn.args.length != envType.types.length - 1) {
                    throw new Error("Type arg lengths differ: '" + tn.value + "' given " + tn.args.length + " but should be " + (envType.types.length - 1));
                }

                envType = fresh(prune(envType));
                _.forEach(tn.args, function(v, k) {
                    var argType = nodeToType(v, env, aliases);
                    unify(envType.types[1 + k], argType);
                });
                return envType;
            }

            throw new Error("Can't convert from explicit type: " + JSON.stringify(tn));
        },
        visitTypeObject: function(to) {
            var types = {};
            _.forEach(to.values, function(v, k) {
                types[k] = nodeToType(v, env, aliases);
            });
            return new t.ObjectType(types);
        }
    });
};
exports.nodeToType = nodeToType;

// Run inference on an array of AST nodes.
var typecheck = function(ast, env, data, aliases) {
    var types = _.map(ast, function(node) {
        return analyse(node, env, [], data, aliases);
    });
    return types && types[0];
};
exports.typecheck = typecheck;
