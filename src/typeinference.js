// ## Algorithm W (Damas-Hindley-Milner)
//
// This is based on Robert Smallshire's [Python code](http://bit.ly/bbVmmX).
// Which is based on Andrew's [Scala code](http://bit.ly/aztXwD). Which is based
// on Nikita Borisov's [Perl code](http://bit.ly/myq3uA). Which is based on Luca
// Cardelli's [Modula-2 code](http://bit.ly/Hjpvb). Wow.

// Type variable and built-in types are defined in the `types` module.
var t = require('./types');

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
        if(t1.name != t2.name || t1.types.length != t2.types.length) {
            throw new Error("Type error: " + t1.toString() + " is not " + t2.toString());
	}
	for(i = 0; i < Math.min(t1.types.length, t2.types.length); i++) {
            unify(t1.types[i], t2.types[i]);
	}
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
// *Note*: Copied types are instantiated through the BaseType constructor, this
// means `instanceof` can't be used for determining a subtype.
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

    return new type.constructor(type.map(function(type) {
	return fresh(type, nonGeneric, mappings);
    }));
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
    } else if(t2 instanceof t.BaseType) {
        return occursInTypeArray(t1, t2.types);
    }
    return false;
};

var occursInTypeArray = function(t1, types) {
    return types.map(function(t2) {
	return occursInType(t1, t2);
    }).indexOf(true) >= 0;
};

