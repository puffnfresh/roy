// ## Bottom-Up Type Inference
var _ = require('underscore'),
    t = require('./types'),
    freshVariable;

// ### Constraints
// We generate constraints from the bottom-up over the AST. The
// type-checking phase is just trying to solve these constraints.

// #### Equality constraints
// `a` and `b` must be equal.
function EqualityConstraint(a, b, node) {
    this.a = a;
    this.b = b;
    this.node = node;
}
EqualityConstraint.prototype.cata = function(f, _a, _b) {
    return f(this);
};

// #### Implicit constraints
function ImplicitConstraint(a, b, monomorphic, node) {
    this.a = a;
    this.b = b;
    this.monomorphic = monomorphic;
    this.node = node;
}
ImplicitConstraint.prototype.cata = function(_a, f, _b) {
    return f(this);
};

// #### Explicit constraints
function ExplicitConstraint(a, scheme, node) {
    this.a = a;
    this.scheme = scheme;
    this.node = node;
}
ExplicitConstraint.prototype.cata = function(_a, _b, f) {
    return f(this);
};

// ### Type scheme
function Scheme(s, t) {
    this.s = s;
    this.t = t;
}

/**
  ### Inference result

  Semigroup containing constraints, assumptions and a type.
**/
function InferenceResult(type, constraints, assumptions, predicates, instances) {
    this.type = type;
    this.constraints = constraints || [];
    this.assumptions = assumptions || {};
    this.predicates = predicates || [];
    this.instances = instances || [];
}
InferenceResult.concat = function(results) {
    return _.reduce(results.slice(1), function(accum, result) {
        return accum.append(result);
    }, results[0]);
};
InferenceResult.prototype.append = function(result) {
    var constraints = this.constraints.concat(result.constraints),
        assumptions = mergeAssumptions(this.assumptions, result.assumptions),
        predicates = this.predicates.concat(result.predicates),
        instances = this.instances.concat(result.instances);

    return new InferenceResult(
        result.type,
        constraints,
        assumptions,
        predicates,
        instances
    );
};
InferenceResult.prototype.withType = function(type) {
    return new InferenceResult(
        type,
        this.constraints,
        this.assumptions,
        this.predicates,
        this.instances
    );
};
InferenceResult.prototype.withConstraints = function(constraints) {
    return new InferenceResult(
        this.type,
        this.constraints.concat(constraints),
        this.assumptions,
        this.predicates,
        this.instances
    );
};
InferenceResult.prototype.withAssumptions = function(assumptions) {
    return new InferenceResult(
        this.type,
        this.constraints,
        mergeAssumptions(this.assumptions, assumptions),
        this.predicates,
        this.instances
    );
};
InferenceResult.prototype.withPredicates = function(predicates) {
    return new InferenceResult(
        this.type,
        this.constraints,
        this.assumptions,
        this.predicates.concat(predicates),
        this.instances
    );
};
InferenceResult.prototype.withInstances = function(instances) {
    return new InferenceResult(
        this.type,
        this.constraints,
        this.assumptions,
        this.predicates,
        this.instances.concat(instances)
    );
};

function mergeAssumptions(a1, a2) {
    var merged = _.extend(_.clone(a1), a2);
    _.each(_.intersection(_.keys(a1), _.keys(a2)), function(key) {
        merged[key] = a1[key].concat(a2[key]);
    });
    return merged;
}

// Filter out comments from an array of nodes.
function withoutComments(nodes) {
    return _.reject(nodes, function(n) {
        return n.accept({
            visitComment: function() {
                return true;
            }
        });
    });
}

