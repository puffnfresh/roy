// ## Algorithm W (Damas-Hindley-Milner)
//
// This is based on Robert Smallshire's [Python code](http://bit.ly/bbVmmX).
// Which is based on Andrew's [Scala code](http://bit.ly/aztXwD). Which is based
// on Nikita Borisov's [Perl code](http://bit.ly/myq3uA). Which is based on Luca
// Cardelli's [Modula-2 code](http://bit.ly/Hjpvb). Wow.

// Type variable and built-in types are defined in the `types` module.
var t = require('./types'),
    n = require('./nodes').nodes,
    _ = require('underscore'),
    getFreeVariables = require('./freeVariables').getFreeVariables,
    stronglyConnectedComponents = require('./tarjan').stronglyConnectedComponents;

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
var unify = function(t1, t2, lineno) {
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
        unify(t2, t1, lineno);
    } else if(t1 instanceof t.NativeType || t2 instanceof t.NativeType) {
        // do nothing.
        // coercing Native to any type.
    } else if(t1 instanceof t.BaseType && t2 instanceof t.BaseType) {
        var t1str = t1.aliased || t1.toString();
        var t2str = t2.aliased || t2.toString();
        if(t1.name != t2.name || t1.types.length != t2.types.length) {
            throw new Error("Type error on line " + lineno + ": " + t1str + " is not " + t2str);
        }
        if(t1 instanceof t.ObjectType) {
            for(i in t2.props) {
                if(!(i in t1.props)) {
                    throw new Error("Type error on line " + lineno + ": " + t1str + " is not " + t2str);
                }
                unify(t1.props[i], t2.props[i], lineno);
            }
        }
        for(i = 0; i < t1.types.length; i++) {
            unify(t1.types[i], t2.types[i], lineno);
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
var analyseFunction = function(functionDecl, funcType, env, nonGeneric, aliases, constraints) {
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

    analyseWhereDataDecls(functionDecl.whereDecls, newEnv, nonGeneric, aliases, constraints);

    var whereFunctionTypeMap =
        analyseWhereFunctions(functionDecl.whereDecls, newEnv, nonGeneric, aliases, constraints);

    for(var name in whereFunctionTypeMap) {
        newEnv[name] = whereFunctionTypeMap[name];
    }

    var scopeTypes = _.map(withoutComments(functionDecl.body), function(expression) {
        return analyse(expression, newEnv, nonGeneric, aliases, constraints);
    });

    var resultType = scopeTypes[scopeTypes.length - 1];
    types.push(resultType);

    var annotationType;
    if(functionDecl.type) {
        annotationType = nodeToType(functionDecl.type, env, aliases);
        unify(resultType, annotationType, functionDecl.lineno);
    }

    var functionType = new t.FunctionType(types);

    unify(funcType, functionType, functionDecl.lineno);

    return functionType;
};

var analyseWhereFunctions = function(whereDecls, env, nonGeneric, aliases, constraints) {
    var newEnv = _.clone(env);

    var functionDecls = _.filter(whereDecls, function(whereDecl) {
        return whereDecl instanceof n.Function;
    });

    var dependencyGraph = createDependencyGraph(functionDecls);

    var components = stronglyConnectedComponents(dependencyGraph);

    var functionTypes = {};

    _.each(components, function(component) {
               var newNonGeneric = nonGeneric.slice();

               var functionDecls = _.map(component, function(vertex) {
                                             return vertex.declaration;
                                         });

               _.each(functionDecls, function(functionDecl) {
                          var funcTypeAndNonGenerics = createTemporaryFunctionType(functionDecl);
                          var funcType = funcTypeAndNonGenerics[0];

                          newNonGeneric = newNonGeneric.concat(funcTypeAndNonGenerics[1]);

                          newEnv[functionDecl.name] = funcType;
                      });

               _.each(functionDecls, function(functionDecl) {
                          var functionType = newEnv[functionDecl.name];

                          functionTypes[functionDecl.name] =
                              analyseFunction(functionDecl, functionType, newEnv, newNonGeneric, aliases);
                      });
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

    var resultType = new t.Variable();

    tempTypes.push(resultType);

    nonGeneric.push(resultType);

    return [new t.FunctionType(tempTypes), nonGeneric];
};

var createDependencyGraph = function(functionDecls) {
    var verticesMap = {};

    _.each(functionDecls, function(declaration) {
               verticesMap[declaration.name] = {
                   id: declaration.name,
                   declaration: declaration
               };
           });

    var vertices = _.values(verticesMap);

    var edges = {};

    _.each(vertices, function(vertex) {
               var freeVariables = getFreeVariables(vertex.declaration);

               var followings = _.map(freeVariables, function(value, identifier) {
                                          return verticesMap[identifier];
                                      });

               followings = _.without(followings, undefined);

               edges[vertex.declaration.name] = followings;
           });

    return {
        vertices: vertices,
        edges: edges
    };
};

var analyseWhereDataDecls = function(whereDecls, env, nonGeneric, aliases, constraints) {
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
var analyse = function(node, env, nonGeneric, aliases, constraints) {
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

            var functionType = analyseFunction(node, funcType, newEnv, newNonGeneric, aliases, constraints.slice());

            if(node.name) {
                env[node.name] = functionType;
            }

            return functionType;
        },
        visitIfThenElse: function() {
            // if statements are compiled into (function() {...})(), thus they introduce a new environment.
            var newEnv = _.clone(env);

            var conditionType = analyse(node.condition, newEnv, nonGeneric, aliases, constraints);

            unify(conditionType, new t.BooleanType(), node.condition.lineno);

            var ifTrueScopeTypes = _.map(withoutComments(node.ifTrue), function(expression) {
                return analyse(expression, newEnv, nonGeneric, aliases, constraints);
            });
            var ifTrueType = ifTrueScopeTypes[ifTrueScopeTypes.length - 1];

            var ifFalseScopeTypes = _.map(withoutComments(node.ifFalse), function(expression) {
                return analyse(expression, newEnv, nonGeneric, aliases, constraints);
            });
            var ifFalseType = ifFalseScopeTypes[ifFalseScopeTypes.length - 1];

            unify(ifTrueType, ifFalseType, node.lineno);

            return ifTrueType;
        },
        // #### Function call
        //
        // Ensures that all argument types `unify` with the defined function and
        // returns the function's result type.
        visitCall: function() {
            var types = _.map(node.args, function(arg) {
                return analyse(arg, env, nonGeneric, aliases, constraints);
            });

            var funType = analyse(node.func, env, nonGeneric, aliases, constraints);
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
            unify(new t.FunctionType(types), funType, node.lineno);

            return resultType;
        },
        // #### Let binding
        //
        // Infer the value's type, assigns it in the environment and returns it.
        visitLet: function() {
            var valueType = analyse(node.value, env, nonGeneric, aliases, constraints);

            var annotationType;
            if(node.type) {
                annotationType = nodeToType(node.type, env, aliases);
                if(prune(valueType) instanceof t.NativeType) {
                    valueType = annotationType;
                } else {
                    unify(valueType, annotationType, node.lineno);
                }
            }

            env[node.name] = valueType;

            return valueType;
        },
        visitTypeClass: function() {
            var genericType = nodeToType(node.generic, env, aliases);
            env[node.name] = new t.TypeClassType([genericType]);

            _.each(node.types, function(typeNode, name) {
                if(env[name]) {
                    throw new Error("Can't define " + name + " on a typeclass - already defined");
                }
                var nameType = nodeToType(typeNode, env, aliases);
                nameType.typeClass = node.name;
                env[name] = nameType;
            });

            return env[node.name];
        },
        visitInstance: function() {
            var typeClassType = fresh(env[node.typeClassName], nonGeneric);

            var instanceType = nodeToType(node.typeName, env, aliases);
            _.each(typeClassType.types, function(type) {
                unify(type, instanceType);
            });
            var objectType = analyse(node.object, env, nonGeneric, aliases, constraints);
            _.each(objectType.props, function(propType, key) {
                unify(propType, fresh(env[key], nonGeneric));
            });

            objectType.typeClassInstance = {
                name: node.typeClassName,
                type: typeClassType
            };
            env[node.name] = objectType;
        },
        visitAssignment: function() {
            var valueType = analyse(node.value, env, nonGeneric, aliases, constraints);

            if(env[node.name]) {
                if(prune(valueType) instanceof t.NativeType) {
                    return env[node.name];
                } else {
                    unify(valueType, env[node.name], node.lineno);
                }
            } else {
                env[node.name] = valueType;
            }

            return valueType;
        },
        visitExpression: function() {
            return analyse(node.value, env, nonGeneric, aliases, constraints);
        },
        visitDo: function() {
            // TODO: Make cleaner
            return env[node.value.value].props['return'].types[1];
        },
        visitPropertyAccess: function() {
            var valueType = analyse(node.value, env, nonGeneric, aliases, constraints);

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
                unify(valueType, new t.ObjectType(propObj), node.lineno);
            }

            return prune(valueType).getPropertyType(node.property);
        },
        visitAccess: function() {
            var valueType = analyse(node.value, env, nonGeneric, aliases, constraints);

            if(prune(valueType) instanceof t.NativeType) {
                return new t.NativeType();
            }

            unify(valueType, new t.ArrayType(new t.Variable()), node.lineno);

            var accessType = analyse(node.property, env, nonGeneric, aliases, constraints);
            unify(accessType, new t.NumberType(), node.lineno);
            return prune(valueType).type;
        },
        visitBinaryGenericOperator: function() {
            var leftType = analyse(node.left, env, nonGeneric, aliases, constraints);
            var rightType = analyse(node.right, env, nonGeneric, aliases, constraints);
            unify(leftType, rightType, node.lineno);

            return new t.BooleanType();
        },
        visitBinaryNumberOperator: function() {
            var resultType = new t.NumberType();
            var leftType = analyse(node.left, env, nonGeneric, aliases, constraints);
            var rightType = analyse(node.right, env, nonGeneric, aliases, constraints);
            unify(leftType, resultType, node.left.lineno);
            unify(rightType, resultType, node.right.lineno);

            return resultType;
        },
        visitBinaryBooleanOperator: function() {
            var resultType = new t.BooleanType();
            var leftType = analyse(node.left, env, nonGeneric, aliases, constraints);
            var rightType = analyse(node.right, env, nonGeneric, aliases, constraints);
            unify(leftType, resultType, node.left.lineno);
            unify(rightType, resultType, node.right.lineno);

            return resultType;
        },
        visitBinaryStringOperator: function() {
            var resultType = new t.StringType();
            var leftType = analyse(node.left, env, nonGeneric, aliases, constraints);
            var rightType = analyse(node.right, env, nonGeneric, aliases, constraints);
            unify(leftType, resultType, node.left.lineno);
            unify(rightType, resultType, node.right.lineno);

            return resultType;
        },
        visitWith: function() {
            var leftType = analyse(node.left, env, nonGeneric, aliases, constraints);
            var rightType = analyse(node.right, env, nonGeneric, aliases, constraints);
            var combinedTypes = {};

            var emptyObjectType = new t.ObjectType({});
            unify(leftType, emptyObjectType, node.left.lineno);
            unify(rightType, emptyObjectType, node.right.lineno);

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
            analyseWhereDataDecls([node], env, nonGeneric, aliases, constraints);

            return new t.NativeType();
        },
        visitMatch: function() {
            var resultType = new t.Variable();
            var value = analyse(node.value, env, nonGeneric, aliases, constraints);

            var newEnv = _.clone(env);

            _.each(node.cases, function(nodeCase) {
                var newNonGeneric = nonGeneric.slice();

                var tagType = newEnv[nodeCase.pattern.tag.value];
                if(!tagType) {
                    throw new Error("Couldn't find the tag: " + nodeCase.pattern.tag.value);
                }
                unify(value, fresh(_.last(prune(tagType).types), newNonGeneric), nodeCase.lineno);

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
                                unify(currentValue, resultType, v.lineno);

                                addVarsToEnv(v, path);
                            }
                        });
                    });
                };
                addVarsToEnv(nodeCase.pattern, []);

                var caseType = analyse(nodeCase.value, newEnv, newNonGeneric, aliases);
                if(caseType instanceof t.FunctionType && caseType.types.length == 1) {
                    // For tags that don't have arguments
                    unify(resultType, _.last(caseType.types), nodeCase.lineno);
                } else {
                    unify(resultType, caseType, nodeCase.lineno);
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

            if(prune(env[name]).typeClass) {
                var constraintType = fresh(env[name], nonGeneric);
                constraints.push({
                    node: node,
                    type: constraintType
                });
                return constraintType;
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
                unify(valueType, analyse(v, env, nonGeneric, aliases, constraints), v.lineno);
            });
            return new t.ArrayType(valueType);
        },
        visitTuple: function() {
            var propTypes = {};
            _.each(node.values, function(v, i) {
                propTypes[i] = analyse(v, env, nonGeneric, aliases, constraints);
            });
            return new t.ObjectType(propTypes);
        },
        visitObject: function() {
            var propTypes = {};
            var prop;
            for(prop in node.values) {
                propTypes[prop] = analyse(node.values[prop], env, nonGeneric, aliases, constraints);
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
                    unify(envType.types[1 + k], argType, v.lineno);
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

// Adds a property, referencing the name of a type-class instance to
// identifier nodes that are defined on a type-class.
var solveTypeClassConstraint = function(constraint, env) {
    var name = constraint.node.value;

    var typeClassValue = env[name];
    var typeClass = env[typeClassValue.typeClass];

    var instanceTypeClass = fresh(typeClass);

    _.each(typeClass.types, function(tt, i) {
        var types = prune(typeClassValue).types;

        if(!types) {
            if(tt.id != typeClassValue.id) return;

            unify(instanceTypeClass.types[i], constraint.type);
        }

        _.each(prune(typeClassValue).types, function(vt, j) {
            if(tt.id != vt.id) return;

            unify(instanceTypeClass.types[i], constraint.type.types[j]);
        });
    });

    // TODO: Properly check equality
    var areTypesEqual = function(a, b) {
        a = prune(a);
        b = prune(b);

        if(a.name != b.name) {
            return false;
        }

        for(i = 0; i < a.types.length; i++) {
            if(!areTypesEqual(a.types[i], b.types[i])) {
                return false;
            }
        }

        return true;
    };

    var solved = _.find(env, function(t, n) {
        if(!t.typeClassInstance || t.typeClassInstance.name != typeClassValue.typeClass) {
            return false;
        }

        if(!areTypesEqual(instanceTypeClass, t.typeClassInstance.type)) {
            return false;
        }

        constraint.node.typeClassInstance = n;

        return true;
    });

    if(solved) return;

    throw new Error("Couldn't find instance of: " + typeClassValue.typeClass + " " + instanceTypeClass.toString());
};

// Run inference on an array of AST nodes.
var typecheck = function(ast, env, aliases) {
    var types = _.map(ast, function(node) {
        var constraints = [];
        var type = analyse(node, env, [], aliases, constraints);
        _.each(constraints, function(constraint) {
            solveTypeClassConstraint(constraint, env);
        });
        return type;
    });
    return types && types[0];
};
exports.typecheck = typecheck;
