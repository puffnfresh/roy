// ## Algorithm W (Damas-Hindley-Milner)
//
// This is based on Robert Smallshire's [Python code](http://bit.ly/bbVmmX).
// Which is based on Andrew's [Scala code](http://bit.ly/aztXwD). Which is based
// on Nikita Borisov's [Perl code](http://bit.ly/myq3uA). Which is based on Luca
// Cardelli's [Modula-2 code](http://bit.ly/Hjpvb). Wow.

// Type variable and built-in types are defined in the `types` module.
var t = require('./types'),
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
            var types = [];
            var newNonGeneric = nonGeneric.slice();

            var newEnv = _.clone(env);

            var tempTypes = [];
            for(var i = 0; i < node.args.length; i++) {
                tempTypes.push(new t.Variable());
            }
            tempTypes.push(new t.Variable());
            if(node.name) {
                newEnv[node.name] = new t.FunctionType(tempTypes);
            }

            var argNames = {};
            _.each(node.args, function(arg, i) {
                if(argNames[arg.name]) {
                    throw new Error("Repeated function argument '" + arg.name + "'");
                }

                var argType;
                if(arg.type) {
                    argType = nodeToType(arg.type, env, aliases);
                } else {
                    argType = tempTypes[i];
                    newNonGeneric.push(argType);
                }
                newEnv[arg.name] = argType;
                argNames[arg.name] = argType;
                types.push(argType);
            });

            var scopeTypes = _.map(node.body, function(expression) {
                return analyse(expression, newEnv, newNonGeneric, data, aliases);
            });

            var resultType = scopeTypes[scopeTypes.length - 1];
            types.push(resultType);

            var annotationType;
            if(node.type) {
                annotationType = nodeToType(node.type, env, aliases);
                unify(resultType, annotationType);
            }

            var functionType = new t.FunctionType(types);
            if(node.name) {
                env[node.name] = functionType;
            }

            return functionType;
        },
        visitIfThenElse: function() {
            var ifTrueScopeTypes = _.map(node.ifTrue, function(expression) {
                return analyse(expression, env, nonGeneric, data, aliases);
            });
            var ifTrueType = ifTrueScopeTypes[ifTrueScopeTypes.length - 1];

            var ifFalseScopeTypes = _.map(node.ifFalse, function(expression) {
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
            var types = [];

            _.each(node.args, function(arg) {
                var argType = analyse(arg, env, nonGeneric, data, aliases);
                types.push(argType);
            });

            var funType = analyse(node.func, env, nonGeneric, data, aliases);
            if(prune(funType) instanceof t.NativeType) {
                return new t.NativeType();
            }

            if(prune(funType) instanceof t.TagType) {
                var mappings = {};
                var tagType = fresh(env[node.func.value], nonGeneric, mappings);
                var dataType = _.map(data[node.func.value], function(t) {
                    return fresh(t, nonGeneric, mappings);
                });

                _.each(dataType, function(x, i) {
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
                unify(valueType, annotationType);
            }

            env[node.name] = valueType;

            return valueType;
        },
        visitDo: function() {
            // TODO: Make cleaner
            return env[node.value.value].props['return'].types[1];
        },
        visitAccess: function() {
            var valueType = analyse(node.value, env, nonGeneric, data, aliases);

            if(prune(valueType) instanceof t.NativeType) {
                return new t.NativeType();
            }

            if(prune(valueType) instanceof t.ArrayType) {
                var accessType = analyse(node.property, env, nonGeneric, data, aliases);
                unify(accessType, new t.NumberType());
                return prune(valueType).type;
            }

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
            if(!(prune(leftType) instanceof t.NativeType)) {
                unify(resultType, leftType);
            }
            if(!(prune(rightType) instanceof t.NativeType)) {
                unify(resultType, rightType);
            }

            return resultType;
        },
        visitBinaryBooleanOperator: function() {
            var resultType = new t.BooleanType();
            var leftType = analyse(node.left, env, nonGeneric, data, aliases);
            var rightType = analyse(node.right, env, nonGeneric, data, aliases);
            if(!(prune(leftType) instanceof t.NativeType)) {
                unify(resultType, leftType);
            }
            if(!(prune(rightType) instanceof t.NativeType)) {
                unify(resultType, rightType);
            }

            return resultType;
        },
        visitBinaryStringOperator: function() {
            var resultType = new t.StringType();
            var leftType = analyse(node.left, env, nonGeneric, data, aliases);
            var rightType = analyse(node.right, env, nonGeneric, data, aliases);
            if(!(prune(leftType) instanceof t.NativeType)) {
                unify(resultType, leftType);
            }
            if(!(prune(rightType) instanceof t.NativeType)) {
                unify(resultType, rightType);
            }

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
            var nameType = new t.TagNameType(node.name);
            var types = [nameType];

            if(env[node.name]) {
                throw new Error("Multiple declarations of type constructor: " + node.name);
            }

            var newEnv = _.clone(env);

            var argNames = {};
            _.map(node.args, function(arg) {
                if(argNames[arg.name]) {
                    throw new Error("Repeated type variable '" + arg.name + "'");
                }

                var argType;
                if(arg.type) {
                    argType = nodeToType(arg, newEnv, aliases);
                } else {
                    argType = new t.Variable();
                }
                newEnv[arg.name] = argType;
                argNames[arg.name] = argType;
                types.push(argType);
            });

            var type = new t.TagType(types);
            env[node.name] = newEnv[node.name] = type;
            _.each(node.tags, function(tag) {
                if(data[tag.name]) {
                    throw new Error("Multiple declarations for data constructor: " + tag.name);
                }

                data[tag.name] = [];
                _.each(tag.vars, function(v, i) {
                    data[tag.name][i] = nodeToType(v, newEnv, aliases);
                });
                env[tag.name] = type;
            });

            return new t.NativeType();
        },
        visitMatch: function() {
            var resultType = new t.Variable();
            var value = analyse(node.value, env, nonGeneric, data, aliases);

            var newEnv = _.clone(env);

            _.each(node.cases, function(nodeCase) {
                var newNonGeneric = nonGeneric.slice();

                var tagType = newEnv[nodeCase.pattern.tag.value];
                unify(value, fresh(prune(tagType), newNonGeneric));

                var argNames = {};
                var addVarsToEnv = function(p, lastPath) {
                    _.each(p.vars, function(v, i) {
                        var index = tagType.types.indexOf(data[p.tag.value][i]);
                        var path = lastPath.slice();
                        path.push(index);

                        var currentValue = value;
                        for(var x = 0; x < path.length && path[x] != -1; x++) {
                            currentValue = prune(currentValue).types[path[x]];
                        }

                        v.accept({
                            visitIdentifier: function() {
                                if(argNames[v.value]) {
                                    throw new Error('Repeated variable "' + v.value + '" in pattern');
                                }

                                if(v.value in data) {
                                    unify(currentValue, fresh(prune(newEnv[v.value]), newNonGeneric));
                                } else {
                                    newEnv[v.value] = currentValue;
                                    newNonGeneric.push(newEnv[v.value]);
                                }
                                argNames[v.value] = newEnv[v.value];
                            },
                            visitPattern: function() {
                                unify(currentValue, fresh(prune(newEnv[v.tag.value]), newNonGeneric));

                                addVarsToEnv(v, path);
                            }
                        });
                    });
                };
                addVarsToEnv(nodeCase.pattern, []);

                var caseType = analyse(nodeCase.value, newEnv, newNonGeneric, data, aliases);
                unify(resultType, caseType);
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

// Run inference on an array of AST nodes.
var typecheck = function(ast, env, data, aliases) {
    var types = _.map(ast, function(node) {
        return analyse(node, env, [], data, aliases);
    });
    return types && types[0];
};
exports.typecheck = typecheck;