/**
  # State monad
**/
function Tuple2(_1, _2) {
    this._1 = _1;
    this._2 = _2;
}
function State(run) {
    this.run = run;
}
State.of = function(a) {
    return new State(function(b) {
        return new Tuple2(a, b);
    });
};
State.prototype.chain = function(f) {
    var state = this;
    return new State(function(s) {
        var result = state.run(s);
        return f(result._1).run(result._2);
    });
};
State.prototype.map = function(f) {
    return this.chain(function(a) {
        return State.of(f(a));
    });
};
State.prototype.ap = function(a) {
    return this.chain(function(f) {
        return a.map(f);
    });
};
State.get = new State(function(s) {
    return new Tuple2(s, s);
});
State.modify = function(f) {
    return new State(function(s) {
        return new Tuple2(null, f(s));
    });
};
State.put = function(s) {
    return State.modify(function(a) {
        return s;
    });
};
State.prototype.evalState = function(s) {
    return this.run(s)._1;
};

/**
  ## Generating state

  Everything required to calculate types for a node
**/
function GenerateState(variableId, monomorphic, memotable) {
    this.variableId = variableId;
    this.monomorphic = monomorphic;
    this.memotable = memotable;
}
GenerateState.init = new GenerateState(0, [], []);
GenerateState.prototype.updateVariableId = function(variableId) {
    return new GenerateState(variableId, this.monomorphic, this.memotable);
};
GenerateState.prototype.updateMonomorphic = function(monomorphic) {
    return new GenerateState(this.variableId, monomorphic, this.memotable);
};
GenerateState.prototype.appendMonomorphic = function(monomorphic) {
    return this.updateMonomorphic(this.monomorphic.concat(monomorphic));
};
GenerateState.prototype.appendMemotable = function(node, result) {
    return new GenerateState(this.variableId, this.monomorphic, this.memotable.concat([{
        node: node,
        result: result
    }]));
};
function memoizedGenerate(node) {
    return State.get.chain(function(s) {
        var memotable = s.memotable,
            i;
        for(i = 0; i < memotable.length; i++) {
            if(memotable[i].node == node)
                return State.of(memotable[i].result);
        }
        return generate(node).chain(function(inferenceResult) {
            return State.modify(function(s) {
                return s.appendMemotable(node, inferenceResult);
            }).map(function(u) {
                return inferenceResult;
            });
        });
    });
}

function arraySequence(as) {
    return _.reduce(as, function(state, aa) {
        return state.map(function(accum) {
            return function(a) {
                return accum.concat([a]);
            };
        }).ap(aa);
    }, State.of([]));
}

function generateBody(body) {
    return arraySequence(_.map(withoutComments(body), memoizedGenerate));
}

freshVariable = State.get.chain(function(s) {
    var newState = s.updateVariableId(s.variableId + 1);
    return State.put(newState).map(function(u) {
        return new t.Variable(s.variableId);
    });
});

function inMonomorphic(monomorphic, s) {
    return State.get.chain(function(original) {
        return State.put(original.appendMonomorphic(monomorphic)).chain(function() {
            return s;
        }).chain(function(result) {
            return State.modify(function(state) {
                return state.updateMonomorphic(original.monomorphic);
            }).map(function(u) {
                return result;
            });
        });
    });
}

