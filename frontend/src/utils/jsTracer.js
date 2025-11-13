// NOTE: Do NOT import runJsCode here. It is defined below.

export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 2000;

  const initFunc = (interpreter, globalObject) => {
    const logWrapper = (text) => {
      // Capture the current state *before* outputting, or use the last state
      const lastSnap = trace.length > 0 ? trace[trace.length - 1] : { stack: [], heap: {}, line_number: 0 };
      
      trace.push({
        event: 'output',
        data: text + '\n',
        stack: lastSnap.stack, // Persist stack so visualization doesn't disappear
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
    // Ensure window.Interpreter exists (loaded via index.html)
    if (!window.Interpreter) {
        throw new Error("JS-Interpreter not loaded. Check index.html");
    }

    const myInterpreter = new window.Interpreter(code, initFunc);

    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;
      
      if (myInterpreter.stateStack.length === 0) break;

      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;
      
      // Capture state only on meaningful execution nodes
      if (node.start && node.end && (
          node.type === 'VariableDeclaration' || 
          node.type === 'ExpressionStatement' || 
          node.type === 'ReturnStatement' ||
          node.type === 'ForStatement' ||
          node.type === 'WhileStatement' || 
          node.type === 'IfStatement' ||
          node.type === 'FunctionDeclaration' ||
          node.type === 'CallExpression'
      )) { 
        const snapshot = captureState(myInterpreter, node);
        
        // Deduplicate steps on the same line to reduce visualization noise
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
  
  // Iterate stack to build frames (Bottom-up approach)
  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    if (state.scope) {
      let funcName = '<global>';
      if (state.func_ && state.func_.name) {
          funcName = state.func_.name;
      } else if (state.func_) {
          funcName = 'anonymous';
      }

      // Clean up the root name for the visualizer
      if (i === 0 && (funcName === 'anonymous' || !state.func_)) {
          funcName = 'Global Frame';
      }

      const locals = {};
      let scope = state.scope;
      
      // Capture variables in the current scope
      if (scope) {
        for (const key in scope.properties) {
          // Filter out internal JS interpreter noise
          if (key === 'arguments' || key === 'this' || key === 'window' || key === 'console' || key === 'print') continue;
          
          const pseudoVal = scope.properties[key];
          const formatted = formatValue(pseudoVal, heap, interpreter);
          locals[key] = formatted;
        }
      }

      // Only push the frame if it's meaningful (has a name change or is global)
      // This prevents duplicate frames for internal block scopes
      const lastFrame = stack[stack.length - 1];
      if (!lastFrame || lastFrame.func_name !== funcName) {
          stack.push({
            func_name: funcName,
            lineno: node.loc ? node.loc.start.line : 0,
            locals: locals
          });
      }
    }
  }
  
  // REVERSE the stack to match the Python tracer's "Top-Down" order
  // The visualizer expects the current function at the TOP (index 0 or end depending on logic).
  // Python tracer reverses it. So we reverse it here to match.
  stack.reverse();

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack,
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined) return { value: 'undefined' };
  if (pseudoVal === null) return { value: 'null' };

  // Handle Primitives
  if (interpreter.isa(pseudoVal, interpreter.BOOLEAN)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.NUMBER)) return { value: String(pseudoVal.data) };
  if (interpreter.isa(pseudoVal, interpreter.STRING)) return { value: `"${pseudoVal.data}"` };

  // Handle Objects (Arrays/Dicts)
  if (interpreter.isa(pseudoVal, interpreter.OBJECT)) {
    // Generate a unique ID for the Heap
    const id = pseudoVal.id || String(Math.random()); 
    pseudoVal.id = id; 

    let type = 'object';
    let value = []; 
    
    if (interpreter.isa(pseudoVal, interpreter.ARRAY)) {
      type = 'list'; // Use 'list' to match Python visualizer logic
      const length = pseudoVal.properties.length;
      for (let i = 0; i < length; i++) {
        value.push(formatValue(pseudoVal.properties[i], heap, interpreter));
      }
    } else {
      type = 'dict'; // Use 'dict' for objects
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