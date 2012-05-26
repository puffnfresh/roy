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
}

// #### Implicit constraints
function ImplicitConstraint(a, b, s) {
    this.a = a;
    this.b = b;
    this.s = s;
}

// #### Explicit constraints
function ExplicitConstraint(a, s) {
    this.a = a;
    this.s = s;
}

// ## Inference state
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
    var constraints = [].concat(this.constraints, state.constraints),
        assumptions = _.extend(_.clone(this.assumptions), state.assumptions);
    return new InferenceState(constraints, assumptions);
};
InferenceState.prototype.withConstraints = function(constraints) {
    return new InferenceState([].concat(this.constraints, constraints), this.assumptions);
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
                            new t.FunctionType([].concat(argTypes, [type]))
                        )
                    ]),
                type
            ));
        },
        visitFunction: function() {
            var type = new t.Variable(),
                bodyStateType = generate(node.body, [].concat(monomorphic, [type])),
                argNames = _.map(node.args, function(a) {
                    return a.name;
                }),
                assumptionsNotInArgs = {},
                constraintsFromAssumptions = [];

            _.each(bodyStateType.state.assumptions, function(v, k) {
                if(argNames.indexOf(k) != -1) {
                    constraintsFromAssumptions.push(new EqualityConstraint(v, type));
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
                type
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
                        body.type,
                        monomorphic
                    )
                ] : [];

            return new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptionsWithoutLet)
                    .withConstraints(value.state.constraints)
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

// Run inference on an array of AST nodes.
var typecheck = function(nodes) {
    return generate(nodes).state;
};
exports.typecheck = typecheck;
