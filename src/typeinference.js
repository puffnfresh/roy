// ## Bottom-Up Type Inference
var _ = require('underscore'),
    t = require('./types');

// ### Constraints
// We generate constraints from the bottom-up over the AST. The
// type-checking phase is just trying to solve these constraints.

// #### Equality constraints
// `a` and `b` must be equal.
function EqualityConstraint(a, b, node) {
    this.a = a;
    this.b = b;
    this.node = node;

    this.solveOrder = 1;

    this.fold = function(f, _a, _b) {
        return f(this);
    };
}

// #### Implicit constraints
function ImplicitConstraint(a, b, monomorphic, node) {
    this.a = a;
    this.b = b;
    this.monomorphic = monomorphic;

    this.solveOrder = 2;

    this.fold = function(_a, f, _b) {
        return f(this);
    };
}

// #### Explicit constraints
function ExplicitConstraint(a, scheme, node) {
    this.a = a;
    this.scheme = scheme;
    this.node = node;

    this.solveOrder = 3;

    this.fold = function(_a, _b, f) {
        return f(this);
    };
}

// ### Type scheme
function Scheme(s, t) {
    this.s = s;
    this.t = t;
}

// ### Inference state
// Immutable state monoid containing both the current constraints and
// assumptions
function InferenceState(constraints, assumptions) {
    this.constraints = constraints || [];
    this.assumptions = assumptions || {};
}
InferenceState.empty = new InferenceState();
InferenceState.concat = function(states) {
    return _.reduce(states, function(accum, state) {
        return accum.append(state);
    }, InferenceState.empty);
};
InferenceState.prototype.append = function(state) {
    var constraints = this.constraints.concat(state.constraints),
        assumptions = _.extend(_.clone(this.assumptions), state.assumptions);
    return new InferenceState(constraints, assumptions);
};
InferenceState.prototype.withConstraints = function(constraints) {
    return new InferenceState(this.constraints.concat(constraints), this.assumptions);
};
InferenceState.prototype.withAssumptions = function(assumptions) {
    return new InferenceState(this.constraints, _.extend(_.clone(this.assumptions), assumptions));
};

// ## Inference type
function StateType(state, type) {
    this.state = state;
    this.type = type;
}

// Filter out comments.
function withoutComments(nodes) {
    return _.reject(nodes, function(n) {
        return n.accept({
            visitComment: function() {
                return true;
            }
        });
    });
}

function generateAccessConstraints(recurseIfMoreNodes, monomorphic) {
    return function(node) {
        var value = generate([node.value], monomorphic),
            type = new t.Variable(),
            objectTypes = {};

        objectTypes[node.property] = type;

        return recurseIfMoreNodes(new StateType(
            value.state
                .withConstraints([
                    new EqualityConstraint(
                        value.type,
                        new t.ObjectType(objectTypes),
                        node
                    )
                ]),
            type
        ));
    };
}

