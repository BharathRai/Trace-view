export function runJsCode(code) {
  const trace = [];
  let stepCount = 0;
  const MAX_STEPS = 10000; // Increased max steps

  const initFunc = (interpreter, globalObject) => {
    const logWrapper = (text) => {
      // Create a new snapshot for output, inheriting the last state
      const lastSnap = trace.length > 0 ? trace[trace.length - 1] : { stack: [], heap: {}, line_number: 0 };
      trace.push({
        event: 'output',
        data: text + '\n',
        stack: lastSnap.stack, // Copy stack
        heap: lastSnap.heap,   // Copy heap
        line_number: lastSnap.line_number
      });
    };

    // Inject console.log and print
    interpreter.setProperty(globalObject, 'console',
      interpreter.nativeToPseudo({ log: logWrapper }));
    interpreter.setProperty(globalObject, 'print',
      interpreter.createNativeFunction(logWrapper));

    // Inject alert for fun/completeness
    interpreter.setProperty(globalObject, 'alert',
      interpreter.createNativeFunction((text) => logWrapper(`[Alert] ${text}`)));
  };

  try {
    if (!window.Interpreter || !window.acorn) {
      throw new Error("JS-Interpreter or Acorn libraries are not loaded. Please restart the application.");
    }

    // Pre-scan for variable names to better filter the scope later
    const variableMap = buildVariableMap(code);

    // Initialize Interpreter
    const myInterpreter = new window.Interpreter(code, initFunc);

    while (myInterpreter.step() && stepCount < MAX_STEPS) {
      stepCount++;

      if (myInterpreter.stateStack.length === 0) break;

      const node = myInterpreter.stateStack[myInterpreter.stateStack.length - 1].node;

      // We only want to snapshot on meaningful statements to reduce noise
      if (node && node.start && node.end && (
        node.type === 'VariableDeclaration' ||
        node.type === 'ExpressionStatement' ||
        node.type === 'ReturnStatement' ||
        node.type === 'ForStatement' || // Entry to for loop
        node.type === 'WhileStatement' ||
        node.type === 'IfStatement' ||
        node.type === 'FunctionDeclaration' ||
        node.type === 'CallExpression' ||
        node.type === 'UpdateExpression' || // i++
        node.type === 'AssignmentExpression' // x = 5
      )) {
        const snapshot = captureState(myInterpreter, node, variableMap);

        // Dedup: Don't push if it's the exact same line as the previous one (unless the state changed significanlty, but here we just check line)
        // A better check would be to see if stack/heap changed, but that's expensive.
        const lastSnap = trace[trace.length - 1];
        if (!lastSnap || lastSnap.line_number !== snapshot.line_number || lastSnap.event === 'output') {
          trace.push(snapshot);
        }
      }
    }

    if (stepCount >= MAX_STEPS) {
      trace.push({
        event: 'error',
        error_type: 'TimeoutError',
        error_message: 'Execution exceeded maximum steps (potential infinite loop).',
        stack: [],
        heap: {}
      });
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

function buildVariableMap(code) {
  const map = { '<global>': new Set() };
  try {
    const ast = window.acorn.parse(code, { ecmaVersion: 2020 });
    const visit = (node, scopeName) => {
      if (!node) return;

      // Function Scope
      if (node.type === 'FunctionDeclaration' && node.id) {
        const funcName = node.id.name;
        map[funcName] = new Set();
        if (node.params) node.params.forEach(p => map[funcName].add(p.name));
        visit(node.body, funcName);
        return;
      }

      // Variable Declarations
      else if (node.type === 'VariableDeclaration') {
        node.declarations.forEach(dec => {
          if (dec.id && dec.id.name) map[scopeName].add(dec.id.name);
        });
      }

      // Traverse children
      for (const key in node) {
        if (key === 'body' && node.type === 'FunctionDeclaration') continue; // Handled above
        if (node[key] && typeof node[key] === 'object') {
          if (Array.isArray(node[key])) node[key].forEach(child => visit(child, scopeName));
          else if (node[key].type) visit(node[key], scopeName);
        }
      }
    };
    visit(ast, '<global>');
  } catch (e) { console.warn("Failed to parse AST for variable mapping:", e); }
  return map;
}

function captureState(interpreter, node, variableMap) {
  const stack = [];
  const heap = {};
  let stateStack = interpreter.stateStack;
  const processedScopes = new Set();

  // Iterate backwards (from top of stack down to global)
  // Interpreter stack structure: [Global, ..., FuncCall, Current]
  // We want to show stack as [Global, ..., Current] usually

  for (let i = 0; i < stateStack.length; i++) {
    const state = stateStack[i];

    // Only capture states that have a scope and seem to be function calls or global
    if (state.scope && (state.func_ || i === 0)) {
      if (processedScopes.has(state.scope)) continue;
      processedScopes.add(state.scope);

      let funcName = 'anonymous';
      if (state.func_ && state.func_.name) funcName = state.func_.name;
      else if (state.func_ && state.func_.node && state.func_.node.id) funcName = state.func_.node.id.name;

      if (i === 0) funcName = 'Global Frame';

      const locals = {};

      // 1. Targeted Extraction using AST Map (Priority)
      // This is cleaner because JS-Interpreter's scopes are messy
      const targetVars = variableMap[funcName] || variableMap['<global>'];
      if (targetVars) {
        targetVars.forEach(varName => {
          try {
            if (interpreter.hasProperty(state.scope, varName)) {
              const val = interpreter.getValueFromScope(state.scope, varName);
              if (val !== interpreter.UNDEFINED) {
                locals[varName] = formatValue(val, heap, interpreter);
              }
            }
          } catch (err) { /* ignore */ }
        });
      }

      // 2. Fallback Extraction (for things missed by AST or dynamic)
      // Only do this if we didn't find much? Or just do it carefully.
      // Let's rely mostly on AST map for cleanness, but check arguments
      if (funcName !== 'Global Frame') {
        // Capture arguments
        // In JS-Interpreter, arguments are in the scope but might be hard to find cleanly
      }

      stack.push({
        func_name: funcName,
        lineno: node.loc ? node.loc.start.line : 0,
        locals: locals
      });
    }
  }

  return {
    line_number: node.loc ? node.loc.start.line : 0,
    stack: stack,
    heap: heap
  };
}

function formatValue(pseudoVal, heap, interpreter) {
  if (pseudoVal === undefined || pseudoVal === interpreter.UNDEFINED) return { value: 'undefined' };
  if (pseudoVal === null) return { value: 'null' };

  try {
    if (interpreter.isa(pseudoVal, interpreter.BOOLEAN)) return { value: String(pseudoVal.data) };
    if (interpreter.isa(pseudoVal, interpreter.NUMBER)) return { value: String(pseudoVal.data) };
    if (interpreter.isa(pseudoVal, interpreter.STRING)) return { value: `"${pseudoVal.data}"` };
    if (interpreter.isa(pseudoVal, interpreter.FUNCTION)) return { value: `fn ${pseudoVal.name || '()'}` };

    if (interpreter.isa(pseudoVal, interpreter.OBJECT)) {
      const id = pseudoVal.id || String(Math.random());
      pseudoVal.id = id;

      let type = 'object';
      let value = {};

      if (interpreter.isa(pseudoVal, interpreter.ARRAY)) {
        type = 'list';
        value = []; // Array for list type
        const length = pseudoVal.properties.length;
        for (let i = 0; i < length; i++) {
          value.push(formatValue(pseudoVal.properties[i], heap, interpreter));
        }
      } else {
        type = 'dict';
        value = {};
        // Iterate properties
        // JS-Interpreter objects store props in .properties
        for (const key in pseudoVal.properties) {
          if (Object.prototype.hasOwnProperty.call(pseudoVal.properties, key)) {
            value[key] = formatValue(pseudoVal.properties[key], heap, interpreter);
          }
        }
      }

      // Add to heap
      if (!heap[id]) {
        heap[id] = { type, value };
      }
      return { ref: id };
    }
  } catch (err) {
    return { value: '<error>' };
  }

  return { value: String(pseudoVal) };
}