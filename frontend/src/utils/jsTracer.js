export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 2000; // Increased limit for safety

  const initFunc = (interpreter, globalObject) => {
    const logWrapper = (text) => {
      // Capture the current state *before* outputting, or at least preserve the last state
      const lastSnap = trace.length > 0 ? trace[trace.length - 1] : { stack: [], heap: {} };
      
      trace.push({
        event: 'output',
        data: text + '\n',
        stack: lastSnap.stack, // Persist the stack for the output step
        heap: lastSnap.heap,   // Persist the heap for the output step
        line_number: lastSnap.line_number 
      });
    };

    interpreter.setProperty(globalObject, 'console', 
      interpreter.nativeToPseudo({ log: logWrapper }));
    interpreter.setProperty(globalObject, 'print', 
      interpreter.createNativeFunction(logWrapper));
  };

  try {
    const myInterpreter = new window.Interpreter(code, initFunc);

    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;
      
      // Safety check: if the stack is empty, we might be done or in a weird state
      if (myInterpreter.stateStack.length === 0) break;

      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      // Capture state on statement-level nodes
      if (node.start && node.end && (
          node.type === 'VariableDeclaration' || 
          node.type === 'ExpressionStatement' || 
          node.type === 'ReturnStatement' ||
          node.type === 'ForStatement' ||
          node.type === 'WhileStatement' || // Added WhileStatement
          node.type === 'IfStatement' ||
          node.type === 'FunctionDeclaration' ||
          node.type === 'CallExpression' // Added CallExpression for function calls
      )) { 
        const snapshot = captureState(myInterpreter, node);
        
        // Filter duplicates based on line number to reduce noise
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
  
  // Iterate through the stack to build frames
  // JS-Interpreter stack grows with execution. 
  // We want to capture user-defined functions and the global scope.
  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    if (state.scope) {
      let funcName = '<global>';
      if (state.func_ && state.func_.name) {
          funcName = state.func_.name;
      } else if (state.func_) {
          funcName = 'anonymous';
      }

      const locals = {};
      
      // Walk the scope chain to get variables accessible in this frame
      let scope = state.scope;
      
      // Only capture the immediate scope variables to mimic Python's frame locals
      if (scope) {
        for (const key in scope.properties) {
          if (key === 'arguments' || key === 'this' || key === 'window' || key === 'console' || key === 'print') continue;
          
          const pseudoVal = scope.properties[key];
          const formatted = formatValue(pseudoVal, heap, interpreter);
          locals[key] = formatted;
        }
      }

      stack.push({
        func_name: funcName,
        lineno: node.loc ? node.loc.start.line : 0,
        locals: locals
      });
    }
  }
  
  // Reverse stack to match the visualizer's expectation (Global at bottom/start, current at top/end? 
  // actually your visualizer iterates: Global Frame, then others. 
  // JS Interpreter stack is [Global, Call1, Call2]. This order is correct for your visualizer loop.
  
  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack,
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined) return { value: 'undefined' };
  if (pseudoVal === null) return { value: 'null' };

  // Primitives
  if (interpreter.isa(pseudoVal, interpreter.BOOLEAN)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.NUMBER)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.STRING)) return { value: `"${pseudoVal.data}"` };

  // Complex Objects
  if (interpreter.isa(pseudoVal, interpreter.OBJECT)) {
    // Use the object's internal ID if available, or generate one
    const id = pseudoVal.id || String(Math.random()); 
    pseudoVal.id = id; // Persist ID to track object identity across steps

    let type = 'object';
    let value = []; 
    
    if (interpreter.isa(pseudoVal, interpreter.ARRAY)) {
      type = 'list'; // Match Python type name for visualizer compatibility
      const length = pseudoVal.properties.length;
      for (let i = 0; i < length; i++) {
        value.push(formatValue(pseudoVal.properties[i], heap, interpreter));
      }
    } else {
      type = 'dict'; 
      // Extract object properties
      value = {}; // Change to object for dicts
      // iterate over properties
      // In JS-Interpreter, properties are in .properties dict
      for (const key in pseudoVal.properties) {
          value[key] = formatValue(pseudoVal.properties[key], heap, interpreter);
      }
    }

    // Only add to heap if not already processed to avoid infinite recursion issues in simple cases
    // (Full circular ref handling would need a 'visited' set in formatValue)
    heap[id] = { type, value };
    return { ref: id };
  }

  return { value: String(pseudoVal) };
}