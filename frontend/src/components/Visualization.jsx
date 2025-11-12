import { useState, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import ReactMarkdown from 'react-markdown';
import dagre from 'dagre';

// --- Helper Components ---
const FrameNode = ({ data }) => {
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
                                
                                {v.hasRef && (
                                    <Handle
                                        type="source"
                                        position={Position.Right}
                                        id={v.handleId} // This ID must match the edge's sourceHandle
                                        style={{ background: '#00BFFF', width: 10, height: 10 }}
                                    />
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

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

// --- Dagre Layout Function ---
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 300;
const nodeHeight = 200;
const getLayoutedElements = (nodes, edges, direction = 'LR') => {
  dagreGraph.setGraph({ rankdir: direction, nodesep: 20, ranksep: 70 });
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });
  dagre.layout(dagreGraph);
  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };
  });
  return { nodes, edges };
};

// --- Main Data Processing Function ---
const generateFlowElements = (traceStep) => {
    if (!traceStep || !traceStep.stack) return { nodes: [], edges: [] };

    let nodes = [];
    let edges = [];
    const { stack, heap, line_number } = traceStep;

    // Process HEAP objects
    Object.entries(heap).forEach(([id, obj], index) => {
        const isList = obj.type === 'list' || obj.type === 'tuple';
        let items = isList ? obj.value.map(v => ({ value: v.value ?? '→' })) : [];
        nodes.push({ 
            id: `heap-${id}`, 
            type: 'heap', 
            data: { type: obj.type, items: items }
        });
    });

    // Process STACK frames
    stack.forEach((frame, frameIndex) => {
        const frameId = `frame-${frameIndex}`;
        const variables = Object.entries(frame.locals).map(([name, data]) => ({
            name: name,
            value: data.value ?? '→',
            hasRef: !!data.ref,
            handleId: `handle-${frameId}-${name}` // Create a unique handle ID
        }));

        nodes.push({
            id: frameId,
            type: 'frame',
            data: {
                title: frame.func_name === '<module>' ? 'Global Frame' : frame.func_name,
                variables: variables,
                isExecuting: frame.lineno === line_number && frame.func_name !== '<module>'
            }
        });

        // Create edges with the correct sourceHandle
        Object.entries(frame.locals).forEach(([name, data]) => {
            if (data.ref) {
                const handleId = `handle-${frameId}-${name}`; // Must match the one above
                edges.push({
                    id: `edge-${frameId}-${name}`,
                    source: frameId,
                    sourceHandle: handleId,
                    target: `heap-${data.ref}`,
                    type: 'smoothstep',
                    markerEnd: { type: 'arrowclosed' },
                    style: { stroke: '#00BFFF' }
                });
            }
        });
    });

    return getLayoutedElements(nodes, edges);
};

// --- Main Visualization Component ---
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
            <ReactFlow 
                nodes={elements.nodes} 
                edges={elements.edges} 
                nodeTypes={nodeTypes} 
                fitView
            >
                <MiniMap />
                <Controls />
                <Background />
            </ReactFlow>
        </div>
    );
}

export default Visualization;