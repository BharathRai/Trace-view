export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 5000;

  const initFunc = (interpreter, globalObject) => {
    const logWrapper = (text) => {
      const lastSnap = trace.length > 0 ? trace[trace.length - 1] : { stack: [], heap: {}, line_number: 0 };
      trace.push({
        event: 'output',
        data: text + '\n',
        stack: lastSnap.stack,
        heap: lastSnap.heap,
        line_number: lastSnap.line_number
      });
    };

    interpreter.setProperty(globalObject, 'console', 
      interpreter.nativeToPseudo({ log: logWrapper }));
    interpreter.setProperty(globalObject, 'print', 
      interpreter.createNativeFunction(logWrapper));
  };

  try {
    if (!window.Interpreter || !window.acorn) {
        throw new Error("JS-Interpreter or Acorn not loaded. Check index.html");
    }

    const myInterpreter = new window.Interpreter(code, initFunc);

    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;
      
      if (myInterpreter.stateStack.length === 0) break;

      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      // Capture state on meaningful nodes
      if (node.start && node.end && (
          node.type === 'VariableDeclaration' || 
          node.type === 'ExpressionStatement' || 
          node.type === 'ReturnStatement' ||
          node.type === 'ForStatement' ||
          node.type === 'WhileStatement' || 
          node.type === 'IfStatement' ||
          node.type === 'FunctionDeclaration' ||
          node.type === 'CallExpression' ||
          node.type === 'UpdateExpression' || 
          node.type === 'AssignmentExpression'
      )) { 
        const snapshot = captureState(myInterpreter, node);
        
        const lastSnap = trace[trace.length - 1];
        if (!lastSnap || lastSnap.line_number !== snapshot.line_number) {
           trace.push(snapshot);
        }
      }
    }
  } catch (e) {
    console.error("JS Trace Error:", e);
    trace.push({
      event: 'error',
      error_type: 'RuntimeError',
      error_message: e.toString(),
      stack: [],
      heap: {}
    });
  }

  return trace;
}

function captureState(interpreter, node) {
  const stack = [];
  const heap = {};
  let stateStack = interpreter.stateStack;

  // Use a Map to hold our *visual* frames, keyed by the root function scope
  // This merges all block scopes (if, for) into their parent function.
  const frameMap = new Map();

  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    if (!state.scope) continue;

    // 1. Find the "owner" function scope for this state
    let func = state.func_;
    let funcScope = state.scope;
    
    // Walk up to find the *actual* function this block scope belongs to
    let tempScope = state.scope;
    while (tempScope) {
        if (tempScope.func_) {
            func = tempScope.func_;
            funcScope = tempScope;
            break;
        }
        if (tempScope === interpreter.globalScope) {
            funcScope = tempScope; // Belongs to global
            break;
        }
        tempScope = tempScope.parent;
    }

    // 2. Get the function name
    let funcName = "Global Frame";
    if (func) {
        if (func.name) funcName = func.name;
        // Check the AST node for the function name (e.g., function bubbleSort() {...})
        else if (func.node && func.node.id) funcName = func.node.id.name;
        else funcName = 'anonymous';
    }
    
    // 3. Get or create the visual frame
    if (!frameMap.has(funcScope)) {
        frameMap.set(funcScope, {
            func_name: funcName,
            lineno: node.loc ? node.loc.start.line : 0,
            locals: {}
        });
    }

    // 4. Populate variables from this specific state's scope
    // This loop adds variables from the *immediate* scope (like 'j' in a 'for' loop)
    // to the main function frame we identified.
    const frame = frameMap.get(funcScope);
    for (const key in state.scope.properties) {
        if (['arguments','this','window','console','print'].includes(key)) continue;
        
        // Add if not already present from a deeper scope
        if (frame.locals[key] === undefined) { 
            const val = state.scope.properties[key];
            frame.locals[key] = formatValue(val, heap, interpreter);
        }
    }
  }
  
  // Convert map values to array
  frameMap.forEach(frame => stack.push(frame));

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack, 
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined || pseudoVal === interpreter.UNDEFINED) return { value: 'undefined' };
  if (pseudoVal === null) return { value: 'null' };

  if (interpreter.isa(pseudoVal, interpreter.BOOLEAN)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.NUMBER)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.STRING)) return { value: `"${pseudoVal.data}"` };

  if (interpreter.isa(pseudoVal, interpreter.OBJECT)) {
    const id = pseudoVal.id || String(Math.random()); 
    pseudoVal.id = id; 

    let type = 'object';
    let value = []; 
    
    if (interpreter.isa(pseudoVal, interpreter.ARRAY)) {
      type = 'list'; 
      const length = pseudoVal.properties.length;
      for (let i = 0; i < length; i++) {
        value.push(formatValue(pseudoVal.properties[i], heap, interpreter));
      }
    } else {
      type = 'dict'; 
      value = {}; 
      for (const key in pseudoVal.properties) {
          value[key] = formatValue(pseudoVal.properties[key], heap, interpreter);
      }
    }

    heap[id] = { type, value };
    return { ref: id };
  }

  return { value: String(pseudoVal) };
}