// ## InferenceState generation
// Takes a non-empty array of AST nodes and generates a new
// InferenceType.
function generate(nodes, monomorphic) {
    var nodesWithoutComments = withoutComments(nodes),
        node = nodesWithoutComments[0];

    monomorphic = monomorphic || [];

    // For nodes that don't introduce constraints nor assumptions
    function withEmptyState(type) {
        return function() {
            return new StateType(InferenceState.empty, type);
        };
    }

    // We always return the last node in a sequence except for let
    // bindings.
    function recurseIfMoreNodes(stateType) {
        var generated;
        if(nodesWithoutComments.length > 1) {
            generated = generate(nodesWithoutComments.slice(1), monomorphic);
            return new StateType(
                stateType.state.append(generated.state),
                generated.type
            );
        }

        return stateType;
    }

    var stateType = node.accept({
        visitIdentifier: function() {
            var type = new t.Variable(),
                assumptions = {};

            assumptions[node.value] = type;

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptions),
                type
            ));
        },
        visitCall: function() {
            var funcStateType = generate([node.func], monomorphic),
                nodeStateTypes = _.map(node.args, function(a) {
                    return generate([a], monomorphic);
                }),
                argTypes = _.pluck(nodeStateTypes, 'type'),
                argStates  = _.pluck(nodeStateTypes, 'state'),
                type = new t.Variable();

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .concat(argStates)
                    .append(funcStateType.state)
                    .withConstraints([
                        new EqualityConstraint(
                            funcStateType.type,
                            new t.FunctionType(argTypes.concat(type)),
                            node
                        )
                    ]),
                type
            ));
        },
        visitFunction: function() {
            var types = _.map(_.range(node.args.length), function() {
                    return new t.Variable()
                }),
                bodyStateType = generate(node.body, monomorphic.concat(types)),
                argNames = _.map(node.args, function(a) {
                    return a.name;
                }),
                assumptionsNotInArgs = {},
                constraintsFromAssumptions = [];

            _.each(bodyStateType.state.assumptions, function(v, k) {
                var index = argNames.indexOf(k);
                if(index != -1) {
                    constraintsFromAssumptions.push(
                        new EqualityConstraint(
                            v,
                            types[index],
                            node
                        )
                    );
                } else {
                    assumptionsNotInArgs[k] = v;
                }
            });

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptionsNotInArgs)
                    .withConstraints(bodyStateType.state.constraints)
                    .withConstraints(constraintsFromAssumptions),
                new t.FunctionType(types.concat(bodyStateType.type))
            ));
        },
        visitLet: function() {
            var value = generate([node.value], monomorphic),
                body,
                assumptionsWithoutLet,
                constraintsFromLet;

            // let bindings can't be treated as an expression
            if(nodesWithoutComments.length == 1) {
                throw new Error("let binding without any children expressions");
            }

            body = generate(nodesWithoutComments.slice(1), monomorphic);
            assumptionsWithoutLet = _.pick(
                body.state.assumptions,
                _.without(
                    _.keys(body.state.assumptions),
                    node.name
                )
            );
            constraintsFromLet =
                _.has(body.state.assumptions, node.name) ? [
                    new ImplicitConstraint(
                        value.type,
                        body.state.assumptions[node.name],
                        monomorphic
                        node
                    )
                ] : [];

            return new StateType(
                value.state
                    .withAssumptions(assumptionsWithoutLet)
                    .withConstraints(body.state.constraints)
                    .withConstraints(constraintsFromLet),
                body.type
            );
        },

        visitIfThenElse: function() {
            var condition = generate([node.condition], monomorphic),
                ifTrue = generate(node.ifTrue, monomorphic),
                ifFalse = generate(node.ifFalse, monomorphic);

            return recurseIfMoreNodes(new StateType(
                condition.state
                    .append(ifTrue.state)
                    .append(ifFalse.state)
                    .withConstraints([
                        new EqualityConstraint(
                            condition.type,
                            new t.BooleanType(),
                            node
                        ),
                        new EqualityConstraint(
                            ifTrue.type,
                            ifFalse.type,
                            node
                        )
                    ]),
                ifTrue.type
            ));
        },
        visitPropertyAccess: generateAccessConstraints(recurseIfMoreNodes, monomorphic),
        visitAccess: generateAccessConstraints(recurseIfMoreNodes, monomorphic),

        visitExpression: function() {
            var value = generate([node.value], monomorphic);
            return recurseIfMoreNodes(value);
        },
        visitBinaryNumberOperator: function() {
            var a = generate([node.left], monomorphic),
                b = generate([node.right], monomorphic);

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .append(a.state)
                    .append(b.state)
                    .withConstraints([
                        new EqualityConstraint(
                            a.type,
                            new t.NumberType(),
                            node
                        ),
                        new EqualityConstraint(
                            b.type,
                            new t.NumberType(),
                            node
                        )
                    ]),
                new t.NumberType()
            ));
        },
        visitBinaryGenericOperator: function() {
            var a = generate([node.left], monomorphic),
                b = generate([node.right], monomorphic);

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .empty
                    .append(a.state)
                    .append(b.state)
                    .withConstraints([
                        new EqualityConstraint(
                            a.type,
                            b.type,
                            node
                        )
                    ]),
                new t.BooleanType()
            ));
        },

        visitObject: function() {
            var objectTypes = {},
                objectStates = [];

            _.each(node.values, function(v, k) {
                var stateType = generate([v], monomorphic);
                objectTypes[k] = stateType.type;
                objectStates.push(stateType.state);
            });

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .concat(objectStates),
                new t.ObjectType(objectTypes)
            ));
        },
        visitArray: function() {
            var valueStateTypes = _.map(node.values, function(v) {
                    return generate([v], monomorphic);
                }),
                valueStates = _.pluck(valueStateTypes, 'state'),
                type = valueStateTypes.length ? valueStateTypes[0].type : new t.Variable(),
                equalityConstraints = _.map(valueStateTypes.slice(1), function(v) {
                    return new EqualityConstraint(v.type, type, node);
                });

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .concat(valueStates)
                    .withConstraints(equalityConstraints),
                new t.ArrayType(type)
            ));
        },
        visitBoolean: withEmptyState(new t.BooleanType()),
        visitNumber: withEmptyState(new t.NumberType()),
        visitString: withEmptyState(new t.StringType())
    });

    if(!stateType) throw new Error("No StateType for: " + node.accept.toString());
    return stateType;
}
exports.generate = generate;

