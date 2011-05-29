exports.nodes = {
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
    Function: function(name, args, body, type) {
	this.name = name;
	this.args = args;
	this.body = body;

	// Optional
	this.type = type;

	this.accept = function(a) {
	    if(a.visitFunction) {
		return a.visitFunction(this);
	    }
	};
    },
    Data: function(name) {
	this.name = name;

	this.accept = function(a) {
	    if(a.visitData) {
		return a.visitData(this);
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
	this.value = value;

	this.accept = function(a) {
	    if(a.visitComment) {
		return a.visitComment(this);
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
    Operator: function(name, left, right) {
	this.name = name;
	this.left = left;
	this.right = right;

	this.accept = function(a) {
	    if(a.visitOperator) {
		return a.visitOperator(this);
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