// ### Type analysis
//
// `analyse` is the core inference function. It takes an AST node and returns
// the infered type.
var data = {};
var analyse = function(node, env, nonGeneric) {
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

	    var tempTypes = [];
	    for(var i = 0; i < node.args.length; i++) {
		tempTypes.push(new t.Variable());
	    }
	    tempTypes.push(new t.Variable());
            env[node.name] = new t.FunctionType(tempTypes);

	    node.args.forEach(function(arg, i) {
		var argType;
		if(arg.type) {
		    argType = nodeToType(arg.type);
		} else {
		    argType = tempTypes[i];
		    newNonGeneric.push(argType);
		}
		env[arg.name] = argType;
		types.push(argType);
	    });

	    var scopeTypes = node.body.map(function(expression) {
		return analyse(expression, env, newNonGeneric);
	    });

	    var resultType = scopeTypes[scopeTypes.length - 1];
	    types.push(resultType);

	    var annotationType;
	    if(node.type) {
		annotationType = nodeToType(node.type);
		unify(resultType, annotationType);
	    }

	    var functionType = new t.FunctionType(types);
            env[node.name] = functionType;

            return functionType;
	},
	visitIfThenElse: function() {
	    var ifTrueScopeTypes = node.ifTrue.map(function(expression) {
		return analyse(expression, env, nonGeneric);
	    });
	    var ifTrueType = ifTrueScopeTypes[ifTrueScopeTypes.length - 1];

	    var ifFalseScopeTypes = node.ifFalse.map(function(expression) {
		return analyse(expression, env, nonGeneric);
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

	    node.args.forEach(function(arg) {
		var argType = analyse(arg, env, nonGeneric);
		types.push(argType);
	    });

            var funType = analyse(node.func, env, nonGeneric);
	    if(prune(funType) instanceof t.NativeType) {
		return new t.NativeType();
	    }

	    if(prune(funType) instanceof t.TagType) {
		var nameType = new t.TagNameType(prune(funType).name);
		var tagTypes = [nameType];
		types.forEach(function(t) {
		    tagTypes.push(t);
		});

		types.forEach(function(t, i) {
		    unify(t, data[node.func.value][i]);
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
            var valueType = analyse(node.value, env, nonGeneric);

	    var annotionType;
	    if(node.type) {
		annotionType = nodeToType(node.type);
		unify(valueType, annotionType);
	    }

            env[node.name] = valueType;

            return valueType;
	},
	visitAccess: function() {
	    var valueType = analyse(node.value, env, nonGeneric);

	    if(prune(valueType) instanceof t.NativeType) {
		return new t.NativeType();
	    }

	    unify(new t.ObjectType({}), valueType);

	    var property = prune(valueType).getPropertyType(node.property);

	    if(property) {
		return property;
	    } else {
		return new t.NativeType();
	    }
	},
	visitBinaryGenericOperator: function() {
            var leftType = analyse(node.left, env, nonGeneric);
            var rightType = analyse(node.right, env, nonGeneric);
            unify(leftType, rightType);

            return leftType;
	},
	visitBinaryNumberOperator: function() {
	    var resultType = new t.NumberType();
            var leftType = analyse(node.left, env, nonGeneric);
            var rightType = analyse(node.right, env, nonGeneric);
            unify(resultType, rightType);
            unify(resultType, leftType);

            return resultType;
	},
	visitData: function() {
	    var nameType = new t.TagNameType(node.name);
	    var types = [nameType];
	    var dataTypes = {};
	    node.args.map(function(arg) {
		var argType;
		if(arg.type) {
		    argType = nodeToType(arg);
		} else {
		    argType = new t.Variable();
		}
		dataTypes[arg.name] = argType;
		types.push(argType);
	    });
	    var type = new t.TagType(types);
	    node.tags.forEach(function(tag) {
		data[tag.name] = [];
		tag.vars.forEach(function(v, i) {
		    var varType;
		    if(v.type) {
			varType = nodeToType(v);
		    } else {
			varType = new t.Variable();
		    }
		    if(dataTypes[v.name]) {
			unify(dataTypes[v.name], varType);
		    }
		    data[tag.name][i] = varType;
		});
		env[tag.name] = type;
	    });
	    return new t.NativeType();
	},
	visitMatch: function() {
	    var resultType = new t.Variable();
	    var value = analyse(node.value, env, nonGeneric);
	    node.cases.forEach(function(nodeCase) {
		var tagTypes = data[nodeCase.pattern.tag];
		unify(value, env[nodeCase.pattern.tag]);
		nodeCase.pattern.vars.forEach(function(v, i) {
		    env[v] = tagTypes[i];
		});
		var caseType = analyse(nodeCase.value, env, nonGeneric);
		unify(resultType, caseType);
	    });
	    return resultType;
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
	    return new t.ArrayType();
	},
	visitObject: function() {
	    return new t.ObjectType({});
	}
    });
};


// Converts an AST node to type system type.
var nodeToType = function(type) {
    switch(type.value) {
    case 'Number':
	return new t.NumberType();
    case 'String':
	return new t.StringType();
    case 'Boolean':
	return new t.BooleanType();
    default:
	return type; // Shouldn't happen
    }
};

// Run inference on an array of AST nodes.
var typecheck = function(ast, builtins) {
    if(!builtins) builtins = {};

    return ast.map(function(node) {
	return analyse(node, builtins);
    });
};

exports.typecheck = typecheck;

// ## Examples
if(!module.parent) {
    (function() {
	var types = typecheck([
	    // let a = 10
	    //
	    // Result: Number
	    {
		accept: function(a) {
		    return a.visitLet();
		},
		name: 'a',
		value: {
		    accept: function(a) {
			return a.visitNumber();
		    },
		    value: 10
		}
	    },
	    // fun id x = x
	    //
	    // Result: Function('a,'a)
	    {
		accept: function(a) {
		    return a.visitFunction();
		},
		name: "id",
		args: [{name: "x"}],
		body: [{
		    accept: function(a) {
			return a.visitIdentifier();
		    },
		    value: "x"
		}]
	    },
	    // fun explicitNumber (x : Number) = x
	    //
	    // Result: Function(Number,Number)
	    {
		accept: function(a) {
		    return a.visitFunction();
		},
		name: "explicitNumber",
		args: [
		    {
			name: "x",
			type: {
			    value: 'Number'
			}
		    }
		],
		body: [{
		    accept: function(a) {
			return a.visitIdentifier();
		    },
		    value: "x"
		}]
	    },
	    // fun ignoreArg a = 100
	    //
	    // Result: Function('b, Number)
	    {
		accept: function(a) {
		    return a.visitFunction();
		},
		name: "ignoreArg",
		args: [{name: "a"}],
		body: [{
		    accept: function(a) {
			return a.visitNumber();
		    },
		    value: 100
		}]
	    },
	    // id 200
	    //
	    // Result: Number
	    {
		accept: function(a) {
		    return a.visitCall();
		},
		name: {
		    accept: function(a) {
			return a.visitIdentifier();
		    },
		    value: "id"
		},
		args: [
		    {
			accept: function(a) {
			    return a.visitNumber();
			},
			value: 100
		    }
		]
	    }
	]);

	console.log(types.toString());
    })();
}