// ## Statefully generate inference constraints
function generate(node) {
    return node.accept({
        visitModule: function() {
            return generateBody(node.body).chain(function(values) {
                if(!values.length) {
                    return freshVariable.map(function(type) {
                        return new InferenceResult(type);
                    });
                }
                return State.of(InferenceResult.concat(values));
            });
        },

        visitComment: function() {
            // TODO: Damn it. Comments should be attributes on nodes.
            return freshVariable.map(function(type) {
                return new InferenceResult(type);
            });
        },
        visitIdentifier: function() {
            return freshVariable.map(function(type) {
                var assumptions = {};
                assumptions[node.value] = [type];
                return new InferenceResult(
                    type,
                    [],
                    assumptions,
                    [{todo: type}]
                );
            });
        },
        visitCall: function() {
            return freshVariable.chain(function(type) {
                return memoizedGenerate(node.func).chain(function(func) {
                    return generateBody(node.args).map(function(args) {
                        var argTypes = _.pluck(args, 'type'),
                            argResult = args.length ? InferenceResult.concat(args) : new InferenceResult(type);
                        return argResult
                            .append(func)
                            .withConstraints([
                                new EqualityConstraint(
                                    func.type,
                                    new t.FunctionType(argTypes.concat(type)),
                                    node
                                )
                            ])
                            .withType(type);
                    });
                });
            });
        },
        visitFunction: function() {
            return arraySequence(_.map(node.args, function(arg) {
                return freshVariable;
            })).chain(function(types) {
                return inMonomorphic(types, generateBody(node.value).map(function(values) {
                    var value = InferenceResult.concat(values),
                        argNames = _.pluck(node.args, 'name'),
                        assumptionsNotInArgs = {},
                        constraintsFromAssumptions = [];

                    _.each(value.assumptions, function(v, k) {
                        var index = argNames.indexOf(k);
                        if(index != -1) {
                            _.each(v, function(assumption) {
                                constraintsFromAssumptions.push(
                                    new EqualityConstraint(
                                        assumption,
                                        types[index],
                                        node
                                    )
                                );
                            });
                        } else if(k != node.name) {
                            assumptionsNotInArgs[k] = v;
                        }
                    });

                    return new InferenceResult(
                        new t.FunctionType(types.concat(value.type)),
                        constraintsFromAssumptions,
                        assumptionsNotInArgs
                    ).withConstraints(value.constraints);
                }));
            });

        },
        visitLet: function() {
            return State.get.chain(function(state) {
                return generateBody(node.value).chain(function(values) {
                    return generateBody(node.body).chain(function(body) {
                        var value,
                            assumptionsWithoutLet,
                            constraintsFromLet,
                            result;

                        if(!body.length) {
                            return freshVariable.map(function(type) {
                                return new InferenceResult(type);
                            });
                        }

                        value = InferenceResult.concat(values);
                        result = InferenceResult.concat(body);
                        assumptionsWithoutLet = _.omit(
                            result.assumptions,
                            node.name
                        );
                        constraintsFromLet = _.map(result.assumptions[node.name], function(assumption) {
                            return new ImplicitConstraint(
                                assumption,
                                value.type,
                                state.monomorphic,
                                node
                            );
                        });

                        return State.of(
                            value
                                .withConstraints(constraintsFromLet)
                                .withConstraints(result.constraints)
                                .withAssumptions(assumptionsWithoutLet)
                                .withPredicates(result.predicates)
                                .withType(result.type)
                        );
                    });
                });
            });
        },
        visitData: function() {
            // TODO: Data using data
            return State.get.chain(function(state) {
                return generateBody(node.body).chain(function(values) {
                    var body,
                        assumptionsWithoutTags;

                    if(!values.length) {
                        return freshVariable.map(function(type) {
                            return new InferenceResult(type);
                        });
                    }

                    body = InferenceResult.concat(values);
                    assumptionsWithoutTags = _.omit(
                        body.assumptions,
                        _.pluck(node.tags, 'name')
                    );
                    return _.reduce(
                        node.tags,
                        function(accum, tag) {
                            return accum.chain(function(constraints) {
                                var argNames = _.pluck(node.args, 'name');
                                return arraySequence(_.map(node.args, function(arg) {
                                    return freshVariable;
                                })).chain(function(types) {
                                    var vars = {},
                                        tagType;

                                    _.each(tag.vars, function(v) {
                                        var index = argNames.indexOf(v.value);
                                        vars[v.value] = index != -1 ? types[index] : (function() {
                                            throw new Error("TODO: Data declaration using another declaration");
                                        })();
                                    });

                                    return arraySequence(_.map(node.args, function(a) {
                                        return _.has(vars, a.name) ? State.of(vars[a.name]) : freshVariable;
                                    })).map(function(types) {
                                        var tagType = new t.TagType(node.name, types);
                                        return constraints.concat(
                                            _.map(body.assumptions[tag.name], function(assumption) {
                                                return new ImplicitConstraint(
                                                    assumption,
                                                    new t.FunctionType(_.values(vars).concat(tagType)),
                                                    state.monomorphic,
                                                    node
                                                );
                                            })
                                        );
                                    });
                                });
                            });
                        },
                        State.of([])
                    ).map(function(constraintsFromTags) {
                        return new InferenceResult(body.type, constraintsFromTags, assumptionsWithoutTags)
                            .withConstraints(body.constraints);
                    });
                });
            });
        },
        visitMatch: function() {
            return freshVariable.chain(function(casesType) {
                return memoizedGenerate(node.value).chain(function(value) {
                    return _.reduce(
                        node.cases,
                        function(accum, c) {
                            return accum.chain(function(result) {
                                return arraySequence(_.map(c.pattern.vars, function() {
                                    return freshVariable;
                                })).chain(function(types) {
                                    var patternAssumptions = {};
                                    patternAssumptions[c.pattern.tag.value] = [
                                        new t.FunctionType(types.concat([value.type]))
                                    ];
                                    return inMonomorphic(types, memoizedGenerate(c.value).map(function(caseValue) {
                                        var assumptionsWithoutVars,
                                            caseConstraints;

                                        assumptionsWithoutVars = _.pick(
                                            caseValue.assumptions,
                                            _.difference(
                                                _.keys(caseValue.assumptions),
                                                _.pluck(c.pattern.vars, 'value')
                                            )
                                        );
                                        caseConstraints = _.reduce(
                                            c.pattern.vars,
                                            function(accum, varName) {
                                                return {
                                                    index: accum.index + 1,
                                                    constraints: accum.constraints.concat(_.map(
                                                        caseValue.assumptions[varName.value],
                                                        function(assumption) {
                                                            return new EqualityConstraint(
                                                                assumption,
                                                                types[accum.index],
                                                                node
                                                            );
                                                        }
                                                    ))
                                                };
                                            },
                                            {
                                                index: 0,
                                                constraints: []
                                            }
                                        ).constraints;

                                        return result
                                            .withAssumptions(assumptionsWithoutVars)
                                            .withAssumptions(patternAssumptions)
                                            .withConstraints(caseConstraints)
                                            .withConstraints(caseValue.constraints)
                                            .withConstraints([
                                                new EqualityConstraint(
                                                    caseValue.type,
                                                    casesType,
                                                    node
                                                )
                                            ]);
                                    }));
                                });
                            });
                        },
                        State.of(value.withType(casesType))
                    );
                });
            });
        },
        visitDo: function() {
            throw new Error("TODO: Do");
        },
        visitIfThenElse: function() {
            return memoizedGenerate(node.condition).chain(function(condition) {
                return generateBody(node.ifTrue).chain(function(ifTrue) {
                    return generateBody(node.ifFalse).map(function(ifFalse) {
                        var trueResult = InferenceResult.concat(ifTrue),
                            falseResult = InferenceResult.concat(ifFalse);
                        return condition
                            .append(trueResult)
                            .append(falseResult)
                            .withConstraints([
                                new EqualityConstraint(
                                    condition.type,
                                    new t.BooleanType(),
                                    node
                                ),
                                new EqualityConstraint(
                                    trueResult.type,
                                    falseResult.type,
                                    node
                                )
                            ]);
                    });
                });
            });
        },
        visitPropertyAccess: function() {
            return freshVariable.chain(function(type) {
                return freshVariable.chain(function(row) {
                    return memoizedGenerate(node.value).map(function(value) {
                        var objectTypes = {};
                        objectTypes[node.property] = type;
                        return value
                            .withConstraints([
                                new EqualityConstraint(
                                    value.type,
                                    new t.RowObjectType(
                                        row,
                                        objectTypes
                                    ),
                                    node
                                )
                            ])
                            .withType(type);
                    });
                });
            });
        },
        visitAccess: function() {
            return freshVariable.chain(function(type) {
                return memoizedGenerate(node.value).chain(function(value) {
                    return memoizedGenerate(node.property).map(function(property) {
                        return value
                            .append(property)
                            .withConstraints([
                                new EqualityConstraint(
                                    value.type,
                                    new t.ArrayType(type),
                                    node
                                ),
                                new EqualityConstraint(
                                    property.type,
                                    new t.NumberType(),
                                    node
                                )
                            ])
                            .withType(type);
                    });
                });
            });
        },
        visitType: function() {
            throw new Error("TODO: Type");
        },
        visitTypeClass: function() {
            return generateBody(node.body).chain(function(body) {
                var result,
                    assumptionsWithoutTypeClass,
                    constraintPredicates = [];

                if(!body.length) {
                    return freshVariable.map(function(type) {
                        return new InferenceResult(type);
                    });
                }

                result = InferenceResult.concat(body);
                assumptionsWithoutTypeClass = _.omit(
                    result.assumptions,
                    _.keys(node.types)
                );

                _.each(node.types, function(typeNode, name) {
                    if(!result.assumptions[name]) return;

                    _.each(result.assumptions[name], function(assumption) {
                        constraintPredicates.push(freshVariable.chain(function(type) {
                            var bindings = {};
                            bindings[node.generic.value] = type;
                            return nodeToType(typeNode, bindings).map(function(ascribedType) {
                                return {
                                    predicate: {type: type, assumption: assumption, name: node.name},
                                    constraint: new EqualityConstraint(assumption, ascribedType, node)
                                };
                            });
                        }));
                    });
                });

                return arraySequence(constraintPredicates).map(function(cps) {
                    var constraints = _.pluck(cps, 'constraint'),
                        predicates = _.pluck(cps, 'predicate');

                    return new InferenceResult(result.type)
                        .withConstraints(result.constraints)
                        .withAssumptions(assumptionsWithoutTypeClass)
                        .withPredicates(result.predicates)
                        .withInstances(result.instances)
                        .withPredicates(predicates)
                        .withConstraints(constraints);
                });
            });
        },
        visitInstance: function() {
            return generateBody(node.body).chain(function(values) {
                return nodeToType(node.typeName, {}).map(function(type) {
                    var instance = {
                        name: node.name,
                        typeClassName: node.typeClassName,
                        type: type
                    };

                    // TODO: Type check bodies

                    return InferenceResult.concat(values)
                        .withInstances([instance]);
                });
            });
        },

        visitExpression: function() {
            return memoizedGenerate(node.value);
        },
        visitBinaryNumberOperator: function() {
            return memoizedGenerate(node.left).chain(function(a) {
                return memoizedGenerate(node.right).map(function(b) {
                    return a.append(b)
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
                        ])
                        .withType(new t.NumberType());
                });
            });
        },
        visitBinaryStringOperator: function() {
            return memoizedGenerate(node.left).chain(function(a) {
                return memoizedGenerate(node.right).map(function(b) {
                    return a.append(b)
                        .withConstraints([
                            new EqualityConstraint(
                                a.type,
                                new t.StringType(),
                                node
                            ),
                            new EqualityConstraint(
                                b.type,
                                new t.StringType(),
                                node
                            )
                        ])
                        .withType(new t.StringType());
                });
            });
        },
        visitBinaryGenericOperator: function() {
            return memoizedGenerate(node.left).chain(function(a) {
                return memoizedGenerate(node.right).map(function(b) {
                    return a.append(b)
                        .withConstraints([
                            new EqualityConstraint(
                                a.type,
                                b.type,
                                node
                            )
                        ])
                        .withType(new t.BooleanType());
                });
            });
        },
        visitUnaryBooleanOperator: function() {
            return memoizedGenerate(node.value).map(function(value) {
                return value
                    .withConstraints([
                        new EqualityConstraint(
                            value.type,
                            new t.BooleanType(),
                            node
                        )
                    ])
                    .withType(new t.BooleanType());
            });
        },
        visitWith: function() {
            return freshVariable.chain(function(type) {
                return memoizedGenerate(node.left).chain(function(a) {
                    return memoizedGenerate(node.right).map(function(b) {
                        var rowType = new t.RowObjectType(type, {});
                        return a.append(b)
                            .withConstraints([
                                new EqualityConstraint(rowType, a.type, node),
                                new EqualityConstraint(rowType, b.type, node)
                            ])
                            .withType(rowType);
                    });
                });
            });
        },

        visitObject: function() {
            var objectValues = _.values(node.values);

            if(!objectValues.length) {
                return freshVariable.map(function(type) {
                    return new InferenceResult(new t.ObjectType({}));
                });
            }

            return generateBody(objectValues).map(function(values) {
                return InferenceResult
                    .concat(values)
                    .withType(new t.ObjectType(_.object(_.keys(node.values), _.pluck(values, 'type'))));
            });
        },
        visitArray: function() {
            return freshVariable.chain(function(type) {
                if(!node.values.length) {
                    return State.of(new InferenceResult(new t.ArrayType(type)));
                }

                return generateBody(node.values).map(function(values) {
                    var equalityConstraints = _.map(values, function(v) {
                        return new EqualityConstraint(v.type, type, node);
                    });
                    return InferenceResult.concat(values)
                        .withConstraints(equalityConstraints)
                        .withType(new t.ArrayType(type));
                });
            });
        },
        visitTuple: function() {
            throw new Error("TODO: Tuple");
        },
        visitBoolean: function() {
            return State.of(new InferenceResult(new t.BooleanType()));
        },
        visitNumber: function() {
            return State.of(new InferenceResult(new t.NumberType()));
        },
        visitString: function() {
            return State.of(new InferenceResult(new t.StringType()));
        }
    });
}
exports.generate = generate;