function solve(constraints) {
    var sortedConstraints = _.sortBy(constraints, function(c) {
            return c.solveOrder;
        }),
        rest = sortedConstraints.slice(1),
        constraint;

    if(!constraints.length) return {};

    constraint = sortedConstraints[0];
    return constraint.fold(function() {
        // Equality constraints
        // Use the Most General Unifier (mgu)
        var m = mostGeneralUnifier(constraint.a, constraint.b, constraint.node),
            s = _.map(rest, function(r) {
                return constraintSubstitute(m, r, constraint.node);
            });
        return _.extend(m, solve(rest));
    }, function() {
        // Implicit constraints
        return solve([new ExplicitConstraint(
            constraint.a,
            generalize(constraint.b, constraint.monomorphic),
            constraint.node
        )].concat(rest));
    }, function() {
        // Explicit constraints
        return solve([new EqualityConstraint(
            constraint.a,
            instantiate(constraint.scheme),
            constraint.node
        )].concat(rest));
    });
}

function free(type) {
    if(type instanceof t.Variable) {
        return [type.id];
    } else if(type instanceof t.FunctionType) {
        return [].concat.apply([], _.map(type.types, free));
    }
}

function instantiate(scheme) {
    var substitutions = scheme.s.map(function() {
        return new t.Variable();
    });
    return typeSubstitute(substitutions, scheme.t);
}

function generalize(type, monomorphic) {
    return new Scheme(_.without(free(type), monomorphic), type);
}

function variableBind(a, b) {
    var substitution = {};
    if(b instanceof t.Variable && a.id == b.id) {
        return substitution;
    }
    substitution[a.id] = b;
    return substitution;
}

function mostGeneralUnifier(a, b, node) {
    if(a instanceof t.Variable) {
        return variableBind(a, b);
    } else if(b instanceof t.Variable) {
        return variableBind(b, a);
    } else if(a.name != b.name) {
        throw new Error('Type error on line ' + node.lineno + ': ' + b.toString() + ' is not ' + a.toString());
    }
    return {};
}

function constraintSubstitute(substitutions, constraint) {
    return constraint.fold(function() {
        return new EqualityConstraint(
            typeSubstitute(substitutions, constraint.a),
            typeSubstitute(substitutions, constraint.b),
            constraint.node
        );
    }, function() {
        return new ImplicitConstraint(
            typeSubstitute(substitutions, constraint.a),
            typeSubstitute(substitutions, constraint.b),
            constraint.monomorphic,
            constraint.node
        );
    }, function() {
        return new ExplicitConstraint(
            typeSubstitute(substitutions, constraint.a),
            constraint.scheme,
            constraint.node
        );
    });
}

function typeSubstitute(substitutions, type) {
    var substituted;
    if(type instanceof t.Variable) {
        if(_.has(substitutions, type.id)) {
            return substitutions[type.id];
        }
        return type;
    } else if(type instanceof t.FunctionType) {
        return new t.FunctionType(_.map(type.types, function(t) {
            return typeSubstitute(substitutions, t);
        }));
    } else if(type instanceof t.ArrayType) {
        return new t.ArrayType(typeSubstitute(substitutions, type.type));
    } else if(type instanceof t.ObjectType) {
        substituted = {};
        _.each(type.props, function(v, k) {
            substituted[k] = typeSubstitute(substitutions, v);
        });
        return new t.ObjectType(substituted);
    } else if(type instanceof t.ArrayType) {
        throw new Error("Not handled: " + type.toString());
    } else if(type instanceof t.NumberType) {
        return type;
    } else if(type instanceof t.StringType) {
        return type;
    } else if(type instanceof t.BooleanType) {
        return type;
    }
    throw new Error("Not handled: " + type.toString());
}
exports.substitute = typeSubstitute;

// Run inference on an array of AST nodes.
function typecheck(nodes) {
    var stateType = generate(nodes),
        constraints = stateType.state.constraints,
        substitutions = solve(constraints);

    return typeSubstitute(substitutions, stateType.type);
}
exports.typecheck = typecheck;
