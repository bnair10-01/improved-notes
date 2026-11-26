import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createFolder = vi.fn(async () => "new-id");
vi.mock("@/lib/vault", () => ({
  createFolder: (...a: unknown[]) => (createFolder as (...x: unknown[]) => unknown)(...a),
  useRefreshVault: () => async () => undefined,
  useVault: () => ({ data: { folders: [{ id: "f1", name: "Cell Biology", parent_id: null }], notes: [], links: [] } }),
}));

import { NewTopicDialog } from "./NewTopicDialog";

describe("NewTopicDialog", () => {
  beforeEach(() => createFolder.mockClear());

  it("starts empty and won't create a topic until the person has named it", async () => {
    render(<NewTopicDialog open onOpenChange={() => undefined} />);
    const input = screen.getByLabelText("Topic name") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(screen.getByRole("button", { name: "Create topic" })).toBeDisabled();
  });

  it("creates exactly the name that was typed", async () => {
    const onCreated = vi.fn();
    render(<NewTopicDialog open onOpenChange={() => undefined} onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: "  Astronomy " } });
    fireEvent.click(screen.getByRole("button", { name: "Create topic" }));
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith("Astronomy", null));
    expect(onCreated).toHaveBeenCalledWith("new-id", "Astronomy");
  });

  it("creates one topic even if Create is pressed twice, and doesn't warn about the topic it just made", async () => {
    const folders = [{ id: "f1", name: "Cell Biology", parent_id: null as string | null }];
    createFolder.mockImplementation(async (...a: unknown[]) => { folders.push({ id: "n2", name: String(a[0]), parent_id: null }); await new Promise((r) => setTimeout(r, 30)); return "n2"; });
    render(<NewTopicDialog open onOpenChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: "Astronomy" } });
    const btn = screen.getByRole("button", { name: "Create topic" });
    fireEvent.click(btn); fireEvent.click(btn);
    await waitFor(() => expect(createFolder).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a name that is already a topic", async () => {
    render(<NewTopicDialog open onOpenChange={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Topic name"), { target: { value: "cell biology" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/already have a topic/i);
    expect(screen.getByRole("button", { name: "Create topic" })).toBeDisabled();
    expect(createFolder).not.toHaveBeenCalled();
  });
});
