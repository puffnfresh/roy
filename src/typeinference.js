// ## Bottom-Up Type Inference
var _ = require('underscore'),
    t = require('./types');

// ### Constraints
// We generate constraints from the bottom-up over the AST. The
// type-checking phase is just trying to solve these constraints.

// #### Equality constraints
// `a` and `b` must be equal.
function EqualityConstraint(a, b) {
    this.a = a;
    this.b = b;

    this.solveOrder = 1;

    this.fold = function(f, _a, _b) {
        return f(this);
    };
}

// #### Implicit constraints
function ImplicitConstraint(a, b, m) {
    this.a = a;
    this.b = b;
    this.m = m;

    this.solveOrder = 2;

    this.fold = function(_a, f, _b) {
        return f(this);
    };
}

// #### Explicit constraints
function ExplicitConstraint(a, s) {
    this.a = a;
    this.s = s;

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

// ## InferenceState generation
// Takes a non-empty array of AST nodes and generates a new
// InferenceType.
function generate(nodes, monomorphic) {
    var node = nodes[0];

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
        if(nodes.length > 1) {
            generated = generate(nodes.slice(1), monomorphic);
            return new StateType(
                stateType.state.append(generated.state),
                generated.type
            );
        }

        return stateType;
    }

    return node.accept({
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
                argTypes = _.map(nodeStateTypes, function(a) {
                    return a.type;
                }),
                argStates  = _.map(nodeStateTypes, function(a) {
                    return a.state;
                }),
                type = new t.Variable();

            return recurseIfMoreNodes(new StateType(
                InferenceState
                    .concat(argStates)
                    .append(funcStateType.state)
                    .withConstraints([
                        new EqualityConstraint(
                            funcStateType.type,
                            new t.FunctionType(argTypes.concat(type))
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
                        new EqualityConstraint(v, types[index])
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
            if(nodes.length == 1) {
                throw new Error("let binding without any children expressions");
            }

            body = generate(nodes.slice(1), monomorphic);
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

        visitBoolean: withEmptyState(new t.BooleanType()),
        visitNumber: withEmptyState(new t.NumberType()),
        visitString: withEmptyState(new t.StringType())
    });
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
        // Most General Unifier (mgu)
        var m = mostGeneralUnifier(constraint.a, constraint.b),
            s = _.map(rest, function(r) {
                return substitute(m, r);
            });
        return _.extend(m, solve(rest));
    }, function() {
        // Implicit constraints
        return solve([new ExplicitConstraint(
            constraint.a,
            generalize(constraint.b, constraint.m)
        )].concat(rest));
    }, function() {
        // Explicit constraints
        return solve([new EqualityConstraint(
            constraint.a,
            instantiate(constraint.s)
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
    return substitute(substitutions, scheme.t);
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

function mostGeneralUnifier(a, b) {
    if(a instanceof t.Variable) {
        return variableBind(a, b);
    } else if(b instanceof t.Variable) {
        return variableBind(b, a);
    }
    return {};
}

function substitute(substitutions, type) {
    if(type instanceof t.Variable) {
        if(_.has(substitutions, type.id)) {
            return substitutions[type.id];
        }
        return type;
    } else if(type instanceof t.FunctionType) {
        return new t.FunctionType(_.map(type.types, function(t) {
            return substitute(substitutions, t);
        }));
    }
    return type;
}
exports.substitute = substitute;

// Run inference on an array of AST nodes.
function typecheck(nodes) {
    var stateType = generate(nodes),
        constraints = stateType.state.constraints,
        substitutions = solve(constraints);

    return substitute(substitutions, stateType.type);
}
exports.typecheck = typecheck;
