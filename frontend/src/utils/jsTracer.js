export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 1000; // Prevent infinite loops

  // 1. Initialize the Interpreter
  const initFunc = (interpreter, globalObject) => {
    // Add 'print' or 'console.log' support
    const logWrapper = (text) => {
      // We treat output as a special event, just like Python
      trace.push({
        event: 'output',
        data: text + '\n',
      });
    };
    interpreter.setProperty(globalObject, 'console', 
      interpreter.nativeToPseudo({ log: logWrapper }));
    interpreter.setProperty(globalObject, 'print', 
      interpreter.createNativeFunction(logWrapper));
  };

  try {
    const myInterpreter = new window.Interpreter(code, initFunc);

    // 2. Step through the code
    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;
      
      // Only capture snapshots on new lines (ignoring internal steps)
      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      // 'CallExpression' and 'VariableDeclaration' are good places to snapshot
      if (node.start && node.end) { 
        const snapshot = captureState(myInterpreter, node);
        
        // Optimization: Don't save duplicate steps for the same line
        const lastSnap = trace[trace.length - 1];
        if (!lastSnap || lastSnap.line_number !== snapshot.line_number) {
           trace.push(snapshot);
        }
      }
    }
  } catch (e) {
    trace.push({
      event: 'error',
      error_type: 'RuntimeError',
      error_message: e.toString(),
    });
  }

  return trace;
}

// --- Helper: Convert Interpreter State to Our JSON Format ---
function captureState(interpreter, node) {
  const stack = [];
  const heap = {};

  // 1. Walk up the interpreter's stack
  // Note: JS-Interpreter stack is internal, we iterate it to find scopes
  let stateStack = interpreter.stateStack;
  
  // This part simplifies the interpreter's complex stack into our "Frame" format
  // We look for states that have a 'scope' property
  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    if (state.scope) {
      const funcName = state.func_ ? state.func_.name : '<global>';
      const locals = {};
      
      // Extract variables from the scope
      let scope = state.scope;
      while (scope) {
        for (const key in scope.properties) {
          if (key === 'arguments') continue; // Skip internal noise
          
          const pseudoVal = scope.properties[key];
          const formatted = formatValue(pseudoVal, heap, interpreter);
          locals[key] = formatted;
        }
        // Only look at the immediate scope for this frame, not parents
        break; 
      }

      stack.push({
        func_name: funcName || 'anonymous',
        lineno: node.loc ? node.loc.start.line : 0, // Requires source locations
        locals: locals
      });
    }
  }

  // JS-Interpreter builds stack bottom-up, we want top-down? 
  // Actually your visualizer expects top-down (current frame last).
  // Let's keep it simple for now.

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack,
    heap: heap
  };
}

// --- Helper: Recursive Value Formatter ---
function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined) return { value: 'undefined' };
  if (pseudoVal === null) return { value: 'null' };

  // Primitives
  if (interpreter.isa(pseudoVal, interpreter.BOOLEAN)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.NUMBER)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.STRING)) return { value: `"${pseudoVal.data}"` };

  // Complex Objects (Arrays/Objects) -> Add to Heap
  if (interpreter.isa(pseudoVal, interpreter.OBJECT)) {
    const id = String(Math.random()); // Simple unique ID generation
    
    // Avoid infinite recursion for circular refs (basic check)
    // In a real app, you'd check if object is already in heap
    
    let type = 'object';
    let value = []; // For lists
    
    if (interpreter.isa(pseudoVal, interpreter.ARRAY)) {
      type = 'list';
      const length = pseudoVal.properties.length;
      for (let i = 0; i < length; i++) {
        value.push(formatValue(pseudoVal.properties[i], heap, interpreter));
      }
    } else {
      type = 'dict'; // Represent JS objects as dicts
      // We'd map properties here... keeping it simple for V1
      value = "Object"; 
    }

    heap[id] = { type, value };
    return { ref: id };
  }

  return { value: 'unknown' };
}