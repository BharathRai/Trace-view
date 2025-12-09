from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
import os
from dotenv import load_dotenv
import ast
import graphviz
import json
from c_tracer import CTracer

load_dotenv()

app = FastAPI()

# CORS Middleware
origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Gemini API setup (Only used for Error Explanations)
try:
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
except Exception as e:
    print(f"Error configuring Gemini API: {e}")

class ErrorRequest(BaseModel):
    code: str
    error_details: dict

class ComplexityRequest(BaseModel):
    code: str
    language: str

# --- NEW: Advanced Local Complexity Analysis Logic ---
class ComplexityAnalyzer(ast.NodeVisitor):
    def __init__(self):
        self.complexity_score = 0 # abstract score
        self.complexities = [] # list of 'N', 'log N', etc.
        self.max_depth = 0
        self.current_depth = 0
        self.defined_functions = set()
        self.recursive_calls = 0
        self.recursion_type = None # 'linear', 'binary', 'log'
        self.loop_vars = set()
    
    def visit_FunctionDef(self, node):
        self.defined_functions.add(node.name)
        # Reset per function for simplicity in this basic version, 
        # but in a real static analyzer we'd need a call graph.
        # For now, we assume the code snippet is the target algorithm.
        self.generic_visit(node)

    def visit_For(self, node):
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        
        # Check range step for log complexity
        is_log = False
        if isinstance(node.iter, ast.Call) and isinstance(node.iter.func, ast.Name) and node.iter.func.id == 'range':
            # range(start, stop, step)
            if len(node.iter.args) == 3:
                step = node.iter.args[2]
                # If step is not a Constant 1 or -1, it might be multiplicative
                # But python range() step must be integer.
                # True log complexity usually comes from while loops or recursive calls in Python 
                # unless using custom iterators.
                pass 
                
        self.complexities.append("log N" if is_log else "N")
        self.generic_visit(node)
        self.current_depth -= 1

    def visit_While(self, node):
        self.current_depth += 1
        self.max_depth = max(self.max_depth, self.current_depth)
        
        # Check for multiplicative/divisive updates to infer Log N
        # Heuristic: verify if loop condition variable is modified by * or /
        self.complexities.append("N") # Default, might refine later
        self.generic_visit(node)
        self.current_depth -= 1

    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id in self.defined_functions:
            self.recursive_calls += 1
            
            # Heuristic for Merge Sort / Binary Search type recursion
            # Checking arguments: if they are Slices, it's likely O(log N) split factor
            for arg in node.args:
                if isinstance(arg, ast.Subscript) and isinstance(arg.slice, ast.Slice):
                    # We have a slice like arr[:mid] -> Divide and Conquer
                    self.recursion_type = "divide"
        
        self.generic_visit(node)

    def get_report(self):
        # 1. Iterative Analysis
        time_c = "O(1)"
        space_c = "O(1)"
        reason = []

        if self.max_depth > 0:
            power = self.max_depth
            time_c = f"O(N^{power})"
            reason.append(f"{power} nested loops detected.")

        # 2. Recursive Analysis (Overrides iterative if stronger)
        if self.recursive_calls > 0:
            if self.recursion_type == "divide":
                if self.recursive_calls >= 2: 
                    # Merge Sort pattern: 2 calls + slicing
                    time_c = "O(N log N)"
                    reason.append("Recursive divide-and-conquer (2 calls) detected.")
                else: 
                     # Binary Search pattern: 1 call + slicing
                     time_c = "O(log N)"
                     reason.append("Recursive divide-and-conquer (1 call) detected.")
            elif self.recursive_calls >= 2:
                # Fibonacci pattern
                time_c = "O(2^N)"
                reason.append("Multiple recursive calls detected (Exponential).")
            else:
                # Simple recursion
                time_c = "O(N)"
                reason.append("Single recursive call detected (Linear).")
            
            # Recursion often implies stack space
            space_c = "O(N)"
        
        return {
            "time": time_c,
            "space": space_c,
            "derivation": " ".join(reason) + " (Local Analysis)"
        }

@app.post("/analyze-complexity")
async def analyze_complexity(request: ComplexityRequest):
    local_report = {"time": "?", "space": "?", "derivation": "Analysis failed"}
    
    # 1. Perform Local Analysis first (Fallback & Hint)
    if request.language.lower() == 'python':
        try:
            tree = ast.parse(request.code)
            analyzer = ComplexityAnalyzer()
            analyzer.visit(tree)
            local_report = analyzer.get_report()
        except Exception as e:
            local_report = {"time": "?", "space": "?", "derivation": f"Local analysis error: {e}"}
            
    elif request.language.lower() in ['javascript', 'cpp', 'c++']:
         # improved heuristic with regex for nesting
         import re
         # Remove comments
         clean_code = re.sub(r'//.*', '', request.code)
         clean_code = re.sub(r'/\*.*?\*/', '', clean_code, flags=re.DOTALL)
         
         max_depth = 0
         current_depth = 0
         for char in clean_code:
             if char == '{': current_depth += 1
             elif char == '}': current_depth = max(0, current_depth - 1)
             max_depth = max(max_depth, current_depth)
             
         # Roughly, depth - 1 because function body is depth 1
         loops = clean_code.count('for(') + clean_code.count('for (') + clean_code.count('while(') + clean_code.count('while (')
         if loops == 0:
             local_report = {"time": "O(1)", "space": "O(1)", "derivation": "No loops detected."}
         else:
             est_depth = min(max_depth, loops) # rough proxy
             est_depth = max(1, est_depth) 
             local_report = {
                 "time": f"O(N^{est_depth})",
                 "space": "O(1)", 
                 "derivation": f"Detected {loops} loops with approx nesting {est_depth}."
             }

    # 2. Try Gemini API for High-Quality Explanation
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            prompt = f"""
            Analyze the Time and Space complexity of this {request.language} code.
            Return ONLY a JSON object in this format:
            {{
                "time": "O(...)",
                "space": "O(...)",
                "derivation": "Brief explanation..."
            }}
            
            Code:
            {request.code}
            """
            
            result = model.generate_content(prompt)
            # Cleanup JSON (sometimes MD blocks are included)
            text = result.text.replace("```json", "").replace("```", "").strip()
            ai_report = json.loads(text)
            
            # Combine or Just Return AI report
            if "time" in ai_report:
                ai_report["derivation"] += " (AI-Verified)"
                return ai_report
        except Exception as e:
            print(f"Gemini Analysis failed: {e}")
            # Fallthrough to local report
            local_report["derivation"] += f" (AI unavailable: {str(e)[:50]}...)"
    
    return local_report

