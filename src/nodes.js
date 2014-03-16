var _ = require('underscore'),
    nodes;

function attributedNode(name, properties, sequence, extend) {
    var visitHandle = 'visit' + name;

    function forProperties(f) {
        _.each(properties, function(property, i) {
            f(property, i);
        });
    }

    function create(proto) {
        function Ctor() {
        }
        Ctor.prototype = Attributed.prototype;
        return new Ctor();
    }

    function Attributed() {
        var self = this,
            args = arguments;

        if(!(self instanceof Attributed)) {
            self = create(Attributed.prototype);
        }

        forProperties(function(property, i) {
            self[property] = args[i];
        });

        self.attribute = null;

        return self;
    }
    Attributed._name = name;
    Attributed.prototype.accept = function(a) {
        if(a[visitHandle]) {
            return a[visitHandle](this);
        }
    };
    Attributed.prototype.withAttribute = function(a) {
        var self = this,
            instance = create(Attributed.prototype);

        forProperties(function(property) {
            instance[property] = self[property];
        });

        instance.attribute = a;

        return instance;
    };
    Attributed.prototype.sequence = sequence;
    Attributed.prototype.extend = extend;

    return Attributed;
}

function toObject(nodes) {
    var o = {};
    _.each(nodes, function(node) {
        var name = node._name;
        o[name] = node;
    });
    return o;
}

function singleton(k, v) {
    var r  = {};
    r[k] = v;
    return r;
}

function arrayExtend(as, f) {
    return _.map(as, function(a) {
        return a.extend(f);
    });
}

function arraySequence(A, as, f) {
    var values = A.of([]),
        i;

    function append(value) {
        return function(values) {
            return values.concat([value]);
        };
    }

    _.each(as, function(a) {
        values = f(a).map(append).ap(values);
    });

    return values;
}

function objectSequence(A, o) {
    var object = A.of({}),
        k;

    function setter(k) {
        return function(v) {
            return function(o) {
                return _.extend(
                    o,
                    singleton(k, v)
                );
            };
        };
    }

    _.each(o, function(v, k) {
        object = v.sequence(A).map(setter(k)).ap(object);
    });

    return object;
}

