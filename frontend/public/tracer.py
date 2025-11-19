import sys
import json
from io import StringIO
import ast

# --- 1. TRACING LOGIC (This was missing) ---
execution_trace = []

def trace_function(frame, event, arg):
    if event == 'line':
        # Data Gathering
        heap = {}
        
        def format_value(value):
            """
            Recursively process values. If it's a complex object, add it to the
            heap and return a reference ID. Otherwise, return its representation.
            """
            value_id = id(value)
            
            # For lists, tuples, and dicts, add them to the heap
            if isinstance(value, (list, tuple, dict)):
                if value_id not in heap:
                    if isinstance(value, (list, tuple)):
                        heap[value_id] = {"type": type(value).__name__, "value": [format_value(v) for v in value]}
                    elif isinstance(value, dict):
                         heap[value_id] = {"type": 'dict', "value": {repr(k): format_value(v) for k,v in value.items()}}
                return {"ref": value_id}
            
            # For primitives, just return their string representation
            return {"value": repr(value)}

        # Stack Processing
        call_stack = []
        current_frame = frame
        while current_frame:
            # Only trace frames that are part of the user's code (executed from '<string>')
            if current_frame.f_code.co_filename == '<string>':
                func_name = current_frame.f_code.co_name or "<module>"
                
                # Filter out internal variables and format the rest
                formatted_locals = {
                    k: format_value(v) for k, v in current_frame.f_locals.items() 
                    if not k.startswith('__')
                }
                
                call_stack.append({
                    "func_name": func_name,
                    "lineno": current_frame.f_lineno,
                    "locals": formatted_locals
                })
            current_frame = current_frame.f_back
        
        call_stack.reverse()

        # Final Snapshot
        snapshot = {
            'line_number': frame.f_lineno,
            'stack': call_stack,
            'heap': heap
        }
        execution_trace.append(snapshot)
    
    return trace_function

# --- 2. EXECUTION HANDLER ---
def run_user_code(code_string):
    global execution_trace
    execution_trace = []
    
    old_stdout = sys.stdout
    redirected_output = sys.stdout = StringIO()
    
    sys.settrace(trace_function)
    try:
        # We compile the code to ensure its filename is '<string>'
        # This is critical for the filter in trace_function to work!
        compiled_code = compile(code_string, '<string>', 'exec')
        exec(compiled_code, {})
    except Exception as e:
        snapshot = {
            'event': 'error', 
            'line_number': sys.exc_info()[2].tb_lineno if sys.exc_info()[2] else 0, 
            'error_type': type(e).__name__, 
            'error_message': str(e)
        }
        execution_trace.append(snapshot)
    finally:
        sys.settrace(None)
        sys.stdout = old_stdout

    output = redirected_output.getvalue()
    if output:
        execution_trace.append({'event': 'output', 'data': output})

    return json.dumps(execution_trace)

# --- 3. COMPLEXITY ANALYZER (Optional, used if you want client-side analysis) ---
def analyze_complexity(code):
    try:
        tree = ast.parse(code)
        complexity_data = {'time': 'O(1)', 'space': 'O(1)'}
        
        def visit(node):
            nonlocal complexity_data
            if isinstance(node, (ast.For, ast.While)):
                if complexity_data['time'] == 'O(1)': 
                    complexity_data['time'] = 'O(N)'
                    complexity_data['space'] = 'O(N)'
            
            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in ['fibonacci', 'merge_sort']:
                     complexity_data['time'] = 'O(2^N) or O(N log N)'
                     complexity_data['space'] = 'O(N)'

            for child in ast.iter_child_nodes(node):
                visit(child)
        
        visit(tree)
        return complexity_data
    except:
        return {'time': '?', 'space': '?'}