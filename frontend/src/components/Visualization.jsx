import { useState, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background } from 'reactflow';
import 'reactflow/dist/style.css';
import ReactMarkdown from 'react-markdown';

// --- A cleaner FrameNode component ---
const FrameNode = ({ data }) => {
    // A list of variables to always ignore in the display
    const IGNORED_VARS = ['__builtins__', 'tracer', 'user_code', 'run_user_code', 'trace_json'];

    return (
        <div style={{ background: '#2a2a2a', border: data.isExecuting ? '2px solid #34d399' : '1px solid #777', boxShadow: data.isExecuting ? '0 0 10px #34d399' : 'none', borderRadius: '5px', color: '#eee' }}>
            <div style={{ padding: '5px 10px', borderBottom: '1px solid #555', backgroundColor: '#333' }}>
                <strong>{data.title}</strong>
            </div>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <tbody>
                    {data.variables.filter(v => !IGNORED_VARS.includes(v.name)).map(v => (
                        <tr key={v.name} style={{ borderTop: '1px solid #444' }}>
                            <td style={{ padding: '4px 8px', width: '40%' }}>{v.name}</td>
                            <td style={{ padding: '4px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{v.value}</span>
                                {v.hasRef && <div style={{ width: 10, height: 10, background: 'cyan', borderRadius: '50%', border: '1px solid #222' }} />}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


// --- A cleaner HeapNode component ---
const HeapNode = ({ data }) => (
    <div style={{ background: '#333', border: '1px solid #777', borderRadius: '5px', color: '#eee' }}>
        <div style={{ padding: '2px 5px', borderBottom: '1px solid #555', backgroundColor: '#444', color: '#aaa', fontSize: '0.8em' }}>
            {data.type}
        </div>
        <div style={{ display: 'flex', padding: '5px' }}>
            {data.items.map((item, index) => (
                <div key={index} style={{ border: '1px solid #666', padding: '5px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.7em', color: '#999' }}>{index}</div>
                    <div>{item.value}</div>
                </div>
            ))}
        </div>
    </div>
);


const nodeTypes = { frame: FrameNode, heap: HeapNode };

// This function now has less to do because the data is cleaner
const generateFlowElements = (traceStep) => {
    if (!traceStep || !traceStep.stack) return { nodes: [], edges: [] };

    let nodes = [];
    let edges = [];
    const { stack, heap, line_number } = traceStep;

    // Process HEAP objects
    Object.entries(heap).forEach(([id, obj], index) => {
        const isList = obj.type === 'list' || obj.type === 'tuple';
        let items = isList ? obj.value.map(v => ({ value: v.value ?? '→' })) : [];
        // Note: Dict visualization is omitted for simplicity but could be added here
        
        nodes.push({ id: `heap-${id}`, type: 'heap', position: { x: 500, y: 50 + index * 100 }, data: { type: obj.type, items: items } });
    });

    // Process STACK frames
    stack.forEach((frame, frameIndex) => {
        const frameId = `frame-${frameIndex}`;
        const variables = Object.entries(frame.locals).map(([name, data]) => ({
            name: name,
            value: data.value ?? '→',
            hasRef: !!data.ref,
        }));

        nodes.push({
            id: frameId,
            type: 'frame',
            position: { x: frameIndex === 0 ? 50 : 250, y: 50 + (frameIndex > 0 ? (frameIndex - 1) * 200 : 0) },
            data: {
                title: frame.func_name === '<module>' ? 'Global Frame' : frame.func_name,
                variables: variables,
                isExecuting: frame.lineno === line_number && frame.func_name !== '<module>'
            }
        });

        // Create edges for references
        Object.entries(frame.locals).forEach(([name, data]) => {
            if (data.ref) {
                edges.push({ id: `edge-${frameId}-${name}`, source: frameId, target: `heap-${data.ref}`, type: 'smoothstep', markerEnd: { type: 'arrowclosed' } });
            }
        });
    });

    return { nodes, edges };
};


// --- The Main Visualization Component (no major changes below) ---
function Visualization({ traceStep, error }) {
    const [elements, setElements] = useState({ nodes: [], edges: [] });

    useEffect(() => {
        if (traceStep && traceStep.stack) {
            setElements(generateFlowElements(traceStep));
        } else if (!error) {
            setElements({ nodes: [], edges: [] });
        }
    }, [traceStep, error]);

    if (error) {
        return (
            <div className="error-container">
                <h2 className="error-title">🚨 An Error Occurred!</h2>
                <p className="error-details">{error.details || error.error_message}</p>
                <div className="ai-hint-divider" />
                <div>
                    <h3 className="ai-hint-title">💡 AI Assistant</h3>
                    <ReactMarkdown>{error.aiHint || 'Thinking...'}</ReactMarkdown>
                </div>
            </div>
        );
    }

    if (traceStep && traceStep.event === 'output') {
        return (
            <div className="viz-section">
                <h2>Program Output</h2>
                <div className="viz-box" style={{backgroundColor: '#111', color: '#eee', whiteSpace: 'pre-wrap'}}>
                    {traceStep.data}
                </div>
            </div>
        );
    }
    
    return (
        <div style={{ height: '100%', width: '100%' }}>
            <ReactFlow nodes={elements.nodes} edges={elements.edges} nodeTypes={nodeTypes} fitView>
                <MiniMap />
                <Controls />
                <Background />
            </ReactFlow>
        </div>
    );
}

export default Visualization;