nodes = toObject([
    attributedNode(
        'Module',
        ['body'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(body) {
                    return new nodes.Module(body).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.body, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.Module(arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Function',
        ['arg', 'value', 'whereDecls'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return new nodes.Function(self.arg, value, undefined).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.value, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.Function(this.arg, arrayExtend(this.value, f), this.whereDecls).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Data',
        ['name', 'args', 'tags', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(body) {
                    return new nodes.Data(self.name, self.args, self.tags, body).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.body, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.Data(this.name, this.args, this.tags, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Type',
        ['name', 'value', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(body) {
                    return new nodes.Type(self.name, self.value, body).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.body, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.Type(this.name, this.value, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),

    attributedNode(
        'Generic',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.Generic(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.Generic(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeFunction',
        ['from', 'to'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.TypeFunction(self.from, self.to).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.TypeFunction(this.from, this.to).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeName',
        ['value', 'args'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.TypeName(self.value, self.args).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.TypeName(this.value, this.args).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeRowObject',
        ['row', 'values'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.TypeRowObject(self.row, self.values).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.TypeRowObject(this.row, this.values).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeObject',
        ['values'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.TypeObject(self.values).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.TypeObject(this.values).withAttribute(f(this));
        }
    ),
    attributedNode(
        'TypeArray',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.TypeArray(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.TypeArray(this.value).withAttribute(f(this));
        }
    ),

    attributedNode(
        'Do',
        ['value', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return function(body) {
                        return new nodes.Do(value, body).withAttribute(attribute);
                    };
                };
            }).ap(this.value.sequence(A)).ap(arraySequence(A, this.body, function(a) {
                var value;

                switch(a.type) {
                case 'let':
                    value = arraySequence(A, a.value, function(a) {
                        return a.sequence(A);
                    });
                    break;
                case 'bind':
                case 'expression':
                    value = a.value.sequence(A);
                    break;
                }

                return value.map(function(v) {
                    return _.extend(a, {
                        value: v
                    });
                });
            }));
        },
        function(f) {
            return new nodes.Do(this.value.extend(f), _.map(this.body, function(v) {
                var value;

                switch(v.type) {
                case 'let':
                    value = arrayExtend(v.value, f);
                    break;
                case 'bind':
                case 'expression':
                    value = v.value.extend(f);
                    break;
                }

                return _.extend(v, {
                    value: value
                });
            })).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Match',
        ['value', 'cases'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return function(cases) {
                        return new nodes.Match(value, cases).withAttribute(attribute);
                    };
                };
            }).ap(this.value.sequence(A)).ap(arraySequence(A, this.cases, function(a) {
                return a.value.sequence(A).map(function(v) {
                    return {
                        pattern: a.pattern,
                        value: v
                    };
                });
            }));
        },
        function(f) {
            var cases = _.map(this.cases, function(cas) {
                return {
                    pattern: cas.pattern,
                    value: cas.value.extend(f)
                };
            });
            return new nodes.Match(this.value.extend(f), cases).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Let',
        ['name', 'value', 'type', 'body'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return function(body) {
                        return new nodes.Let(self.name, value, self.type, body).withAttribute(attribute);
                    };
                };
            }).ap(arraySequence(A, this.value, function(a) {
                return a.sequence(A);
            })).ap(arraySequence(A, this.body, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.Let(this.name, arrayExtend(this.value, f), this.type, arrayExtend(this.body, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Call',
        ['func', 'arg'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(func) {
                    return function(arg) {
                        return new nodes.Call(func, arg).withAttribute(attribute);
                    };
                };
            }).ap(this.func.sequence(A)).ap(this.arg.sequence(A));
        },
        function(f) {
            return new nodes.Call(
                this.func.extend(f),
                this.arg.extend(f)
            ).withAttribute(f(this));
        }
    ),
    attributedNode(
        'IfThenElse',
        ['condition', 'ifTrue', 'ifFalse'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(condition) {
                    return function(ifTrue) {
                        return function(ifFalse) {
                            return new nodes.IfThenElse(condition, ifTrue, ifFalse).withAttribute(attribute);
                        };
                    };
                };
            }).ap(this.condition.sequence(A)).ap(arraySequence(A, this.ifTrue, function(a) {
                return a.sequence(A);
            })).ap(arraySequence(A, this.ifFalse, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.IfThenElse(this.condition.extend(f), arrayExtend(this.ifTrue, f), arrayExtend(this.ifFalse, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Comment',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.Comment(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.Comment(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'PropertyAccess',
        ['value', 'property'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return new nodes.PropertyAccess(value, self.property).withAttribute(attribute);
                };
            }).ap(this.value.sequence(A));
        },
        function(f) {
            return new nodes.PropertyAccess(this.value.extend(f), this.property).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Access',
        ['value', 'property'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return new nodes.Access(value, self.property).withAttribute(attribute);
                };
            }).ap(this.value.sequence(A));
        },
        function(f) {
            return new nodes.Access(this.value.extend(f), this.property).withAttribute(f(this));
        }
    ),
    attributedNode(
        'UnaryBooleanOperator',
        ['name', 'value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(value) {
                    return new nodes.BinaryGenericOperator(self.name, value).withAttribute(attribute);
                };
            }).ap(this.value.sequence(A));
        },
        function(f) {
            return new nodes.UnaryBooleanOperator(this.name, this.value.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryGenericOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return new nodes.BinaryGenericOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return new nodes.BinaryGenericOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryNumberOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return new nodes.BinaryNumberOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return new nodes.BinaryNumberOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryBooleanOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return new nodes.BinaryBooleanOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return new nodes.BinaryBooleanOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'BinaryStringOperator',
        ['name', 'left', 'right'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return new nodes.BinaryStringOperator(self.name, left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return new nodes.BinaryStringOperator(this.name, this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'With',
        ['left', 'right'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(left) {
                    return function(right) {
                        return new nodes.With(left, right).withAttribute(attribute);
                    };
                };
            }).ap(this.left.sequence(A)).ap(this.right.sequence(A));
        },
        function(f) {
            return new nodes.With(this.left.extend(f), this.right.extend(f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Identifier',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.Identifier(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.Identifier(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Tuple',
        ['values'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(values) {
                    return new nodes.Tuple(values).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.values, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.Tuple(arrayExtend(this.values, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Number',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.Number(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.Number(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'String',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.String(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.String(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Boolean',
        ['value'],
        function(A) {
            var self = this;
            return this.attribute.map(function(attribute) {
                return new nodes.Boolean(self.value).withAttribute(attribute);
            });
        },
        function(f) {
            return new nodes.Boolean(this.value).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Array',
        ['values'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(values) {
                    return new nodes.Array(values).withAttribute(attribute);
                };
            }).ap(arraySequence(A, this.values, function(a) {
                return a.sequence(A);
            }));
        },
        function(f) {
            return new nodes.Array(arrayExtend(this.values, f)).withAttribute(f(this));
        }
    ),
    attributedNode(
        'Object',
        ['values'],
        function(A) {
            return this.attribute.map(function(attribute) {
                return function(values) {
                    return new nodes.Object(values).withAttribute(attribute);
                };
            }).ap(objectSequence(A, this.values));
        },
        function(f) {
            var values = {};
            _.each(this.values, function(value, key) {
                values[key] = value.extend(f);
            });
            return new nodes.Object(values).withAttribute(f(this));
        }
    )
]);
nodes.MultiFunction = function (args, value, whereDecls) {
    if(args.length > 1) {
        return new nodes.Function(
            args[0],
            [new nodes.MultiFunction(
                args.slice(1),
                value,
                whereDecls
            )]
        );
    } else if(args.length === 1) {
        return new nodes.Function(args[0], value, whereDecls);
    } else {
        throw new Error("Call to nodes.MultiFunction without enough arguments!");
    }
};

module.exports = nodes;
