import subprocess
import os
import re
import uuid
import json

class CTracer:
    def __init__(self):
        self.trace_data = []

    def run(self, code):
        """
        Compiles and traces the provided C++ code.
        Returns a JSON-serializable list of trace steps.
        """
        self.trace_data = []
        filename = f"temp_{uuid.uuid4().hex}"
        source_file = f"{filename}.cpp"
        exe_file = f"{filename}.exe" if os.name == 'nt' else f"./{filename}.out"

        try:
            # 1. Write Code to File
            with open(source_file, "w") as f:
                f.write(code)

            # 2. Compile
            compile_cmd = ["g++", "-g", "-O0", source_file, "-o", exe_file]
            result = subprocess.run(compile_cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                return [{
                    "event": "error",
                    "error_type": "CompilationError",
                    "error_message": result.stderr
                }]

            # 3. Run GDB
            # We use GDB's Machine Interface (MI) for easier parsing
            gdb_cmd = ["gdb", "--interpreter=mi", "--args", exe_file]
            
            process = subprocess.Popen(
                gdb_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1 # Line buffered
            )

            # Commands to send to GDB
            commands = [
                "-break-insert main",
                "-exec-run",
                # We will loop stepping in the interaction loop
            ]
            
            # Helper to write to GDB
            def send_gdb(cmd):
                process.stdin.write(cmd + "\n")
                process.stdin.flush()

            # Initial setup
            send_gdb("-break-insert main")
            send_gdb("-exec-run")

            # Interaction Loop
            current_line = 0
            step_count = 0
            max_steps = 1000
            
            while step_count < max_steps:
                # Read output until we get a prompt (gdb) or stopping point
                # This is a bit simplified; a real MI parser is complex.
                # We will read line by line and react to *stopped
                
                output_buffer = ""
                while True:
                    line = process.stdout.readline()
                    if not line: break
                    output_buffer += line
                    if line.strip() == "(gdb)":
                        break
                
                # Check for program exit
                if "*stopped,reason=\"exited" in output_buffer or "Program exited" in output_buffer:
                    break
                    
                # Check if we are stopped at a breakpoint or after a step
                if "*stopped" in output_buffer:
                    # Parse current location
                    # match: *stopped,reason="...",frame={...,line="12",...}
                    match = re.search(r'line="(\d+)"', output_buffer)
                    if match:
                        current_line = int(match.group(1))
                        
                        # Get Locals
                        send_gdb("-stack-list-variables --simple-values")
                        # Read response for variables
                        var_output = ""
                        while True:
                             l = process.stdout.readline()
                             var_output += l
                             if l.strip() == "(gdb)": break
                             
                        locals_data = self.parse_vars(var_output)
                        
                        # Get Stack (simplified, just top frame func name)
                        func_match = re.search(r'func="([^"]+)"', output_buffer)
                        func_name = func_match.group(1) if func_match else "?"
                        
                        self.trace_data.append({
                            "line_number": current_line,
                            "stack": [{
                                "func_name": func_name,
                                "lineno": current_line,
                                "locals": locals_data
                            }],
                            "heap": {} # Accessing heap in C++ via GDB is hard, skipping for now
                        })
                    
                    if step_count > 0: # Don't step immediately after run, we are already at main break
                         pass

                    # Next step
                    send_gdb("-exec-next")
                    step_count += 1
                else:
                    # If not stopped, maybe we are still setting up or it's running
                    # But since we look for (gdb) prompt, we should be ready for next command
                    pass

            process.terminate()

        except Exception as e:
            self.trace_data.append({
                 "event": "error",
                 "error_type": "TracerError",
                 "error_message": str(e)
            })
        finally:
            # Cleanup
            if os.path.exists(source_file): os.remove(source_file)
            if os.path.exists(exe_file): os.remove(exe_file)
            # win specific cleanup if needed
            if os.path.exists(f"{filename}.out"): os.remove(f"{filename}.out")

        return self.trace_data

    def parse_vars(self, gdb_output):
        # ^done,variables=[{name="a",type="int",value="1"},{name="b",type="int",value="2"}]
        variables = {}
        try:
            # Find the variables list content
            match = re.search(r'variables=\[(.*?)\]', gdb_output)
            if match:
                content = match.group(1)
                # Split by objects {}
                # This regex is a bit naive for nested objects but works for primitives
                # var_matches = re.findall(r'{name="([^"]+)",type="[^"]+",value="([^"]+)"}', content)
                # Better regex to capture name and value
                
                # Split by }, { 
                items = content.split('},{')
                for item in items:
                    name_match = re.search(r'name="([^"]+)"', item)
                    val_match = re.search(r'value="([^"]+)"', item)
                    
                    if name_match and val_match:
                        name = name_match.group(1)
                        val = val_match.group(1)
                        # Clean up value (remove \n etc)
                        val = val.replace(r'\\n', '')
                        variables[name] = {"value": val}
        except:
            pass
        return variables
