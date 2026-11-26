import { createContext, memo, useContext, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { CheckSquare, ChevronLeft, ChevronRight, CircleHelp, Plus } from "lucide-react";
import type { MindNode } from "@/lib/mindmap-types";
import { nodeSize } from "./layout";
import { NodeVaultActions, NoteIcon } from "./NodeVault";

export type MindNodeData = { node: MindNode; color: string; childCount: number; isRoot: boolean; linkOnly?: boolean };
export type MindFlowNode = Node<MindNodeData, "mind">;

export const MindActions = createContext<{
  rename: (id: string, label: string) => void;
  toggle: (id: string) => void;
  addChild: (id: string) => void;
}>({ rename: () => {}, toggle: () => {}, addChild: () => {} });

function MindNodeCardInner({ data, selected }: NodeProps<MindFlowNode>) {
  const { node, color, childCount, isRoot } = data;
  const actions = useContext(MindActions);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.label);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  const size = nodeSize(node.importance);
  if (data.linkOnly) return <div className="flex max-w-44 items-center rounded-md border bg-card p-2 text-xs text-card-foreground shadow-sm"><Handle type="target" position={Position.Left} />{node.label}<NoteIcon node={node} /></div>;
  const shape =
    node.type === "topic" ? "rounded-2xl" : node.type === "question" ? "rounded-[999px]" : node.type === "detail" ? "rounded-md" : "rounded-xl";
  const weight = node.importance >= 3 ? "font-semibold text-base" : node.importance === 2 ? "font-medium text-sm" : "text-xs";

  function finish() {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== node.label) actions.rename(node.id, v);
    else setDraft(node.label);
  }

  return (
    <div
      className={`group relative flex flex-wrap items-center gap-1.5 border px-3 shadow-sm ${shape} ${weight} ${selected ? "ring-2 ring-ring" : ""} ${node.type === "detail" ? "border-dashed" : ""}`}
      style={{ width: size.w, minHeight: size.h, background: isRoot ? "var(--branch-root)" : color, color: isRoot ? "var(--primary-foreground)" : "var(--branch-ink)", borderColor: "color-mix(in oklch, currentColor 20%, transparent)" }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-muted-foreground/50" />
      {node.type === "action" && <CheckSquare className="h-4 w-4 shrink-0" aria-label="Action" />}
      {node.type === "question" && <CircleHelp className="h-4 w-4 shrink-0" aria-label="Question" />}
      {editing ? (
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={finish}
          onKeyDown={(e) => { if (e.key === "Enter") finish(); if (e.key === "Escape") { setDraft(node.label); setEditing(false); } }}
          className="nodrag w-full rounded bg-background/70 px-1 py-0.5 text-foreground outline-none"
          aria-label="Node label"
        />
      ) : (
        <span className="min-w-0 flex-1 py-2 leading-tight" onDoubleClick={(e) => { e.stopPropagation(); setDraft(node.label); setEditing(true); }}>
          {node.label}
        </span>
      )}
      <NoteIcon node={node} />
      <div className="w-full"><NodeVaultActions node={node} compact /></div>
      {childCount > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); actions.toggle(node.id); }}
          className="nodrag flex h-5 shrink-0 items-center rounded-full bg-background/60 px-1 text-[10px] text-foreground"
          aria-label={node.collapsed ? "Expand branch" : "Collapse branch"}
        >
          {node.collapsed ? <><ChevronRight className="h-3 w-3" />{childCount}</> : <ChevronLeft className="h-3 w-3" />}
        </button>
      )}
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-muted-foreground/50" />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); actions.addChild(node.id); }}
        className="nodrag absolute -right-3 -bottom-3 hidden h-6 w-6 items-center justify-center rounded-full border bg-background text-foreground shadow group-hover:flex"
        style={selected ? { display: "flex" } : undefined}
        aria-label="Add child"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
export const MindNodeCard = memo(MindNodeCardInner);