function freeTypeVariables(typeNode) {
    return typeNode.accept({
        visitGeneric: function() {
            return [typeNode.value];
        },
        visitTypeFunction: function() {
            return [].concat.apply([], _.map(typeNode.args, freeTypeVariables));
        },
        visitTypeName: function() {
            return [];
        },
        visitTypeArray: function() {
            throw new Error("TODO: visitTypeArray");
        },
        visitTypeObject: function() {
            throw new Error("TODO1: visitTypeObject");
        }
    });
}

function nodeToType(node, bindings) {
    return arraySequence(_.map(freeTypeVariables(node), function(name) {
        if(bindings[name]) {
            return State.of([name, bindings[name]]);
        }

        return freshVariable.map(function(varType) {
            return [name, varType];
        });
    })).map(function(namedVars) {
        var bindings = _.object(namedVars);

        function recurse(node) {
            return node.accept({
                visitGeneric: function() {
                    return bindings[node.value];
                },
                visitTypeFunction: function() {
                    return new t.FunctionType(_.map(node.args, recurse));
                },
                visitTypeName: function() {
                    if(!node.args.length) {
                        switch(node.value) {
                        case 'String':
                            return new t.StringType();
                        case 'Number':
                            return new t.NumberType();
                        case 'Boolean':
                            return new t.BooleanType();
                        case 'Unit':
                            return new t.UnitType();
                        }
                    }
                    // TODO: Lookup name from aliases and data
                    throw new Error("TODO: visitTypeName");
                },
                visitTypeArray: function() {
                    throw new Error("TODO: visitTypeArray");
                },
                visitTypeObject: function() {
                    throw new Error("TODO: visitTypeObject");
                }
            });
        }

        return recurse(node);
    });
}