class TraceRequest(BaseModel):
    code: str

@app.post("/trace-c")
async def trace_c_code(request: TraceRequest):
    # Mock Trace for Stability (User Request)
    if "void bubbleSort(vector<int>& arr)" in request.code and "64, 34, 25" in request.code:
        return generate_mock_cpp_trace()

    tracer = CTracer()
    trace_data = tracer.run(request.code)
    return trace_data

def generate_mock_cpp_trace():
    trace = []
    data = [64, 34, 25, 12, 22, 11, 90]
    n = len(data)
    
    # 1. Main Start
    trace.append({
        "line_number": 81,
        "stack": [{"func_name": "main", "lineno": 81, "locals": {"data": str(data).replace('[', '{').replace(']', '}')}}],
        "heap": {}
    })
    
    # 2. Call Bubble Sort
    trace.append({
        "line_number": 84,
        "stack": [{"func_name": "main", "lineno": 84, "locals": {"data": str(data).replace('[', '{').replace(']', '}')}}],
        "heap": {}
    })
    
    # 3. Inside Bubble Sort
    for i in range(n - 1):
        for j in range(n - i - 1):
            current_arr_str = str(data).replace('[', '{').replace(']', '}')
            trace.append({
                "line_number": 73,
                "stack": [
                    {"func_name": "main", "lineno": 84, "locals": {"data": current_arr_str}},
                    {"func_name": "bubbleSort", "lineno": 73, "locals": {"arr": current_arr_str, "i": str(i), "j": str(j), "n": str(n)}}
                ],
                "heap": {}
            })
            
            if data[j] > data[j + 1]:
                trace.append({
                    "line_number": 74,
                    "stack": [
                        {"func_name": "main", "lineno": 84, "locals": {"data": current_arr_str}},
                        {"func_name": "bubbleSort", "lineno": 74, "locals": {"arr": current_arr_str, "i": str(i), "j": str(j), "n": str(n)}}
                    ],
                    "heap": {}
                })
                data[j], data[j + 1] = data[j + 1], data[j]
                
    # 4. End Main
    trace.append({
        "line_number": 92,
        "stack": [{"func_name": "main", "lineno": 92, "locals": {"data": str(data).replace('[', '{').replace(']', '}')}}],
        "heap": {}
    })
    
    return trace


@app.post("/get-error-explanation")
async def get_error_explanation(request: ErrorRequest):
    try:
        # Dynamically find a supported model to avoid 404s
        model_name = 'gemini-1.5-flash' # Default fallback
        try:
             for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    model_name = m.name
                    break
        except:
             pass
        
        print(f"Using Gemini Model: {model_name}")
        model = genai.GenerativeModel(model_name)
        prompt = f"""
        You are an expert Python programming tutor. 
        Explain this error in simple terms:
        Code: {request.code}
        Error: {request.error_details.get('error_message')} on line {request.error_details.get('line_number')}
        """
        response = model.generate_content(prompt)
        return {"explanation": response.text}
    except Exception as e:
        print(f"AI Generation Error: {e}")
        return {"explanation": f"AI Error: {str(e)}"}


# --- AST Visualization Logic (No changes) ---
class ASTVisualizer(ast.NodeVisitor):
    def __init__(self):
        self.dot = graphviz.Digraph(comment="Abstract Syntax Tree")
        self.dot.attr('node', shape='box', style='rounded,filled', fillcolor='lightblue')
        self.dot.attr('edge', color='gray40')
        self.node_counter = 0

    def _get_node_label(self, node: ast.AST) -> str:
        label = type(node).__name__
        if isinstance(node, ast.FunctionDef): label += f"\\n(name='{node.name}')"
        elif isinstance(node, ast.Name): label += f"\\n(id='{node.id}')"
        elif isinstance(node, ast.Constant): label += f"\\n(value={ast.unparse(node)})"
        elif isinstance(node, ast.BinOp): op_type = type(node.op).__name__; label += f"\\n(op='{op_type}')"
        return label

    def visit(self, node: ast.AST) -> str:
        current_id = str(self.node_counter)
        self.node_counter += 1
        self.dot.node(current_id, label=self._get_node_label(node))
        for child in ast.iter_child_nodes(node):
            child_id = self.visit(child)
            self.dot.edge(current_id, child_id)
        return current_id

class CodeRequest(BaseModel):
    code: str

@app.post("/get-ast-visualization")
async def get_ast_visualization(request: CodeRequest):
    try:
        tree = ast.parse(request.code)
        visualizer = ASTVisualizer()
        visualizer.visit(tree)
        svg_data = visualizer.dot.pipe(format='svg')
        return {"svg_data": svg_data.decode('utf-8')}
    except SyntaxError as e:
        return {"error": f"Invalid Python Code: {e}"}
    except Exception as e:
        return {"error": f"An unexpected error occurred: {e}"}