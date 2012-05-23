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
    var constraints = [].concat(this.constraints, state.constraints);
    var assumptions = _.extend(_.clone(this.assumptions), state.assumptions);
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
// Takes an AST node and generates a new InferenceType.
function generate(node) {
    // For nodes that don't introduce constraints nor assumptions
    function withEmptyState(type) {
        return function() {
            return new StateType(InferenceState.empty, type);
        };
    };

    return node.accept({
        visitIdentifier: function() {
            var type = new t.Variable(),
                assumptions = {};

            assumptions[node.value] = type;

            return new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptions),
                type
            );
        },
        visitCall: function() {
            var funcStateType = generate(node.func),
                nodeStateTypes = _.map(node.args, generate),
                argTypes = _.map(nodeStateTypes, function(a) { return a.type; }),
                argStates  = _.map(nodeStateTypes, function(a) { return a.state; }),
                type = new t.Variable();

            return new StateType(
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
            );
        },
        visitFunction: function() {
            var bodyStateType =_.reduce(node.body, function(stateType, node) {
                    var generatedStateType = generate(node);
                    return new StateType(
                        stateType.state.append(generatedStateType.state),
                        generatedStateType.type
                    );
                }, new StateType(InferenceState.empty)),
                argNames = _.map(node.args, function(a) { return a.name; }),
                assumptionsNotInArgs = {},
                constraints = [],
                type = new t.Variable();

            _.each(bodyStateType.state.assumptions, function(v, k) {
                if(argNames.indexOf(k) != -1) {
                    constraints.push(new EqualityConstraint(v, type));
                } else {
                    assumptionsNotInArgs[k] = v;
                }
            });

            return new StateType(
                InferenceState
                    .empty
                    .withAssumptions(assumptionsNotInArgs)
                    .withConstraints(constraints),
                type
            );
        },

        visitBoolean: withEmptyState(new t.BooleanType()),
        visitNumber: withEmptyState(new t.NumberType()),
        visitString: withEmptyState(new t.StringType())
    });
}

// Run inference on an array of AST nodes.
var typecheck = function(nodes) {
    return _.reduce(nodes, function(state, node) {
        return state.append(generate(node).state);
    }, InferenceState.empty);
};
exports.typecheck = typecheck;
