exports.nodes = {
    Module: function (body) {
        this.body = body;

        this.accept = function(a) {
            if(a.visitModule) {
                return a.visitModule(this);
            }
        };
    },
    Arg: function(name, type) {
        this.name = name;

        // Optional
        this.type = type;

        this.accept = function(a) {
            if(a.visitArg) {
                return a.visitArg(this);
            }
        };
    },
    Function: function(name, args, body, type, whereDecls) {
        this.name = name;
        this.args = args;
        this.body = body;

        // Optional
        this.type = type;
        this.whereDecls = whereDecls || [];

        this.accept = function(a) {
            if(a.visitFunction) {
                return a.visitFunction(this);
            }
        };
    },
    Data: function(name, args, tags) {
        this.name = name;
        this.args = args;
        this.tags = tags;

        this.accept = function(a) {
            if(a.visitData) {
                return a.visitData(this);
            }
        };
    },
    Type: function(name, value) {
        this.name = name;
        this.value = value;

        this.accept = function(a) {
            if(a.visitType) {
                return a.visitType(this);
            }
        };
    },
    TypeClass: function(name, generic, types) {
        this.name = name;
        this.generic = generic;
        this.types = types;

        this.accept = function(a) {
            if(a.visitTypeClass) {
                return a.visitTypeClass(this);
            }
        };
    },
    Instance: function(name, typeClassName, typeName, object) {
        this.name = name;
        this.typeClassName = typeClassName;
        this.typeName = typeName;
        this.object = object;

        this.accept = function(a) {
            if(a.visitInstance) {
                return a.visitInstance(this);
            }
        };
    },
    Generic: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitGeneric) {
                return a.visitGeneric(this);
            }
        };
    },
    TypeFunction: function(args) {
        this.args = args;

        this.accept = function(a) {
            if(a.visitTypeFunction) {
                return a.visitTypeFunction(this);
            }
        };
    },
    TypeName: function(value, args) {
        this.value = value;
        this.args = args;

        this.accept = function(a) {
            if(a.visitTypeName) {
                return a.visitTypeName(this);
            }
        };
    },
    TypeObject: function(values) {
        this.values = values;

        this.accept = function(a) {
            if(a.visitTypeObject) {
                return a.visitTypeObject(this);
            }
        };
    },
    TypeArray: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitTypeArray) {
                return a.visitTypeArray(this);
            }
        };
    },
    Return: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitReturn) {
                return a.visitReturn(this);
            }
        };
    },
    Bind: function(name, value) {
        this.name = name;
        this.value = value;

        // Set in compile stage
        this.rest = [];

        this.accept = function(a) {
            if(a.visitBind) {
                return a.visitBind(this);
            }
        };
    },
    Do: function(value, body) {
        this.value = value;
        this.body = body;

        this.accept = function(a) {
            if(a.visitDo) {
                return a.visitDo(this);
            }
        };
    },
    Match: function(value, cases) {
        this.value = value;
        this.cases = cases;

        this.accept = function(a) {
            if(a.visitMatch) {
                return a.visitMatch(this);
            }
        };
    },
    Case: function(pattern, value) {
        this.pattern = pattern;
        this.value = value;

        this.accept = function(a) {
            if(a.visitCase) {
                return a.visitCase(this);
            }
        };
    },
    Tag: function(name, vars) {
        this.name = name;
        this.vars = vars;

        this.accept = function(a) {
            if(a.visitTag) {
                return a.visitTag(this);
            }
        };
    },
    Pattern: function(tag, vars) {
        this.tag = tag;
        this.vars = vars;

        this.accept = function(a) {
            if(a.visitPattern) {
                return a.visitPattern(this);
            }
        };
    },
    Assignment: function(name, value) {
        this.name = name;
        this.value = value;

        this.accept = function(a) {
            if(a.visitAssignment) {
                return a.visitAssignment(this);
            }
        };
    },
    Let: function(name, value, type) {
        this.name = name;
        this.value = value;

        // Optional
        this.type = type;

        this.accept = function(a) {
            if(a.visitLet) {
                return a.visitLet(this);
            }
        };
    },
    Call: function(func, args) {
        this.func = func;
        this.args = args;

        this.accept = function(a) {
            if(a.visitCall) {
                return a.visitCall(this);
            }
        };
    },
    IfThenElse: function(condition, ifTrue, ifFalse) {
        this.condition = condition;
        this.ifTrue = ifTrue;
        this.ifFalse = ifFalse;

        this.accept = function(a) {
            if(a.visitIfThenElse) {
                return a.visitIfThenElse(this);
            }
        };
    },
    Comment: function(value) {
        this.value = value.slice(2); // Remove the slashes, because escodegen adds those back for us

        this.accept = function(a) {
            if(a.visitComment) {
                return a.visitComment(this);
            }
        };
    },
    PropertyAccess: function(value, property) {
        this.value = value;
        this.property = property;

        this.accept = function(a) {
            if(a.visitPropertyAccess) {
                return a.visitPropertyAccess(this);
            }
        };
    },
    Access: function(value, property) {
        this.value = value;
        this.property = property;

        this.accept = function(a) {
            if(a.visitAccess) {
                return a.visitAccess(this);
            }
        };
    },
    UnaryBooleanOperator: function(name, value) {
        this.name = name;
        this.value = value;

        this.accept = function(a) {
            if(a.visitUnaryBooleanOperator) {
                return a.visitUnaryBooleanOperator(this);
            }
        };
    },
    BinaryGenericOperator: function(name, left, right) {
        this.name = name;
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitBinaryGenericOperator) {
                return a.visitBinaryGenericOperator(this);
            }
        };
    },
    BinaryNumberOperator: function(name, left, right) {
        this.name = name;
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitBinaryNumberOperator) {
                return a.visitBinaryNumberOperator(this);
            }
        };
    },
    BinaryBooleanOperator: function(name, left, right) {
        this.name = name;
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitBinaryBooleanOperator) {
                return a.visitBinaryBooleanOperator(this);
            }
        };
    },
    BinaryStringOperator: function(name, left, right) {
        this.name = name;
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitBinaryStringOperator) {
                return a.visitBinaryStringOperator(this);
            }
        };
    },
    With: function(left, right) {
        this.left = left;
        this.right = right;

        this.accept = function(a) {
            if(a.visitWith) {
                return a.visitWith(this);
            }
        };
    },
    Identifier: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitIdentifier) {
                return a.visitIdentifier(this);
            }
        };
    },
    Tuple: function(values) {
        this.values= values;

        this.accept = function(a) {
            if(a.visitTuple) {
                return a.visitTuple(this);
            }
        };
    },
    Number: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitNumber) {
                return a.visitNumber(this);
            }
        };
    },
    String: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitString) {
                return a.visitString(this);
            }
        };
    },
    Boolean: function(value) {
        this.value = value;

        this.accept = function(a) {
            if(a.visitBoolean) {
                return a.visitBoolean(this);
            }
        };
    },
    Array: function(values) {
        this.values = values;

        this.accept = function(a) {
            if(a.visitArray) {
                return a.visitArray(this);
            }
        };
    },
    Object: function(values) {
        this.values = values;

        this.accept = function(a) {
            if(a.visitObject) {
                return a.visitObject(this);
            }
        };
    }
};