function tails(xs) {
    return _.map(_.range(xs.length), function(i) {
        return xs.slice(i);
    });
}

function isSolvable(constraints) {
    // Find first unsolvable.
    return !_.find(tails(constraints), function(tail) {
        var constraint = tail[0],
            rest = tail.slice(1),
            solvable = constraint.cata(function() {
                // Equality
                return true;
            }, function() {
                // Implicit
                return !_.intersection(
                    _.difference(
                        free(constraint.b),
                        constraint.monomorphic
                    ),
                    _.union.apply(_, _.map(rest, active))
                ).length;
            }, function() {
                // Explicit
                return true;
            });

        return !solvable;
    });
}

function solve(constraints) {
    // Constraints need to be in a particular order to be solvable.
    // Randomly shuffle the constraints until in an order that is solvable.
    // TODO: Don't use bogosort.
    var solvableConstraints = (function() {
            var groupedConstraints = _.groupBy(constraints, function(constraint) {
                    return constraint.cata(function() {
                        return 'other';
                    }, function() {
                        return 'implicit';
                    }, function() {
                        return 'other';
                    });
                }),
                implicitConstraints = groupedConstraints.implicit || [];

            while(!isSolvable(implicitConstraints)) {
                implicitConstraints = _.shuffle(implicitConstraints);
            }

            return (groupedConstraints.other || []).concat(implicitConstraints);
        })(),
        rest = solvableConstraints.slice(1),
        constraint;

    if(!constraints.length)
        return State.of({});

    if(!solvableConstraints)
        throw new Error('Unsolvable constraints');

    constraint = solvableConstraints[0];
    return constraint.cata(function() {
        // Equality constraints
        // Use the Most General Unifier (mgu)
        var m = mostGeneralUnifier(constraint.a, constraint.b, constraint.node);
        return solve(_.map(rest, function(r) {
            return constraintSubstitute(m, r, constraint.node);
        })).map(function(s) {
            var r = {};
            _.each(_.extend(m, s), function(v, k) {
                r[k] = typeSubstitute(s, v);
            });
            return r;
        });
    }, function() {
        // Implicit constraints
        return solve([new ExplicitConstraint(
            constraint.a,
            generalize(constraint.b, constraint.monomorphic),
            constraint.node
        )].concat(rest));
    }, function() {
        // Explicit constraints
        return instantiate(constraint.scheme).chain(function(scheme) {
            return solve([new EqualityConstraint(
                constraint.a,
                scheme,
                constraint.node
            )].concat(rest));
        });
    });
}

