# frontend/src/python/tracer.py
import sys
import json
from io import StringIO

def trace_function(frame, event, arg):
    if event == 'line':
        heap = {}
        
        def format_value(value):
            value_id = id(value)
            if isinstance(value, (list, tuple, dict)):
                if value_id not in heap:
                    if isinstance(value, (list, tuple)):
                        heap[value_id] = {"type": type(value).__name__, "value": [format_value(v) for v in value]}
                    elif isinstance(value, dict):
                        heap[value_id] = {"type": 'dict', "value": {repr(k): format_value(v) for k,v in value.items()}}
                return {"ref": value_id}
            return {"value": repr(value)}

        call_stack = []
        current_frame = frame
        while current_frame:
            # --- THIS IS THE KEY CHANGE ---
            # Only trace frames that are part of the user's code (executed from '<string>')
            if current_frame.f_code.co_filename == '<string>':
                func_name = current_frame.f_code.co_name or "<module>"
                
                formatted_locals = {
                    k: format_value(v) for k, v in current_frame.f_locals.items()
                    if not k.startswith('__') # Basic filter for internal names
                }
                
                call_stack.append({
                    "func_name": func_name,
                    "lineno": current_frame.f_lineno,
                    "locals": formatted_locals
                })
            current_frame = current_frame.f_back
        
        call_stack.reverse()

        snapshot = {'line_number': frame.f_lineno, 'stack': call_stack, 'heap': heap}
        execution_trace.append(snapshot)
    
    return trace_function

# --- Boilerplate (no changes from here down) ---
execution_trace = []
def run_user_code(code_string):
    global execution_trace
    execution_trace = []
    
    old_stdout = sys.stdout
    redirected_output = sys.stdout = StringIO()
    
    sys.settrace(trace_function)
    try:
        # We compile the code to ensure its filename is '<string>'
        compiled_code = compile(code_string, '<string>', 'exec')
        exec(compiled_code, {})
    except Exception as e:
        snapshot = {'event': 'error', 'line_number': sys.exc_info()[2].tb_lineno, 'error_type': type(e).__name__, 'error_message': str(e)}
        execution_trace.append(snapshot)
    finally:
        sys.settrace(None)
        sys.stdout = old_stdout

    output = redirected_output.getvalue()
    if output:
        execution_trace.append({'event': 'output', 'data': output})

    return json.dumps(execution_trace)