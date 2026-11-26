import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/vault", () => ({ useVault: () => ({ data: { notes: [], folders: [], links: [] } }), openTarget: () => ({ to: "/" }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("@/lib/ai/tasks", () => ({ askNotes: vi.fn() }));

import { PartTabs } from "./PartTabs";
import type { Part } from "@/lib/model3d";

const part: Part = { id: "p1", name: "Inner Membrane", description: "Houses the electron transport chain.", group: "g", shape: "capsule", size: [1, 1, 1], position: [0, 0, 0], rotation: [0, 0, 0], color: "#fff", explode_direction: [0, 1, 0], assembly_order: 1 };

describe("PartTabs notes", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps every character while typing fast, and saves once typing pauses", () => {
    const onNote = vi.fn();
    render(<PartTabs part={part} modelTitle="Mitochondria" editable onNote={onNote} />);
    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    const box = screen.getByPlaceholderText("Your own notes on this part") as HTMLTextAreaElement;
    for (const text of ["W", "Wh", "Where ", "Where the ", "Where the proton gradient is built."]) fireEvent.change(box, { target: { value: text } });
    expect(box.value).toBe("Where the proton gradient is built.");
    expect(onNote).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(700); });
    expect(onNote).toHaveBeenCalledTimes(1);
    expect(onNote).toHaveBeenCalledWith("Where the proton gradient is built.");
  });

  it("saves straight away when the box loses focus", () => {
    const onNote = vi.fn();
    render(<PartTabs part={part} modelTitle="Mitochondria" editable onNote={onNote} />);
    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    const box = screen.getByPlaceholderText("Your own notes on this part");
    fireEvent.change(box, { target: { value: "Matrix side" } });
    fireEvent.blur(box);
    expect(onNote).toHaveBeenCalledWith("Matrix side");
  });
});
