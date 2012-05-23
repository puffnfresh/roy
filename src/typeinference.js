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
function InferenceType(type, state) {
    this.type = type;
    this.state = state;
}

// ## InferenceState generation
// Takes an AST node and generates a new InferenceType.
function generate(node) {
    // For nodes that don't introduce constraints nor assumptions
    function withEmptyState(type) {
        return function() {
            return new InferenceType(type, InferenceState.empty);
        };
    };

    return node.accept({
        visitIdentifier: function() {
            var type = new t.Variable(),
                assumptions = {};

            assumptions[node.value] = type;

            return new InferenceType(
                type,
                InferenceState.empty.withAssumptions(assumptions)
            );
        },
        visitCall: function() {
            var funcType = generate(node.func),
                nodeTypes = _.map(node.args, generate),
                argTypes = _.map(nodeTypes, function(a) { return a.type; }),
                argStates  = _.map(nodeTypes, function(a) { return a.state; }),
                type = new t.Variable();

            return new InferenceType(
                type,
                InferenceState
                    .concat(argStates)
                    .append(funcType.state)
                    .withConstraints([
                        new EqualityConstraint(
                            funcType.type,
                            new t.FunctionType([].concat(argTypes, [type]))
                        )
                    ])
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