function free(type) {
    if(type instanceof t.Variable) {
        return [type.id];
    } else if(type instanceof t.FunctionType) {
        return [].concat.apply([], _.map(type.types, free));
    } else if(type instanceof t.ObjectType) {
        return [].concat.apply([], _.map(type.props, free));
    } else if(type instanceof t.RowObjectType) {
        return free(type.row).concat.apply([], _.map(type.props, free));
    } else if(type instanceof t.ArrayType) {
        return free(type.type);
    } else if(type instanceof t.TagType) {
        return [].concat.apply([], _.map(type.vars, free));
    }
    return [];
}

function instantiate(scheme) {
    var ids = _.keys(scheme.s);
    return arraySequence(_.map(scheme.s, function(id) {
        return freshVariable.map(function(type) {
            return [id, type];
        });
    })).map(function(substitutions) {
        return typeSubstitute(_.object(substitutions), scheme.t);
    });
}

function generalize(type, monomorphic) {
    return new Scheme(_.difference(free(type), monomorphic), type);
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
    function typeError() {
        throw new Error('Type error on line ' + node.lineno + ': ' + b.toString() + ' is not ' + a.toString());
    }

    if(a instanceof t.Variable) {
        return variableBind(a, b);
    } else if(b instanceof t.Variable) {
        return variableBind(b, a);
    } else if(a instanceof t.FunctionType && b instanceof t.FunctionType && a.types.length == b.types.length) {
        return _.reduce(_.zip(a.types, b.types), function(accum, pair) {
            var a = typeSubstitute(accum, pair[0]),
                b = typeSubstitute(accum, pair[1]);
            return _.extend(accum, mostGeneralUnifier(a, b, node));
        }, {});
    } else if(a instanceof t.RowObjectType && b instanceof t.RowObjectType) {
        return mostGeneralUnifier(a, b.row, node);
    } else if(a instanceof t.RowObjectType && b instanceof t.ObjectType) {
        return (function(row, props, keys) {
            while(row instanceof t.RowObjectType) {
                props.push(row.props);
                keys = keys.concat(_.keys(row.props));
                row = row.row;
            }

            if(_.difference(keys, _.keys(b.props)).length)
                typeError();

            return _.reduce(props, function(accum, prop) {
                return _.reduce(_.keys(prop), function(accum, key) {
                    var c = typeSubstitute(accum, prop[key]),
                        d = typeSubstitute(accum, b.props[key]);

                    return _.extend(accum, mostGeneralUnifier(c, d, node));
                }, accum);
            }, {});
        })(a, [], []);
    } else if(a instanceof t.ArrayType && b instanceof t.ArrayType) {
        return mostGeneralUnifier(a.type, b.type);
    } else if(a instanceof t.TagType && b instanceof t.TagType && a.name == b.name && a.vars.length == b.vars.length) {
        return _.reduce(_.range(a.vars.length), function(accum, i) {
            return _.extend(
                accum,
                mostGeneralUnifier(a.vars[i], b.vars[i], node)
            );
        }, {});
    } else if(a instanceof t.NumberType && b instanceof t.NumberType) {
        return {};
    } else if(a instanceof t.StringType && b instanceof t.StringType) {
        return {};
    } else if(a instanceof t.BooleanType && b instanceof t.BooleanType) {
        return {};
    }
    typeError();
}

