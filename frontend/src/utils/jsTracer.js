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
    if (!window.Interpreter) {
        throw new Error("JS-Interpreter not loaded. Check index.html");
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
  
  // Track processed scopes to merge block-scopes (like 'for' loops) into their parent function frame
  const processedScopes = new Set();

  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];
    
    if (state.scope && state.func_) {
      // 1. Resolve Function Name
      let funcName = 'anonymous';
      if (state.func_.node && state.func_.node.id) {
          funcName = state.func_.node.id.name;
      } else if (state.func_.name) {
          funcName = state.func_.name;
      }
      if (i === 0) funcName = 'Global Frame';

      // 2. Collect Variables (Walking the Scope Chain)
      // This is the logic that fixes the "empty frame" issue.
      // We start at the current scope and walk UP until we hit the global scope.
      const locals = {};
      let currentScope = state.scope;
      
      while (currentScope) {
          // Stop if we hit the global scope (we handle that in the 'Global Frame' only)
          if (currentScope === interpreter.globalScope && funcName !== 'Global Frame') {
              break;
          }

          if (currentScope.properties) {
              for (const key in currentScope.properties) {
                  if (['arguments', 'this', 'window', 'console', 'print'].includes(key)) continue;
                  
                  // Don't overwrite variables we found in a closer scope
                  if (locals[key] === undefined) {
                      const val = currentScope.properties[key];
                      locals[key] = formatValue(val, heap, interpreter);
                  }
              }
          }
          currentScope = currentScope.parent;
      }

      // 3. Deduplicate Frames
      // If this frame has the same name as the last one, it's likely a block scope (if/for).
      // We update the existing frame with any new variables found.
      const lastFrame = stack[stack.length - 1];
      if (lastFrame && lastFrame.func_name === funcName) {
          Object.assign(lastFrame.locals, locals);
      } else {
          stack.push({
            func_name: funcName,
            lineno: node.loc ? node.loc.start.line : 0,
            locals: locals
          });
      }
    }
  }

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack, 
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined) return { value: 'undefined' };
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