function active(constraint) {
    return constraint.cata(function() {
        // Equality
        return _.union(
            free(constraint.a),
            free(constraint.b)
        );
    }, function() {
        // Implicit
        return _.union(
            free(constraint.a),
            _.intersection(
                constraint.monomorphic,
                free(constraint.b)
            )
        );
    }, function() {
        // Explicit
        return _.union(
            free(constraint.a),
            _.difference(
                free(constraint.scheme.t),
                constraint.scheme.s
            )
        );
    });
}

function constraintSubstitute(substitutions, constraint) {
    return constraint.cata(function() {
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
            schemeSubstitute(substitutions, constraint.scheme),
            constraint.node
        );
    });
}

function schemeSubstitute(substitutions, scheme) {
    var substitutionsWithoutScheme = {};

    _.each(substitutions, function(v, k) {
        if(_.contains(scheme.s, k)) return;
        substitutionsWithoutScheme[k] = v;
    });

    return new Scheme(
        scheme.s,
        typeSubstitute(substitutionsWithoutScheme, scheme.t)
    );
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
    } else if(type instanceof t.RowObjectType) {
        substituted = {};
        _.each(type.props, function(v, k) {
            substituted[k] = typeSubstitute(substitutions, v);
        });
        return new t.RowObjectType(typeSubstitute(substitutions, type.row), substituted);
    } else if(type instanceof t.TagType) {
        return new t.TagType(type.name, _.map(type.vars, function(v) {
            return typeSubstitute(substitutions, v);
        }));
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

function calculateAttribute(substitutions, predicates, instances, node) {
    var type = typeSubstitute(substitutions, node.attribute.type),
        foundPredicate = _.find(predicates, function(predicate) {
            return predicate.assumption == node.attribute.type;
        }),
        foundInstance = _.find(instances, function(instance) {
            var foundType,
                instanceType;

            if(!foundPredicate) return false;

            foundType = typeSubstitute(substitutions, foundPredicate.type);

            // TODO: Propagate predicates
            if(foundType instanceof t.Variable)
                throw new Error("Trying to find instance of " + instance.typeClassName + " for " + foundType.toString());

            instanceType = typeSubstitute(substitutions, instance.type);

            // TODO: Make MGU better
            try {
                return mostGeneralUnifier(foundType, instanceType);
            } catch(e) {
                return false;
            }
        });

    if(foundPredicate && !foundInstance) {
        throw new Error("Couldn't find instance for " + typeSubstitute(substitutions, foundPredicate.toString()));
    }

    return {
        type: type,
        witness: foundInstance && foundInstance.name
    };
}

// Run inference on an array of AST nodes.
function typecheck(module) {
    return module.extend(memoizedGenerate).sequence(State).chain(function(result) {
        return solve(result.attribute.constraints).map(function(substitutions) {
            return result.extend(function(node) {
                var predicates = result.attribute.predicates,
                    instances = result.attribute.instances;
                return calculateAttribute(substitutions, predicates, instances, node);
            });
        });
    }).evalState(GenerateState.init);
}
exports.typecheck = typecheck;
